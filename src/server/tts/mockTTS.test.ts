import { describe, expect, it } from "vitest";
import { mockTTS } from "@/server/tts/mockTTS";

describe("mockTTS", () => {
  it("returns non-empty MP3 bytes with a plausible duration", async () => {
    const res = await mockTTS.synthesize({
      text: "This is a short line of dialogue that should yield audio bytes.",
      voiceId: "mock-voice",
    });
    expect(res.provider).toBe("mock");
    expect(res.contentType).toBe("audio/mpeg");
    expect(res.bytes.byteLength).toBeGreaterThan(0);
    expect(res.durationMs).toBeGreaterThanOrEqual(500);
    expect(res.estimatedCostUsd).toBe(0);
  });

  it("duration scales with text length (roughly)", async () => {
    const short = await mockTTS.synthesize({
      text: "short",
      voiceId: "v",
    });
    const long = await mockTTS.synthesize({
      text: "a much longer line of dialogue that should take more time to speak than the short one",
      voiceId: "v",
    });
    expect(long.durationMs).toBeGreaterThan(short.durationMs);
  });
});
