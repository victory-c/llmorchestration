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
import { MAX_VIDEO_RENDERS_PER_RUN } from "@/lib/constants";
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
import {
  generateAudioForRun,
  regenerateAudioClip,
} from "@/server/media/generateAudio";
import type { TranscriptMessage } from "@/server/engine/types";
import { resetUsageEventsForTests } from "@/server/cost/logUsage";
import { POST as regeneratePOST } from "@/app/api/media/[id]/regenerate/route";
import { POST as audioPOST } from "@/app/api/runs/[id]/audio/route";
import { POST as videoPOST } from "@/app/api/runs/[id]/video/route";

// M-51: an anonymous visitor owns the run they create, so ownership alone
// does not bound paid media work. Each run must be bounded on its own
// (idempotent audio, one in-flight job, capped renders, failed-only clip
// regenerate), and the hosted demo adds a per-IP daily budget on top.

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

async function completedRun(lines: string[]) {
  const stored = await createRunFromTemplate(
    {
      template: findTemplate("plane-crash")!,
      participants: defaultMockParticipants.slice(0, 2),
    },
    dbStore,
  );
  const runId = stored.state.runId;
  const participant = stored.state.participants[0];
  const messages: TranscriptMessage[] = [];
  for (const content of lines) {
    const m: TranscriptMessage = {
      id: nanoid(),
      runId,
      round: 1,
      participantId: participant.id,
      speakerType: "actor",
      displayName: participant.displayName,
      content,
      createdAt: new Date().toISOString(),
    };
    await dbStore.appendMessage(runId, m);
    messages.push(m);
  }
  await dbStore.updateRunState(runId, { ...stored.state, status: "completed" });
  return { runId, participants: stored.state.participants, messages };
}

async function clip(
  runId: string,
  messageId: string,
  status: "ready" | "failed",
) {
  return dbAssets.create({
    id: nanoid(),
    runId,
    messageId,
    type: "audio-clip",
    storageKey: `runs/${runId}/audio/${messageId}-0.mp3`,
    status,
    sequenceIndex: 0,
  });
}

function post(url: string, ip = "198.51.100.10"): Request {
  return new Request(url, { method: "POST", headers: { "x-real-ip": ip } });
}

function regenerate(assetId: string, ip?: string) {
  return regeneratePOST(
    post(`http://localhost/api/media/${assetId}/regenerate`, ip),
    { params: Promise.resolve({ id: assetId }) },
  );
}

function audio(runId: string, ip?: string) {
  return audioPOST(post(`http://localhost/api/runs/${runId}/audio`, ip), {
    params: Promise.resolve({ id: runId }),
  });
}

function video(runId: string, ip?: string) {
  return videoPOST(post(`http://localhost/api/runs/${runId}/video`, ip), {
    params: Promise.resolve({ id: runId }),
  });
}

