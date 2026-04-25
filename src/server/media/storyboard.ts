import type {
  RunParticipant,
  RunState,
  TranscriptMessage,
} from "@/server/engine/types";
import type { MediaAsset } from "@/server/media/types";

/**
 * The five default video styles per PRD §15.2.
 */
export type VideoStyle =
  | "dark-cockpit-drama"
  | "minimal-courtroom"
  | "reality-show-confession-cam"
  | "sci-fi-control-room"
  | "clean-transcript-slideshow";

export const VIDEO_STYLES: VideoStyle[] = [
  "dark-cockpit-drama",
  "minimal-courtroom",
  "reality-show-confession-cam",
  "sci-fi-control-room",
  "clean-transcript-slideshow",
];

export type VideoStyleDescriptor = {
  id: VideoStyle;
  label: string;
  bgGradient: [string, string];
  accent: string;
  textColor: string;
  mutedColor: string;
  vibe: string;
};

export const VIDEO_STYLE_CATALOG: Record<VideoStyle, VideoStyleDescriptor> = {
  "dark-cockpit-drama": {
    id: "dark-cockpit-drama",
    label: "Dark cockpit drama",
    bgGradient: ["#050810", "#16202c"],
    accent: "#ff5b3a",
    textColor: "#f5f5f5",
    mutedColor: "#7a8593",
    vibe: "Tense, low-light, high-stakes survival.",
  },
  "minimal-courtroom": {
    id: "minimal-courtroom",
    label: "Minimal courtroom",
    bgGradient: ["#f8f4ec", "#e7dec9"],
    accent: "#3b3026",
    textColor: "#1c1611",
    mutedColor: "#6c5f51",
    vibe: "Sober, formal, paper-and-wood neutral.",
  },
  "reality-show-confession-cam": {
    id: "reality-show-confession-cam",
    label: "Reality show confession cam",
    bgGradient: ["#3a0d2c", "#76234d"],
    accent: "#ffd166",
    textColor: "#fff8f1",
    mutedColor: "#e7b1c4",
    vibe: "Saturated, talking-head, gossipy zoom-in.",
  },
  "sci-fi-control-room": {
    id: "sci-fi-control-room",
    label: "Sci-fi control room",
    bgGradient: ["#021018", "#053147"],
    accent: "#3ad9ff",
    textColor: "#e6faff",
    mutedColor: "#6da7c1",
    vibe: "HUD/console aesthetic, cool blues, neon edges.",
  },
  "clean-transcript-slideshow": {
    id: "clean-transcript-slideshow",
    label: "Clean transcript slideshow",
    bgGradient: ["#ffffff", "#f1f3f5"],
    accent: "#2c5cff",
    textColor: "#0f1219",
    mutedColor: "#5a6477",
    vibe: "Editorial, readable, slide-deck minimal.",
  },
};

const CATEGORY_TO_STYLE: Record<string, VideoStyle> = {
  "survival-dilemma": "dark-cockpit-drama",
  debate: "minimal-courtroom",
  "reality-show": "reality-show-confession-cam",
  "game-theory": "sci-fi-control-room",
  negotiation: "sci-fi-control-room",
};

/**
 * Default style for a scenario category. Falls back to the slideshow if the
 * category is unknown so we always have a renderable scene.
 */
export function defaultStyleForCategory(
  category?: string | null,
): VideoStyle {
  if (!category) return "clean-transcript-slideshow";
  return CATEGORY_TO_STYLE[category] ?? "clean-transcript-slideshow";
}

export type Scene = {
  /** stable id (run-scoped, scene-index based) */
  id: string;
  index: number;
  speakerId: string;
  speakerType: "actor" | "judge" | "system";
  displayName: string;
  round: number;
  text: string;
  /** ms — cumulative duration of all audio chunks linked to this message; clamped to MIN_SCENE_MS */
  durationMs: number;
  startMs: number;
  endMs: number;
  backgroundStyle: VideoStyle;
  audioAssetIds: string[];
  /** primary participant for color/role hinting; missing for judge/system */
  participantId?: string;
  isJudge: boolean;
};

export type Storyboard = {
  runId: string;
  style: VideoStyle;
  totalDurationMs: number;
  scenes: Scene[];
  /** participants keyed by id for quick lookup downstream */
  participantsById: Record<string, RunParticipant>;
};

/**
 * Minimum on-screen time per scene, even if no audio exists yet. Keeps the
 * storyboard JSON useful as a fallback even for runs that never generated TTS.
 */
