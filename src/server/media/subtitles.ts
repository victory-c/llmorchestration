import type { Scene } from "@/server/media/storyboard";

/**
 * Format `ms` as an SRT timestamp `HH:MM:SS,mmm`.
 */
export function formatSrtTimestamp(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) ms = 0;
  const totalMs = Math.floor(ms);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1_000);
  const millis = totalMs % 1_000;
  return (
    String(hours).padStart(2, "0") +
    ":" +
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0") +
    "," +
    String(millis).padStart(3, "0")
  );
}

/** Same as SRT but with `.` instead of `,` for VTT. */
export function formatVttTimestamp(ms: number): string {
  return formatSrtTimestamp(ms).replace(",", ".");
}

/**
 * Greedy word-level wrap so a line does not exceed `maxCharsPerLine`. Returns
 * an array of lines without trailing whitespace.
 */
export function wrapLines(
  text: string,
  maxCharsPerLine = 42,
  maxLines = 2,
): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  // truncate any extra words with an ellipsis on the last line
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    const last = lines[lines.length - 1];
    if (last.length > maxCharsPerLine - 1) {
      lines[lines.length - 1] = last.slice(0, maxCharsPerLine - 1) + "…";
    } else {
      lines[lines.length - 1] = last + "…";
    }
  }
  return lines;
}

export type SubtitleCue = {
  startMs: number;
  endMs: number;
  text: string;
};

/**
 * Split a long scene's text into multiple cues so subtitles can flow naturally
 * rather than dumping a wall of text. Cues are evenly distributed across the
 * scene's duration based on character count, with a minimum cue length so the
 * reader has time to actually read.
 */
const MIN_CUE_MS = 1_200;
const MAX_CHARS_PER_CUE = 90;

export function sceneToCues(scene: Scene): SubtitleCue[] {
  const text = scene.text.trim();
  if (!text) return [];

  // Sentence-ish segmentation; falls back to whitespace chunking.
  const sentences =
    text.match(/[^.!?]+[.!?]+(?:["')\]]*)\s*/g)?.map((s) => s.trim()).filter(Boolean) ??
    [text];

  // Repack sentences into cue-sized blocks.
  const blocks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length > MAX_CHARS_PER_CUE && current) {
      blocks.push(current.trim());
      current = sentence;
    } else {
      current = current ? current + " " + sentence : sentence;
    }
  }
  if (current.trim()) blocks.push(current.trim());

  if (blocks.length === 0) blocks.push(text);

  // Distribute scene duration across blocks weighted by char count.
  const totalChars = blocks.reduce((acc, b) => acc + b.length, 0) || 1;
  const cues: SubtitleCue[] = [];
  let cursor = scene.startMs;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const share = block.length / totalChars;
    let span = Math.round(scene.durationMs * share);
    if (span < MIN_CUE_MS) span = MIN_CUE_MS;
    let end = cursor + span;
    if (i === blocks.length - 1) end = scene.endMs; // pin final cue to scene end
    if (end <= cursor) end = cursor + MIN_CUE_MS;
    cues.push({ startMs: cursor, endMs: end, text: block });
    cursor = end;
  }
  return cues;
}

export type RenderSubtitlesInput = {
  scenes: Scene[];
  /** Prepend the speaker's display name on the first line of each cue. */
  withSpeaker?: boolean;
};

export function renderSrt({ scenes, withSpeaker = true }: RenderSubtitlesInput): string {
  const lines: string[] = [];
  let idx = 1;
  for (const scene of scenes) {
    const cues = sceneToCues(scene);
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      const body = withSpeaker && i === 0
        ? `${scene.displayName}: ${cue.text}`
        : cue.text;
      const wrapped = wrapLines(body).join("\n");
      lines.push(String(idx));
      lines.push(`${formatSrtTimestamp(cue.startMs)} --> ${formatSrtTimestamp(cue.endMs)}`);
      lines.push(wrapped);
      lines.push("");
      idx += 1;
    }
  }
  return lines.join("\n");
}

export function renderVtt({ scenes, withSpeaker = true }: RenderSubtitlesInput): string {
  const lines: string[] = ["WEBVTT", ""];
  for (const scene of scenes) {
    const cues = sceneToCues(scene);
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      const body = withSpeaker && i === 0
        ? `${scene.displayName}: ${cue.text}`
        : cue.text;
      const wrapped = wrapLines(body).join("\n");
      lines.push(`${formatVttTimestamp(cue.startMs)} --> ${formatVttTimestamp(cue.endMs)}`);
      lines.push(wrapped);
      lines.push("");
    }
  }
  return lines.join("\n");
}

export const SUBTITLES_INTERNALS = { MIN_CUE_MS, MAX_CHARS_PER_CUE };
