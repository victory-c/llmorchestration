// Audio generation pipeline. Fans out TTS + upload per message chunk using
// Promise.allSettled so a single failed clip does not fail the whole run.
//
// Called from:
//   - the `generate-audio` job handler (full-run synthesis)
//   - the regenerate API (single-clip retry)
//
// Persists media_assets rows row-by-row so the UI can show partial progress.

import { nanoid } from "nanoid";
import type { TTSProvider, TTSResponse } from "@/server/tts/types";
import type { StorageProvider } from "@/server/storage/types";
import type { MediaAssetRepository, MediaAsset } from "@/server/media/types";
import type {
  RunParticipant,
  TranscriptMessage,
} from "@/server/engine/types";
import { chunkForTTS } from "@/server/tts/chunk";
import {
  defaultVoiceForParticipant,
  findVoice,
} from "@/server/tts/voiceCatalog";
import { logTTSCall } from "@/server/cost/logUsage";
import { getEnv } from "@/lib/env";

type VoiceProfileJson = {
  provider?: "mock" | "elevenlabs";
  voiceId?: string;
  displayName?: string;
  style?: string;
};

type MessageInput = Pick<
  TranscriptMessage,
  "id" | "runId" | "content" | "speakerType" | "displayName" | "participantId"
>;

export type GenerateAudioDeps = {
  tts: TTSProvider;
  storage: StorageProvider;
  assets: MediaAssetRepository;
  // Hook so tests can bypass the Node filesystem / network.
  logger?: {
    warn?: (msg: string, meta?: Record<string, unknown>) => void;
    error?: (msg: string, meta?: Record<string, unknown>) => void;
  };
};

export type GenerateAudioSummary = {
  runId: string;
  clipsRequested: number;
  clipsReady: number;
  clipsFailed: number;
  totalCostUsd: number;
};

function voiceForParticipant(
  participant: RunParticipant | undefined,
  fallbackDisplayName: string,
  providerName: "mock" | "elevenlabs",
): { voiceId: string; style?: string } {
  const vp = (participant as unknown as { voiceProfile?: VoiceProfileJson })
    ?.voiceProfile;
  if (vp?.voiceId && findVoice(vp.voiceId)) {
    return { voiceId: vp.voiceId, style: vp.style };
  }
  const def = defaultVoiceForParticipant(
    participant?.displayName ?? fallbackDisplayName,
    providerName,
  );
  return { voiceId: def.voiceId, style: def.style };
}

export async function generateAudioForRun(options: {
  runId: string;
  messages: MessageInput[];
  participants: RunParticipant[];
  deps: GenerateAudioDeps;
}): Promise<GenerateAudioSummary> {
  const env = getEnv();
  const ttsProviderName = env.TTS_PROVIDER === "elevenlabs"
    ? "elevenlabs"
    : "mock";

  const { runId, messages, participants, deps } = options;
  const participantById = new Map(participants.map((p) => [p.id, p]));

  let clipsRequested = 0;
  let clipsReady = 0;
  let clipsFailed = 0;
  let totalCostUsd = 0;

  // Only synthesize actor messages (judge summaries intentionally silent —
  // they are displayed as on-screen text in the video storyboard).
  const actorMessages = messages.filter((m) => m.speakerType === "actor");

  // Flatten to (message, chunk) tasks.
  const tasks: Array<{
    message: MessageInput;
    participant?: RunParticipant;
    sequenceIndex: number;
    text: string;
  }> = [];

  for (const m of actorMessages) {
    const chunks = chunkForTTS(m.content);
    for (const c of chunks) {
      tasks.push({
        message: m,
        participant: m.participantId
          ? participantById.get(m.participantId)
          : undefined,
        sequenceIndex: c.sequenceIndex,
        text: c.text,
      });
    }
  }

  clipsRequested = tasks.length;

  // Create pending rows up-front so the UI shows "pending" spinners.
  const pendingAssets: MediaAsset[] = [];
  for (const t of tasks) {
    const asset = await deps.assets.create({
      id: nanoid(),
      runId,
      messageId: t.message.id,
      type: "audio-clip",
      storageKey: audioKey(runId, t.message.id, t.sequenceIndex),
      status: "processing",
      sequenceIndex: t.sequenceIndex,
    });
    pendingAssets.push(asset);
  }

  const results = await Promise.allSettled(
    tasks.map((t, i) =>
      synthesizeOne({
        asset: pendingAssets[i],
        task: t,
        ttsProviderName,
        deps,
      }),
    ),
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const asset = pendingAssets[i];
    if (r.status === "fulfilled") {
      clipsReady++;
      totalCostUsd += r.value.estimatedCostUsd;
      logTTSCall({
        runId,
        provider: ttsProviderName,
        estimatedCostUsd: r.value.estimatedCostUsd,
        latencyMs: r.value.latencyMs,
        metadata: {
          assetId: asset.id,
          messageId: asset.messageId,
          chars: tasks[i].text.length,
        },
      });
    } else {
      clipsFailed++;
      deps.logger?.warn?.("audio clip failed", {
        runId,
        assetId: asset.id,
        messageId: asset.messageId,
        reason: (r.reason as Error)?.message,
      });
    }
  }

  return {
    runId,
    clipsRequested,
    clipsReady,
    clipsFailed,
    totalCostUsd,
  };
}