const MIN_SCENE_MS = 2_500;
/**
 * If a message has no audio yet, fall back to a reading-speed estimate so the
 * preview duration is not absurdly short. Roughly 14 chars/sec at 0.5x to be
 * forgiving — long messages get more time, short ones get the floor.
 */
const READING_CHARS_PER_SEC = 14;

function estimateReadingMs(text: string): number {
  if (!text) return MIN_SCENE_MS;
  const ms = Math.round((text.length / READING_CHARS_PER_SEC) * 1000);
  return Math.max(MIN_SCENE_MS, ms);
}

export type BuildStoryboardInput = {
  runId: string;
  state: RunState;
  messages: TranscriptMessage[];
  audioAssets?: MediaAsset[];
  scenarioCategory?: string;
  styleOverride?: VideoStyle;
  includeJudge?: boolean;
};

/**
 * Pure function: assemble an ordered Scene[] from a completed run's transcript
 * + audio assets. Scene durations are derived from the matching audio clips
 * when available, otherwise from a reading-speed estimate.
 */
export function buildStoryboard(input: BuildStoryboardInput): Storyboard {
  const includeJudge = input.includeJudge ?? true;
  const style =
    input.styleOverride ?? defaultStyleForCategory(input.scenarioCategory);

  const audioByMessage = new Map<string, MediaAsset[]>();
  for (const asset of input.audioAssets ?? []) {
    if (asset.type !== "audio-clip") continue;
    if (!asset.messageId) continue;
    if (asset.status === "failed") continue;
    const list = audioByMessage.get(asset.messageId) ?? [];
    list.push(asset);
    audioByMessage.set(asset.messageId, list);
  }
  for (const list of audioByMessage.values()) {
    list.sort((a, b) => a.sequenceIndex - b.sequenceIndex);
  }

  const participantsById: Record<string, RunParticipant> = {};
  for (const p of input.state.participants) participantsById[p.id] = p;

  const sortedMessages = [...input.messages].sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round;
    return a.createdAt.localeCompare(b.createdAt);
  });

  const scenes: Scene[] = [];
  let cursorMs = 0;
  let sceneIndex = 0;

  for (const msg of sortedMessages) {
    if (!includeJudge && msg.speakerType === "judge") continue;
    if (msg.speakerType === "system") continue;

    const audio = audioByMessage.get(msg.id) ?? [];
    let duration = 0;
    for (const clip of audio) duration += clip.durationMs ?? 0;
    if (duration <= 0) duration = estimateReadingMs(msg.content);
    if (duration < MIN_SCENE_MS) duration = MIN_SCENE_MS;

    const isJudge = msg.speakerType === "judge";
    const speakerType: Scene["speakerType"] = isJudge ? "judge" : "actor";

    const scene: Scene = {
      id: `${input.runId}-scene-${sceneIndex}`,
      index: sceneIndex,
      speakerId: msg.participantId ?? (isJudge ? "judge" : "system"),
      speakerType,
      displayName: msg.displayName,
      round: msg.round,
      text: msg.content,
      durationMs: duration,
      startMs: cursorMs,
      endMs: cursorMs + duration,
      backgroundStyle: style,
      audioAssetIds: audio.map((a) => a.id),
      participantId: msg.participantId,
      isJudge,
    };

    scenes.push(scene);
    cursorMs += duration;
    sceneIndex += 1;
  }

  return {
    runId: input.runId,
    style,
    totalDurationMs: cursorMs,
    scenes,
    participantsById,
  };
}

/** Convert a storyboard to a JSON-friendly export shape (no internal refs). */
export function storyboardToExportJSON(sb: Storyboard) {
  return {
    runId: sb.runId,
    style: sb.style,
    totalDurationMs: sb.totalDurationMs,
    sceneCount: sb.scenes.length,
    scenes: sb.scenes.map((s) => ({
      index: s.index,
      round: s.round,
      speakerId: s.speakerId,
      speakerType: s.speakerType,
      displayName: s.displayName,
      text: s.text,
      durationMs: s.durationMs,
      startMs: s.startMs,
      endMs: s.endMs,
      backgroundStyle: s.backgroundStyle,
      audioAssetIds: s.audioAssetIds,
      isJudge: s.isJudge,
    })),
  };
}

export const STORYBOARD_INTERNALS = { MIN_SCENE_MS, READING_CHARS_PER_SEC };
