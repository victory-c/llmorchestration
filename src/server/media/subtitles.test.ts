import { describe, expect, it } from "vitest";
import {
  formatSrtTimestamp,
  formatVttTimestamp,
  renderSrt,
  renderVtt,
  sceneToCues,
  wrapLines,
} from "@/server/media/subtitles";
import type { Scene } from "@/server/media/storyboard";

function scene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "r1-scene-0",
    index: 0,
    speakerId: "p1",
    speakerType: "actor",
    displayName: "GPT",
    round: 1,
    text: "Hello there. This is a short line.",
    durationMs: 5000,
    startMs: 0,
    endMs: 5000,
    backgroundStyle: "clean-transcript-slideshow",
    audioAssetIds: [],
    participantId: "p1",
    isJudge: false,
    ...overrides,
  };
}

describe("formatSrtTimestamp", () => {
  it("formats milliseconds as HH:MM:SS,mmm", () => {
    expect(formatSrtTimestamp(0)).toBe("00:00:00,000");
    expect(formatSrtTimestamp(1500)).toBe("00:00:01,500");
    expect(formatSrtTimestamp(3_661_007)).toBe("01:01:01,007");
  });

  it("clamps negatives and non-finite to 0", () => {
    expect(formatSrtTimestamp(-1)).toBe("00:00:00,000");
    expect(formatSrtTimestamp(NaN)).toBe("00:00:00,000");
  });

  it("VTT variant uses '.' as decimal separator", () => {
    expect(formatVttTimestamp(1500)).toBe("00:00:01.500");
  });
});

describe("wrapLines", () => {
  it("wraps to maxCharsPerLine word-by-word", () => {
    const lines = wrapLines("the quick brown fox jumps over the lazy dog", 20);
    expect(lines.every((l) => l.length <= 20)).toBe(true);
    expect(lines.length).toBeLessThanOrEqual(2);
  });

  it("truncates with ellipsis when content overflows maxLines", () => {
    const long = "word ".repeat(40).trim();
    const lines = wrapLines(long, 30, 2);
    expect(lines).toHaveLength(2);
    expect(lines[lines.length - 1].endsWith("…")).toBe(true);
  });
});

describe("sceneToCues", () => {
  it("returns at least one cue per scene", () => {
    const cues = sceneToCues(scene({ text: "Single sentence." }));
    expect(cues).toHaveLength(1);
    expect(cues[0].endMs).toBe(5000);
  });

  it("splits long text into multiple cues that span the full scene", () => {
    const longText = Array.from({ length: 6 }, (_, i) => `Sentence ${i + 1} is reasonably long here.`).join(" ");
    const cues = sceneToCues(scene({ text: longText, durationMs: 12_000, endMs: 12_000 }));
    expect(cues.length).toBeGreaterThan(1);
    expect(cues[0].startMs).toBe(0);
    expect(cues[cues.length - 1].endMs).toBe(12_000);
    // strictly increasing
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].startMs).toBeGreaterThanOrEqual(cues[i - 1].endMs - 1);
    }
  });
});

describe("renderSrt / renderVtt", () => {
  it("renders SRT with sequential indices and speaker prefix", () => {
    const out = renderSrt({
      scenes: [
        scene({ id: "s0", text: "first" }),
        scene({ id: "s1", text: "second", startMs: 5000, endMs: 9000, durationMs: 4000 }),
      ],
    });
    expect(out).toContain("1\n");
    expect(out).toContain("2\n");
    expect(out).toContain("00:00:00,000 --> ");
    expect(out).toContain("GPT: first");
    expect(out).toContain("GPT: second");
  });

  it("renders VTT with WEBVTT header and dot timestamps", () => {
    const out = renderVtt({ scenes: [scene({ text: "hello" })] });
    expect(out.startsWith("WEBVTT\n")).toBe(true);
    expect(out).toContain("00:00:00.000 --> ");
  });

  it("withSpeaker=false omits the name prefix", () => {
    const out = renderSrt({ scenes: [scene({ text: "no name" })], withSpeaker: false });
    expect(out).not.toContain("GPT: ");
    expect(out).toContain("no name");
  });
});
