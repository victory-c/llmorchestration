import { describe, expect, it } from "vitest";
import { buildActorPrompt } from "@/server/engine/buildActorPrompt";
import type { RunState, Scenario } from "@/server/engine/types";

const scenario: Scenario = {
  id: "s1",
  title: "The Last Four Parachutes",
  description: "Plane crash scenario.",
  maxRounds: 3,
  publicFacts: ["The plane is descending rapidly."],
  resources: { parachutes: 4 },
  rules: ["Be dramatic."],
  terminationConditions: ["Max rounds reached."],
};

const state: RunState = {
  scenarioId: "s1",
  runId: "r1",
  round: 0,
  maxRounds: 3,
  status: "running",
  publicFacts: scenario.publicFacts,
  resources: scenario.resources,
  participants: [
    {
      id: "p1",
      displayName: "GPT",
      modelId: "mock-gpt",
      status: "active",
      publicPersona: "Pragmatic",
    },
  ],
  recentEvents: [],
};

describe("buildActorPrompt", () => {
  it("includes scenario description, rules, and participant persona in the system prompt", () => {
    const req = buildActorPrompt({
      scenario,
      state,
      participant: state.participants[0]!,
      recentMessages: [],
      maxOutputTokens: 200,
    });

    expect(req.model).toBe("mock-gpt");
    expect(req.systemPrompt).toContain("The Last Four Parachutes");
    expect(req.systemPrompt).toContain("Plane crash scenario.");
    expect(req.systemPrompt).toContain("Be dramatic.");
    expect(req.systemPrompt).toContain("Pragmatic");
    expect(req.responseFormat).toBe("text");
  });

  it("hides private goal when revealPrivateGoal=false", () => {
    const participant = {
      ...state.participants[0]!,
      privateGoal: "SECRET-GOAL-TOKEN",
    };
    const req = buildActorPrompt({
      scenario,
      state,
      participant,
      recentMessages: [],
      maxOutputTokens: 200,
      revealPrivateGoal: false,
    });
    expect(req.systemPrompt).not.toContain("SECRET-GOAL-TOKEN");
  });

  it("propagates participant metadata to the model request", () => {
    const req = buildActorPrompt({
      scenario,
      state,
      participant: state.participants[0]!,
      recentMessages: [],
      maxOutputTokens: 200,
    });
    expect(req.metadata?.participantId).toBe("p1");
    expect(req.metadata?.speakerType).toBe("actor");
  });
});
