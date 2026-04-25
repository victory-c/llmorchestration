import { describe, expect, it } from "vitest";
import {
  chunkForTTS,
  MAX_CHARS_PER_TTS_CLIP,
} from "@/server/tts/chunk";

describe("chunkForTTS", () => {
  it("returns [] for empty / whitespace-only input", () => {
    expect(chunkForTTS("")).toEqual([]);
    expect(chunkForTTS("   \n\n")).toEqual([]);
  });

  it("returns a single chunk for short text", () => {
    const text = "Hello world. This is short.";
    const chunks = chunkForTTS(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].sequenceIndex).toBe(0);
    expect(chunks[0].text).toBe(text);
  });

  it("splits at paragraph boundaries when possible", () => {
    const para1 = "First paragraph sentence one. Sentence two.".repeat(12);
    const para2 = "Second paragraph. Still second paragraph.";
    const chunks = chunkForTTS(`${para1}\n\n${para2}`, 300);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(300);
    // sequence indexes must be 0,1,2,... in order
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].sequenceIndex).toBe(i);
    }
  });

  it("hard-splits a single sentence that is longer than maxChars", () => {
    const long = "a".repeat(3000);
    const chunks = chunkForTTS(long, 500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(500);
  });

  it("default max is DEFAULT_MAX_TTS_CHARS from constants", () => {
    expect(MAX_CHARS_PER_TTS_CLIP).toBe(1000);
  });

  it("concatenating chunk texts with spaces recovers the original words", () => {
    const text =
      "Alice reasoned about the problem. Bob agreed with the premise. Charlie proposed an alternative.";
    const chunks = chunkForTTS(text, 40);
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
    const joinedWordCount = chunks.reduce((n, c) => n + words(c.text), 0);
    expect(joinedWordCount).toBe(words(text));
  });
});