describe("media generation limits (M-51)", () => {
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
      MAX_MEDIA_REQUESTS_PER_IP_PER_DAY: undefined,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("generateAudioForRun is idempotent per chunk", () => {
    it("does not re-synthesize or duplicate clips that are already ready", async () => {
      const { runId, participants, messages } = await completedRun([
        "First line.",
        "Second line.",
      ]);
      const synth = vi.spyOn(mockTTS, "synthesize");
      const deps = { tts: mockTTS, storage: fakeStorage, assets: dbAssets };

      const first = await generateAudioForRun({ runId, messages, participants, deps });
      expect(first.clipsReady).toBe(2);
      expect(synth).toHaveBeenCalledTimes(2);

      const second = await generateAudioForRun({ runId, messages, participants, deps });
      expect(second.clipsRequested).toBe(0);
      expect(second.clipsSkipped).toBe(2);
      expect(synth).toHaveBeenCalledTimes(2);
      expect(await dbAssets.listForRun(runId, "audio-clip")).toHaveLength(2);
    });

    it("retries only the failed chunk and reuses its row", async () => {
      const { runId, participants, messages } = await completedRun([
        "Good line.",
        "Bad line.",
      ]);
      await clip(runId, messages[0].id, "ready");
      const failed = await clip(runId, messages[1].id, "failed");
      const synth = vi.spyOn(mockTTS, "synthesize");

      const summary = await generateAudioForRun({
        runId,
        messages,
        participants,
        deps: { tts: mockTTS, storage: fakeStorage, assets: dbAssets },
      });

      expect(summary.clipsRequested).toBe(1);
      expect(summary.clipsSkipped).toBe(1);
      expect(synth).toHaveBeenCalledTimes(1);
      const rows = await dbAssets.listForRun(runId, "audio-clip");
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.status === "ready")).toBe(true);
      expect(rows.map((r) => r.id)).toContain(failed.id);
    });
  });

  describe("one in-flight job per run", () => {
    it("/audio refuses a second enqueue while one is queued", async () => {
      const { runId } = await completedRun(["Line."]);

      expect((await audio(runId)).status).toBe(202);
      const again = await audio(runId);

      expect(again.status).toBe(409);
      expect((await dbQueue.stats()).queued).toBe(1);
    });

    it("/video refuses a second enqueue while one is queued", async () => {
      const { runId } = await completedRun(["Line."]);

      expect((await video(runId)).status).toBe(202);
      const again = await video(runId);

      expect(again.status).toBe(409);
      expect((await dbQueue.stats()).queued).toBe(1);
    });

    it("/video refuses once the run has used its render budget", async () => {
      const { runId } = await completedRun(["Line."]);
      expect(MAX_VIDEO_RENDERS_PER_RUN).toBeGreaterThan(0);
      for (let i = 0; i < MAX_VIDEO_RENDERS_PER_RUN; i++) {
        await dbAssets.create({
          id: nanoid(),
          runId,
          type: "video-final",
          storageKey: `runs/${runId}/video/final-${i}.mp4`,
          status: "ready",
          sequenceIndex: 0,
        });
      }

      const res = await video(runId);

      expect(res.status).toBe(409);
      expect((await dbQueue.stats()).queued).toBe(0);
    });
  });

  describe("clip regenerate", () => {
    it("refuses to re-synthesize a clip that is already ready", async () => {
      const { runId, messages } = await completedRun(["Line."]);
      const ready = await clip(runId, messages[0].id, "ready");
      const synth = vi.spyOn(mockTTS, "synthesize");

      const res = await regenerate(ready.id);

      expect(res.status).toBe(409);
      expect(synth).not.toHaveBeenCalled();
    });

    it("still regenerates a failed clip", async () => {
      const { runId, messages } = await completedRun(["Line."]);
      const failed = await clip(runId, messages[0].id, "failed");

      const res = await regenerate(failed.id);

      expect(res.status).toBe(200);
      expect((await dbAssets.findById(failed.id))?.status).toBe("ready");
    });

    it("marks the clip failed (not stuck processing) when the upload fails", async () => {
      const { runId, participants, messages } = await completedRun(["Line."]);
      const failed = await clip(runId, messages[0].id, "failed");
      const brokenStorage: StorageProvider = {
        ...fakeStorage,
        async put() {
          throw new Error("blob store down");
        },
      };

      await expect(
        regenerateAudioClip({
          assetId: failed.id,
          message: messages[0],
          participant: participants[0],
          chunkText: messages[0].content,
          deps: { tts: mockTTS, storage: brokenStorage, assets: dbAssets },
        }),
      ).rejects.toThrow(/blob store down/);
      const after = await dbAssets.findById(failed.id);
      expect(after?.status).toBe("failed");
      expect(after?.failedReason).toMatch(/blob store down/);
    });
  });

  describe("hosted demo per-IP daily media budget", () => {
    it("caps paid media requests per IP per day across the media routes", async () => {
      setEnv({ DEMO_MODE: "true", MAX_MEDIA_REQUESTS_PER_IP_PER_DAY: "2" });
      const { runId, messages } = await completedRun(["One.", "Two.", "Three."]);
      const clips = [];
      for (const m of messages) clips.push(await clip(runId, m.id, "failed"));
      const synth = vi.spyOn(mockTTS, "synthesize");

      expect((await regenerate(clips[0].id)).status).toBe(200);
      expect((await audio(runId)).status).toBe(202);
      const blocked = await regenerate(clips[1].id);

      expect(blocked.status).toBe(429);
      expect(synth).toHaveBeenCalledTimes(1);
      // A different client is unaffected.
      expect((await regenerate(clips[2].id, "203.0.113.77")).status).toBe(200);
    });

    it("does not spend the budget on requests that are refused anyway", async () => {
      setEnv({ DEMO_MODE: "true", MAX_MEDIA_REQUESTS_PER_IP_PER_DAY: "1" });
      const { runId, messages } = await completedRun(["One."]);
      const ready = await clip(runId, messages[0].id, "ready");

      expect((await regenerate(ready.id)).status).toBe(409);
      expect((await audio(runId)).status).toBe(202);
    });

    it("is not applied outside DEMO_MODE", async () => {
      setEnv({ DEMO_MODE: "false", MAX_MEDIA_REQUESTS_PER_IP_PER_DAY: "1" });
      const { runId, messages } = await completedRun(["One.", "Two."]);
      const a = await clip(runId, messages[0].id, "failed");
      const b = await clip(runId, messages[1].id, "failed");

      expect((await regenerate(a.id)).status).toBe(200);
      expect((await regenerate(b.id)).status).toBe(200);
    });
  });
});
