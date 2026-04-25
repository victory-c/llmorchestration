import { describe, expect, it } from "vitest";
import { buildJudgePrompt } from "@/server/engine/buildJudgePrompt";
import type {
  RunState,
  Scenario,
  TranscriptMessage,
} from "@/server/engine/types";

const scenario: Scenario = {
  id: "s1",
  title: "T",
  description: "D",
  maxRounds: 3,
  publicFacts: [],
  resources: {},
  rules: ["Only the judge updates state."],
  terminationConditions: ["Max rounds reached."],
};

const state: RunState = {
  scenarioId: "s1",
  runId: "r1",
  round: 0,
  maxRounds: 3,
  status: "running",
  publicFacts: [],
  resources: {},
  participants: [
    {
      id: "p1",
      displayName: "GPT",
      modelId: "mock-gpt",
      status: "active",
      publicPersona: "",
    },
  ],
  recentEvents: [],
};

const roundMessages: TranscriptMessage[] = [
  {
    id: "m1",
    runId: "r1",
    round: 1,
    participantId: "p1",
    speakerType: "actor",
    displayName: "GPT",
    content: "I propose rotation.",
    createdAt: new Date().toISOString(),
  },
];

describe("buildJudgePrompt", () => {
  it("sets responseFormat=json and includes the schema", () => {
    const req = buildJudgePrompt({
      scenario,
      state,
      roundMessages,
      judgeModelId: "mock-judge",
      maxOutputTokens: 300,
    });
    expect(req.responseFormat).toBe("json");
    expect(req.messages[0]?.content).toContain('"roundSummary"');
    expect(req.messages[0]?.content).toContain('"shouldTerminate"');
  });

  it("forbids favoring providers in the system prompt", () => {
    const req = buildJudgePrompt({
      scenario,
      state,
      roundMessages,
      judgeModelId: "mock-judge",
      maxOutputTokens: 300,
    });
    expect(req.systemPrompt?.toLowerCase()).toMatch(/neutral|never favor/);
  });

  it("passes judgeContext to the gateway via metadata", () => {
    const req = buildJudgePrompt({
      scenario,
      state,
      roundMessages,
      judgeModelId: "mock-judge",
      maxOutputTokens: 300,
    });
    const ctx = req.metadata?.judgeContext as {
      round: number;
      maxRounds: number;
    };
    expect(ctx.round).toBe(0);
    expect(ctx.maxRounds).toBe(3);
  });
});
