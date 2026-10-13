import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { nanoid } from "nanoid";
import { resetEnvCacheForTests } from "@/lib/env";
import {
  setupPglite,
  teardownPglite,
  resetPgliteSchema,
} from "@/server/db/pglite";
import { dbStore } from "@/server/store/dbStore";
import { dbAssets } from "@/server/media/dbAssets";
import { dbQueue } from "@/server/jobs/dbQueue";
import { createRunFromTemplate } from "@/server/engine/createRun";
import { findTemplate } from "@/server/scenarios/templates";
import { defaultMockParticipants } from "@/server/scenarios/mockParticipants";
import { setStorageForTests } from "@/server/storage";
import type { StorageProvider } from "@/server/storage/types";
import { mockTTS } from "@/server/tts/mockTTS";
import { elevenLabsTTS } from "@/server/tts/elevenLabsTTS";
import { regenerateAudioClip } from "@/server/media/generateAudio";
import {
  listUsageEvents,
  resetUsageEventsForTests,
} from "@/server/cost/logUsage";
import { POST as regeneratePOST } from "@/app/api/media/[id]/regenerate/route";
import { POST as audioPOST } from "@/app/api/runs/[id]/audio/route";
import { POST as videoPOST } from "@/app/api/runs/[id]/video/route";

// M-50: the synchronous clip-regenerate route (and the TTS adapter behind it)
// must honour GLOBAL_AI_KILL_SWITCH and meter its spend like the job path.

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCacheForTests();
}

const fakeStorage: StorageProvider = {
  async put(key, bytes) {
    return { key, url: `https://storage.test/${key}`, sizeBytes: bytes.byteLength };
  },
  async delete() {},
  async getUrl(key) {
    return `https://storage.test/${key}`;
  },
};

async function completedRunWithFailedClip() {
  const stored = await createRunFromTemplate(
    {
      template: findTemplate("plane-crash")!,
      participants: defaultMockParticipants.slice(0, 2),
    },
    dbStore,
  );
  const runId = stored.state.runId;
  const participant = stored.state.participants[0];
  const message = {
    id: nanoid(),
    runId,
    round: 1,
    participantId: participant.id,
    speakerType: "actor" as const,
    displayName: participant.displayName,
    content: "We ration the water and wait for the rescue flare.",
    createdAt: new Date().toISOString(),
  };
  await dbStore.appendMessage(runId, message);
  await dbStore.updateRunState(runId, { ...stored.state, status: "completed" });
  const asset = await dbAssets.create({
    id: nanoid(),
    runId,
    messageId: message.id,
    type: "audio-clip",
    storageKey: `runs/${runId}/audio/${message.id}-0.mp3`,
    status: "failed",
    failedReason: "provider hiccup",
    sequenceIndex: 0,
  });
  return { runId, message, participant, asset };
}

function post(url: string): Request {
  return new Request(url, { method: "POST" });
}

describe("paid TTS regenerate path (M-50)", () => {
  beforeAll(async () => {
    await setupPglite();
    setStorageForTests(fakeStorage);
  });
  afterAll(async () => {
    setStorageForTests(null);
    await teardownPglite();
  });
  beforeEach(async () => {
    await resetPgliteSchema();
    resetUsageEventsForTests();
    setEnv({
      TTS_PROVIDER: "mock",
      DEMO_MODE: "false",
      GLOBAL_AI_KILL_SWITCH: undefined,
      DISABLE_TTS_GENERATION: undefined,
      DISABLE_VIDEO_GENERATION: undefined,
      ELEVENLABS_API_KEY: undefined,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setEnv({ GLOBAL_AI_KILL_SWITCH: undefined, ELEVENLABS_API_KEY: undefined });
  });

  it("refuses to regenerate a clip while GLOBAL_AI_KILL_SWITCH is on", async () => {
    const { asset } = await completedRunWithFailedClip();
    const synth = vi.spyOn(mockTTS, "synthesize");
    setEnv({ GLOBAL_AI_KILL_SWITCH: "true" });

    const res = await regeneratePOST(
      post(`http://localhost/api/media/${asset.id}/regenerate`),
      { params: Promise.resolve({ id: asset.id }) },
    );

    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/GLOBAL_AI_KILL_SWITCH/);
    expect(synth).not.toHaveBeenCalled();
    expect((await dbAssets.findById(asset.id))?.status).toBe("failed");
  });

  it("refuses to enqueue audio or video jobs while GLOBAL_AI_KILL_SWITCH is on", async () => {
    const { runId } = await completedRunWithFailedClip();
    setEnv({ GLOBAL_AI_KILL_SWITCH: "true" });
    const ctx = { params: Promise.resolve({ id: runId }) };

    const audio = await audioPOST(post(`http://localhost/api/runs/${runId}/audio`), ctx);
    const video = await videoPOST(
      post(`http://localhost/api/runs/${runId}/video`),
      { params: Promise.resolve({ id: runId }) },
    );

    expect(audio.status).toBe(403);
    expect(video.status).toBe(403);
    expect((await dbQueue.stats()).queued).toBe(0);
  });

  it("the ElevenLabs adapter refuses under the kill switch without calling out", async () => {
    setEnv({ GLOBAL_AI_KILL_SWITCH: "true", ELEVENLABS_API_KEY: "test-key" });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network must not be reached"));

    await expect(
      elevenLabsTTS.synthesize({ text: "hello", voiceId: "v" }),
    ).rejects.toThrow(/GLOBAL_AI_KILL_SWITCH/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("meters a successful regenerate as a tts-call usage event", async () => {
    const { runId, message, participant, asset } =
      await completedRunWithFailedClip();

    const updated = await regenerateAudioClip({
      assetId: asset.id,
      message,
      participant,
      chunkText: message.content,
      deps: { tts: mockTTS, storage: fakeStorage, assets: dbAssets },
    });

    expect(updated.status).toBe("ready");
    const usage = listUsageEvents(runId).filter((e) => e.eventType === "tts-call");
    expect(usage).toHaveLength(1);
    expect(usage[0].metadata).toMatchObject({
      assetId: asset.id,
      chars: message.content.length,
      regenerate: true,
    });
  });
});
