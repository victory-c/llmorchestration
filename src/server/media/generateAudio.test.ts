import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateAudioForRun,
  regenerateAudioClip,
} from "@/server/media/generateAudio";
import {
  memoryAssets,
  resetMemoryAssetsForTests,
} from "@/server/media/memoryAssets";
import type { StorageProvider } from "@/server/storage/types";
import type { TTSProvider } from "@/server/tts/types";
import type {
  RunParticipant,
  TranscriptMessage,
} from "@/server/engine/types";
import { resetUsageEventsForTests, listUsageEvents } from "@/server/cost/logUsage";

function participant(overrides: Partial<RunParticipant> = {}): RunParticipant {
  return {
    id: "p1",
    displayName: "GPT",
    modelId: "mock-gpt",
    status: "active",
    publicPersona: "",
    ...overrides,
  };
}

function message(overrides: Partial<TranscriptMessage> = {}): TranscriptMessage {
  return {
    id: overrides.id ?? "m1",
    runId: "r1",
    round: 1,
    participantId: "p1",
    speakerType: "actor",
    displayName: "GPT",
    content: "Hello there.",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakeTTS(): TTSProvider & { calls: number } {
  const obj = {
    calls: 0,
    async synthesize(req: { text: string; voiceId: string }) {
      obj.calls++;
      return {
        provider: "mock" as const,
        bytes: new Uint8Array([1, 2, 3]),
        contentType: "audio/mpeg",
        durationMs: 1000,
        estimatedCostUsd: 0.01,
        voiceId: req.voiceId,
      };
    },
  };
  return obj;
}

function fakeStorage(): StorageProvider & { puts: Array<{ key: string; bytes: Uint8Array }> } {
  const puts: Array<{ key: string; bytes: Uint8Array }> = [];
  const obj: StorageProvider & { puts: typeof puts } = {
    puts,
    async put(key, bytes) {
      puts.push({ key, bytes });
      return {
        key,
        url: `https://storage.test/${key}`,
        sizeBytes: bytes.byteLength,
      };
    },
    async delete() {},
    async getUrl(key) {
      return `https://storage.test/${key}`;
    },
  };
  return obj;
}

describe("generateAudioForRun", () => {
  beforeEach(() => {
    resetMemoryAssetsForTests();
    resetUsageEventsForTests();
  });

  it("synthesizes one clip per actor-message chunk and writes ready rows", async () => {
    const tts = fakeTTS();
    const storage = fakeStorage();

    const summary = await generateAudioForRun({
      runId: "r1",
      messages: [
        message({ id: "m1", content: "Short actor line." }),
        message({ id: "m2", content: "Another actor line." }),
        // judge messages are skipped
        {
          ...message({ id: "m3", content: "Judge summary" }),
          speakerType: "judge",
        },
      ],
      participants: [participant()],
      deps: { tts, storage, assets: memoryAssets },
    });

    expect(summary.clipsRequested).toBe(2);
    expect(summary.clipsReady).toBe(2);
    expect(summary.clipsFailed).toBe(0);
    expect(tts.calls).toBe(2);
    expect(storage.puts).toHaveLength(2);

    const rows = await memoryAssets.listForRun("r1");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe("ready");
      expect(row.url).toMatch(/^https:\/\/storage.test\//);
      expect(row.durationMs).toBe(1000);
    }

    const usage = listUsageEvents("r1").filter((e) => e.eventType === "tts-call");
    expect(usage.length).toBe(2);
  });

  it("isolates a failing clip — other clips still succeed", async () => {
    const storage = fakeStorage();
    const tts: TTSProvider = {
      async synthesize(req) {
        if (req.metadata?.messageId === "m-bad") {
          throw new Error("tts provider exploded");
        }
        return {
          provider: "mock",
          bytes: new Uint8Array([1]),
          contentType: "audio/mpeg",
          durationMs: 500,
          estimatedCostUsd: 0,
          voiceId: req.voiceId,
        };
      },
    };

    const summary = await generateAudioForRun({
      runId: "r2",
      messages: [
        message({ id: "m-good", runId: "r2", content: "ok" }),
        message({ id: "m-bad", runId: "r2", content: "boom" }),
      ],
      participants: [participant()],
      deps: { tts, storage, assets: memoryAssets },
    });

    expect(summary.clipsRequested).toBe(2);
    expect(summary.clipsReady).toBe(1);
    expect(summary.clipsFailed).toBe(1);

    const rows = await memoryAssets.listForRun("r2");
    const good = rows.find((r) => r.messageId === "m-good")!;
    const bad = rows.find((r) => r.messageId === "m-bad")!;
    expect(good.status).toBe("ready");
    expect(bad.status).toBe("failed");
    expect(bad.failedReason).toContain("tts provider exploded");
  });

  it("creates multiple clips for a long message (via chunking)", async () => {
    const tts = fakeTTS();
    const storage = fakeStorage();
    const longText = `${"This is a sentence. ".repeat(120)}`; // > 1000 chars
    await generateAudioForRun({
      runId: "r3",
      messages: [message({ id: "m-long", runId: "r3", content: longText })],
      participants: [participant()],
      deps: { tts, storage, assets: memoryAssets },
    });
    const rows = await memoryAssets.listForMessage("m-long");
    expect(rows.length).toBeGreaterThan(1);
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].sequenceIndex).toBe(i);
    }
  });
});

describe("regenerateAudioClip", () => {
  beforeEach(() => {
    resetMemoryAssetsForTests();
    resetUsageEventsForTests();
  });

  it("retries a single clip and reuses the storage key", async () => {
    const failingTTS = vi
      .fn()
      .mockRejectedValueOnce(new Error("first try fails"))
      .mockResolvedValue({
        provider: "mock" as const,
        bytes: new Uint8Array([9]),
        contentType: "audio/mpeg",
        durationMs: 500,
        estimatedCostUsd: 0,
        voiceId: "v",
      });
    const tts: TTSProvider = { synthesize: failingTTS };
    const storage = fakeStorage();

    // First pass fails and writes a `failed` row.
    await generateAudioForRun({
      runId: "r4",
      messages: [message({ id: "m1", runId: "r4", content: "first try fails" })],
      participants: [participant()],
      deps: { tts, storage, assets: memoryAssets },
    });
    const rows = await memoryAssets.listForRun("r4");
    expect(rows[0].status).toBe("failed");
    const originalKey = rows[0].storageKey;

    // Regenerate should now succeed and preserve the key.
    const updated = await regenerateAudioClip({
      assetId: rows[0].id,
      message: message({ id: "m1", runId: "r4", content: "first try fails" }),
      participant: participant(),
      chunkText: "first try fails",
      deps: { tts, storage, assets: memoryAssets },
    });
    expect(updated.status).toBe("ready");
    expect(updated.storageKey).toBe(originalKey);
    expect(updated.url).toBeDefined();
  });
});
