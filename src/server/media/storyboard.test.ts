import { describe, expect, it } from "vitest";
import {
  buildStoryboard,
  defaultStyleForCategory,
  storyboardToExportJSON,
  STORYBOARD_INTERNALS,
} from "@/server/media/storyboard";
import type {
  RunParticipant,
  RunState,
  TranscriptMessage,
} from "@/server/engine/types";
import type { MediaAsset } from "@/server/media/types";

function p(overrides: Partial<RunParticipant> = {}): RunParticipant {
  return {
    id: "p1",
    displayName: "GPT",
    modelId: "mock-gpt",
    status: "active",
    publicPersona: "",
    ...overrides,
  };
}

function m(overrides: Partial<TranscriptMessage> = {}): TranscriptMessage {
  return {
    id: "m1",
    runId: "r1",
    round: 1,
    participantId: "p1",
    speakerType: "actor",
    displayName: "GPT",
    content: "Hello there.",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function asset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "a1",
    runId: "r1",
    messageId: "m1",
    type: "audio-clip",
    storageKey: "k",
    status: "ready",
    sequenceIndex: 0,
    durationMs: 2_000,
    createdAt: "2026-01-01T00:00:01.000Z",
    ...overrides,
  };
}

function state(overrides: Partial<RunState> = {}): RunState {
  return {
    scenarioId: "plane-crash",
    runId: "r1",
    round: 2,
    maxRounds: 3,
    status: "completed",
    publicFacts: [],
    resources: {},
    participants: [p()],
    recentEvents: [],
    ...overrides,
  };
}

describe("defaultStyleForCategory", () => {
  it("maps known categories to expected styles", () => {
    expect(defaultStyleForCategory("survival-dilemma")).toBe("dark-cockpit-drama");
    expect(defaultStyleForCategory("debate")).toBe("minimal-courtroom");
    expect(defaultStyleForCategory("reality-show")).toBe(
      "reality-show-confession-cam",
    );
    expect(defaultStyleForCategory("game-theory")).toBe("sci-fi-control-room");
  });
  it("falls back to slideshow for unknown / missing", () => {
    expect(defaultStyleForCategory(undefined)).toBe("clean-transcript-slideshow");
    expect(defaultStyleForCategory("does-not-exist")).toBe(
      "clean-transcript-slideshow",
    );
  });
});

describe("buildStoryboard", () => {
  it("orders scenes by round then createdAt and skips system messages", () => {
    const sb = buildStoryboard({
      runId: "r1",
      state: state(),
      scenarioCategory: "survival-dilemma",
      messages: [
        m({ id: "a", round: 2, createdAt: "2026-01-01T00:00:02Z", content: "round two" }),
        m({ id: "b", round: 1, createdAt: "2026-01-01T00:00:00Z", content: "first" }),
        m({ id: "c", round: 1, createdAt: "2026-01-01T00:00:01Z", content: "second", speakerType: "system" }),
      ],
    });
    expect(sb.scenes.map((s) => s.id)).toEqual([
      "r1-scene-0",
      "r1-scene-1",
    ]);
    expect(sb.scenes[0].text).toBe("first");
    expect(sb.scenes[1].text).toBe("round two");
    expect(sb.style).toBe("dark-cockpit-drama");
  });

  it("derives durations from audio assets when present, sums chunked clips", () => {
    const sb = buildStoryboard({
      runId: "r1",
      state: state(),
      messages: [m({ id: "m1", content: "hi" })],
      audioAssets: [
        asset({ id: "a1", messageId: "m1", sequenceIndex: 0, durationMs: 1500 }),
        asset({ id: "a2", messageId: "m1", sequenceIndex: 1, durationMs: 2500 }),
      ],
    });
    expect(sb.scenes).toHaveLength(1);
    expect(sb.scenes[0].durationMs).toBe(4000);
    expect(sb.scenes[0].audioAssetIds).toEqual(["a1", "a2"]);
    expect(sb.totalDurationMs).toBe(4000);
  });

  it("falls back to a reading-speed estimate (clamped to MIN_SCENE_MS) when no audio exists", () => {
    const sb = buildStoryboard({
      runId: "r1",
      state: state(),
      messages: [m({ content: "hi" })],
    });
    expect(sb.scenes[0].durationMs).toBeGreaterThanOrEqual(
      STORYBOARD_INTERNALS.MIN_SCENE_MS,
    );
  });

  it("ignores failed audio assets when summing duration", () => {
    const sb = buildStoryboard({
      runId: "r1",
      state: state(),
      messages: [m({ id: "m1", content: "hi" })],
      audioAssets: [
        asset({ id: "a1", messageId: "m1", sequenceIndex: 0, durationMs: 4000, status: "failed" }),
      ],
    });
    // No usable clips → falls back to estimate (≥ MIN_SCENE_MS)
    expect(sb.scenes[0].audioAssetIds).toEqual([]);
    expect(sb.scenes[0].durationMs).toBeGreaterThanOrEqual(
      STORYBOARD_INTERNALS.MIN_SCENE_MS,
    );
  });

  it("computes monotonically increasing startMs/endMs", () => {
    const sb = buildStoryboard({
      runId: "r1",
      state: state(),
      messages: [
        m({ id: "m1", round: 1, createdAt: "2026-01-01T00:00:00Z" }),
        m({ id: "m2", round: 1, createdAt: "2026-01-01T00:00:01Z" }),
        m({ id: "m3", round: 2, createdAt: "2026-01-01T00:00:02Z" }),
      ],
      audioAssets: [
        asset({ id: "a1", messageId: "m1", sequenceIndex: 0, durationMs: 3000 }),
        asset({ id: "a2", messageId: "m2", sequenceIndex: 0, durationMs: 4000 }),
        asset({ id: "a3", messageId: "m3", sequenceIndex: 0, durationMs: 5000 }),
      ],
    });
    expect(sb.scenes[0].startMs).toBe(0);
    expect(sb.scenes[0].endMs).toBe(3000);
    expect(sb.scenes[1].startMs).toBe(3000);
    expect(sb.scenes[1].endMs).toBe(7000);
    expect(sb.scenes[2].startMs).toBe(7000);
    expect(sb.scenes[2].endMs).toBe(12000);
    expect(sb.totalDurationMs).toBe(12000);
  });

  it("respects styleOverride and excludes judge messages when includeJudge=false", () => {
    const sb = buildStoryboard({
      runId: "r1",
      state: state(),
      styleOverride: "sci-fi-control-room",
      includeJudge: false,
      messages: [
        m({ id: "m1", speakerType: "actor" }),
        m({ id: "m2", speakerType: "judge", displayName: "Judge", participantId: undefined }),
      ],
    });
    expect(sb.style).toBe("sci-fi-control-room");
    expect(sb.scenes).toHaveLength(1);
    expect(sb.scenes[0].speakerType).toBe("actor");
  });
});

describe("storyboardToExportJSON", () => {
  it("serializes a stable shape without internal refs", () => {
    const sb = buildStoryboard({
      runId: "r1",
      state: state(),
      messages: [m({ content: "hello" })],
    });
    const json = storyboardToExportJSON(sb);
    expect(json.runId).toBe("r1");
    expect(json.sceneCount).toBe(1);
    expect(json.scenes[0]).toMatchObject({
      index: 0,
      round: 1,
      speakerId: "p1",
      speakerType: "actor",
      displayName: "GPT",
      text: "hello",
      backgroundStyle: "clean-transcript-slideshow",
      audioAssetIds: [],
      isJudge: false,
    });
  });
});
