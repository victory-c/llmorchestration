// TTS chunking. Long messages must be split into per-clip chunks at natural
// sentence or paragraph boundaries so each clip stays under the provider's
// practical payload limit and a single failed chunk does not fail the whole
// message.
//
// Chunks are ordered; downstream code uses `sequenceIndex` on media_assets to
// concatenate them during playback/video rendering.

import { DEFAULT_MAX_TTS_CHARS } from "@/lib/constants";

export const MAX_CHARS_PER_TTS_CLIP = DEFAULT_MAX_TTS_CHARS;

export type TTSChunk = {
  sequenceIndex: number;
  text: string;
};

// Public: break a message into TTS-safe chunks. Guarantees:
//  - No chunk exceeds `maxChars`.
//  - Chunks concatenate (with a single space between) back to the original
//    trimmed text.
//  - Splits happen at paragraph boundaries first, then sentence boundaries,
//    then whitespace, then as a last resort at a hard character boundary.
//  - Every non-empty input produces at least one chunk.
export function chunkForTTS(
  text: string,
  maxChars: number = MAX_CHARS_PER_TTS_CLIP,
): TTSChunk[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= maxChars) {
    return [{ sequenceIndex: 0, text: trimmed }];
  }

  // Split into paragraphs, then greedily pack them up to maxChars. Paragraphs
  // that are themselves longer than maxChars get further split by sentence.
  const paragraphs = trimmed
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const units: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= maxChars) {
      units.push(para);
      continue;
    }
    // Sentence split: end on `.`, `!`, `?`, or newline followed by uppercase.
    const sentences = splitSentences(para);
    for (const s of sentences) {
      if (s.length <= maxChars) {
        units.push(s);
      } else {
        // Hard-split an overly long single sentence at the nearest whitespace
        // to maxChars, then fall back to hard split.
        units.push(...hardSplit(s, maxChars));
      }
    }
  }

  // Greedy pack units into chunks, separated by " " so the text reads
  // naturally when re-assembled.
  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    if (current.length === 0) {
      current = unit;
      continue;
    }
    const candidate = `${current} ${unit}`;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      chunks.push(current);
      current = unit;
    }
  }
  if (current.length > 0) chunks.push(current);

  return chunks.map((text, i) => ({ sequenceIndex: i, text }));
}

function splitSentences(text: string): string[] {
  // Not perfect but good enough for scripted dialogue. Keeps terminating
  // punctuation with its sentence.
  const out: string[] = [];
  const re = /[^.!?]+[.!?]+(?:["')\]]*)\s*/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[0].trim());
    lastIndex = re.lastIndex;
  }
  const tail = text.slice(lastIndex).trim();
  if (tail.length > 0) out.push(tail);
  return out.filter((s) => s.length > 0);
}

function hardSplit(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    // Find the rightmost whitespace within maxChars.
    const slice = remaining.slice(0, maxChars);
    const wsIdx = slice.lastIndexOf(" ");
    const cut = wsIdx > maxChars / 2 ? wsIdx : maxChars;
    out.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining.length > 0) out.push(remaining);
  return out;
}