async function synthesizeOne(options: {
  asset: MediaAsset;
  task: {
    message: MessageInput;
    participant?: RunParticipant;
    sequenceIndex: number;
    text: string;
  };
  ttsProviderName: "mock" | "elevenlabs";
  deps: GenerateAudioDeps;
}): Promise<{ estimatedCostUsd: number; latencyMs: number }> {
  const { asset, task, ttsProviderName, deps } = options;
  const voice = voiceForParticipant(
    task.participant,
    task.message.displayName,
    ttsProviderName,
  );

  const start = Date.now();
  let ttsRes: TTSResponse;
  try {
    ttsRes = await deps.tts.synthesize({
      text: task.text,
      voiceId: voice.voiceId,
      style: voice.style,
      metadata: {
        runId: task.message.runId,
        messageId: task.message.id,
        participantId: task.message.participantId,
        chunkIndex: task.sequenceIndex,
      },
    });
  } catch (err) {
    await deps.assets.update(asset.id, {
      status: "failed",
      failedReason: (err as Error).message,
    });
    throw err;
  }

  try {
    const putResult = await deps.storage.put(
      asset.storageKey,
      ttsRes.bytes,
      ttsRes.contentType,
    );
    await deps.assets.update(asset.id, {
      status: "ready",
      url: putResult.url,
      contentType: ttsRes.contentType,
      sizeBytes: putResult.sizeBytes,
      durationMs: ttsRes.durationMs,
      failedReason: undefined,
    });
  } catch (err) {
    await deps.assets.update(asset.id, {
      status: "failed",
      failedReason: (err as Error).message,
    });
    throw err;
  }

  return {
    estimatedCostUsd: ttsRes.estimatedCostUsd,
    latencyMs: Date.now() - start,
  };
}

export async function regenerateAudioClip(options: {
  assetId: string;
  message: MessageInput;
  participant?: RunParticipant;
  chunkText: string;
  deps: GenerateAudioDeps;
}): Promise<MediaAsset> {
  const env = getEnv();
  const ttsProviderName = env.TTS_PROVIDER === "elevenlabs"
    ? "elevenlabs"
    : "mock";

  const existing = await options.deps.assets.findById(options.assetId);
  if (!existing) throw new Error(`Asset not found: ${options.assetId}`);

  await options.deps.assets.update(options.assetId, {
    status: "processing",
    failedReason: undefined,
  });

  const voice = voiceForParticipant(
    options.participant,
    options.message.displayName,
    ttsProviderName,
  );

  let ttsRes: TTSResponse;
  try {
    ttsRes = await options.deps.tts.synthesize({
      text: options.chunkText,
      voiceId: voice.voiceId,
      style: voice.style,
      metadata: {
        runId: options.message.runId,
        messageId: options.message.id,
        participantId: options.message.participantId,
        chunkIndex: existing.sequenceIndex,
      },
    });
  } catch (err) {
    await options.deps.assets.update(options.assetId, {
      status: "failed",
      failedReason: (err as Error).message,
    });
    throw err;
  }

  const putResult = await options.deps.storage.put(
    existing.storageKey,
    ttsRes.bytes,
    ttsRes.contentType,
  );
  return options.deps.assets.update(options.assetId, {
    status: "ready",
    url: putResult.url,
    contentType: ttsRes.contentType,
    sizeBytes: putResult.sizeBytes,
    durationMs: ttsRes.durationMs,
    failedReason: undefined,
  });
}

function audioKey(
  runId: string,
  messageId: string | undefined,
  sequenceIndex: number,
): string {
  const safeMsg = messageId ?? "unknown";
  return `runs/${runId}/audio/${safeMsg}-${sequenceIndex}.mp3`;
}
