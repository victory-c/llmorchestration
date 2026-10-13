import { NextResponse } from "next/server";
import { z } from "zod";
import { getMediaAssets } from "@/server/media";
import { getRunStore } from "@/server/store";
import { getTTSProvider } from "@/server/tts";
import { getStorage } from "@/server/storage";
import { regenerateAudioClip } from "@/server/media/generateAudio";
import { chunkForTTS } from "@/server/tts/chunk";
import { getEnv } from "@/lib/env";
import { checkRunOwnership } from "@/server/store/ownerAuth";
import { getClientIp } from "@/server/safety/rateLimit";
import { checkDailyMediaLimit } from "@/server/safety/dbRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({}).optional();

// Regenerates a single failed audio clip in place. Reuses the storage key so
// the URL stays stable. Ready or in-flight clips are refused: each call is a
// paid synchronous TTS request, and the run owner is whoever created the run.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const env = getEnv();
  if (env.DISABLE_TTS_GENERATION) {
    return NextResponse.json(
      { error: "Audio generation is disabled (DISABLE_TTS_GENERATION=true)." },
      { status: 403 },
    );
  }
  if (env.GLOBAL_AI_KILL_SWITCH) {
    return NextResponse.json(
      { error: "Paid calls are disabled (GLOBAL_AI_KILL_SWITCH=true)." },
      { status: 403 },
    );
  }

  // Body is currently empty — schema is in place so we can accept overrides
  // (e.g. alternate voice) without breaking clients later.
  try {
    bodySchema.parse(await req.json().catch(() => ({})));
  } catch (e) {
    return NextResponse.json(
      { error: `Invalid body: ${(e as Error).message}` },
      { status: 400 },
    );
  }

  const { id: assetId } = await params;
  const assets = getMediaAssets();
  const asset = await assets.findById(assetId);
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  // Enforce run ownership before any paid regeneration, matching the sibling
  // run routes (audio/video/cancel). Guards against authz bypass + TTS cost abuse.
  if (!(await checkRunOwnership(asset.runId, req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (asset.type !== "audio-clip") {
    return NextResponse.json(
      { error: `Regenerate is only supported for audio-clip assets (got ${asset.type}).` },
      { status: 400 },
    );
  }
  if (!asset.messageId) {
    return NextResponse.json(
      { error: "Asset is not linked to a message." },
      { status: 400 },
    );
  }
  if (asset.status !== "failed") {
    return NextResponse.json(
      { error: `Only failed clips can be regenerated (this one is ${asset.status}).` },
      { status: 409 },
    );
  }

  const stored = await getRunStore().getRun(asset.runId);
  if (!stored) {
    return NextResponse.json(
      { error: "Run not found for asset" },
      { status: 404 },
    );
  }

  const message = stored.messages.find((m) => m.id === asset.messageId);
  if (!message) {
    return NextResponse.json(
      { error: "Message not found for asset" },
      { status: 404 },
    );
  }

  const chunks = chunkForTTS(message.content);
  const chunk = chunks.find((c) => c.sequenceIndex === asset.sequenceIndex);
  if (!chunk) {
    return NextResponse.json(
      { error: `Chunk ${asset.sequenceIndex} no longer exists for this message.` },
      { status: 400 },
    );
  }

  const participant = message.participantId
    ? stored.state.participants.find((p) => p.id === message.participantId)
    : undefined;

  if (env.DEMO_MODE) {
    const rl = await checkDailyMediaLimit({
      ip: getClientIp(req),
      limit: env.MAX_MEDIA_REQUESTS_PER_IP_PER_DAY,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `Daily media generation limit reached (${env.MAX_MEDIA_REQUESTS_PER_IP_PER_DAY}). Resets at ${new Date(rl.resetAt).toISOString()}.`,
        },
        { status: 429 },
      );
    }
  }

  try {
    const updated = await regenerateAudioClip({
      assetId,
      message,
      participant,
      chunkText: chunk.text,
      deps: {
        tts: getTTSProvider(env.TTS_PROVIDER),
        storage: getStorage(),
        assets,
      },
    });
    return NextResponse.json({ asset: updated });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
