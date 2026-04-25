import { describe, expect, it } from "vitest";
import {
  approxTokens,
  estimateCallCost,
  estimateRunCost,
} from "@/server/cost/estimateCost";
import type { RunParticipant, Scenario } from "@/server/engine/types";

const scenario: Scenario = {
  id: "s1",
  title: "T",
  description: "D",
  maxRounds: 3,
  publicFacts: [],
  resources: {},
  rules: [],
  terminationConditions: [],
};

const realParticipant: RunParticipant = {
  id: "p1",
  displayName: "GPT",
  modelId: "openrouter-gpt-4o-mini",
  status: "active",
  publicPersona: "",
};

const mockParticipant: RunParticipant = {
  id: "p2",
  displayName: "MockGPT",
  modelId: "mock-gpt",
  status: "active",
  publicPersona: "",
};

describe("approxTokens", () => {
  it("returns 0 for empty string", () => {
    expect(approxTokens("")).toBe(0);
  });

  it("scales with text length", () => {
    const small = approxTokens("hello world");
    const large = approxTokens("hello world".repeat(100));
    expect(large).toBeGreaterThan(small);
  });
});

describe("estimateCallCost", () => {
  it("is zero for mock models", () => {
    expect(estimateCallCost("mock-gpt", 1000, 500)).toBe(0);
  });

  it("multiplies tokens by registry rates", () => {
    // gpt-4o-mini: $0.15 in / $0.6 out per 1M tokens
    const cost = estimateCallCost("openrouter-gpt-4o-mini", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.15 + 0.6, 5);
  });

  it("returns 0 for unknown model", () => {
    expect(estimateCallCost("does-not-exist", 1000, 1000)).toBe(0);
  });
});

describe("estimateRunCost", () => {
  it("returns zero for all-mock run", () => {
    const result = estimateRunCost({
      scenario,
      participants: [mockParticipant],
      judgeModelId: "mock-judge",
      rounds: 3,
      avgOutputTokensPerActor: 200,
      avgOutputTokensPerJudge: 200,
    });
    expect(result.estimatedUsd).toBe(0);
    expect(result.judgeUsd).toBe(0);
  });

  it("scales with number of rounds and participants", () => {
    const one = estimateRunCost({
      scenario,
      participants: [realParticipant],
      judgeModelId: "openrouter-claude-haiku",
      rounds: 1,
      avgOutputTokensPerActor: 200,
      avgOutputTokensPerJudge: 200,
    });
    const three = estimateRunCost({
      scenario,
      participants: [realParticipant],
      judgeModelId: "openrouter-claude-haiku",
      rounds: 3,
      avgOutputTokensPerActor: 200,
      avgOutputTokensPerJudge: 200,
    });
    expect(three.estimatedUsd).toBeCloseTo(one.estimatedUsd * 3, 5);
  });
});
