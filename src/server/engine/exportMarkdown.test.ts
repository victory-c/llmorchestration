import { describe, expect, it } from "vitest";
import { exportRunMarkdown } from "@/server/engine/exportMarkdown";
import type { StoredRun } from "@/server/store/types";

function makeRun(): StoredRun {
  const now = new Date().toISOString();
  return {
    scenario: {
      id: "s1",
      title: "The Last Four Parachutes",
      description: "Plane crash scenario.",
      maxRounds: 3,
      publicFacts: [],
      resources: {},
      rules: [],
      terminationConditions: [],
    },
    state: {
      scenarioId: "s1",
      runId: "r1",
      round: 3,
      maxRounds: 3,
      status: "completed",
      publicFacts: [],
      resources: {},
      participants: [
        {
          id: "p1",
          displayName: "GPT",
          modelId: "mock-gpt",
          status: "saved",
          publicPersona: "Pragmatic",
        },
      ],
      recentEvents: [],
      terminationReason: "max-rounds-reached",
    },
    messages: [
      {
        id: "m1",
        runId: "r1",
        round: 1,
        participantId: "p1",
        speakerType: "actor",
        displayName: "GPT",
        modelId: "mock-gpt",
        content: "I propose rotation.",
        createdAt: now,
      },
      {
        id: "m2",
        runId: "r1",
        round: 1,
        speakerType: "judge",
        displayName: "Judge",
        content: "Round 1 concluded.",
        createdAt: now,
      },
    ],
    snapshots: [],
  };
}

describe("exportRunMarkdown", () => {
  it("includes scenario title, run id, and round headers", () => {
    const md = exportRunMarkdown(makeRun());
    expect(md).toContain("# The Last Four Parachutes");
    expect(md).toContain("`r1`");
    expect(md).toContain("## Round 1");
  });

  it("shows speaker names and judge summaries", () => {
    const md = exportRunMarkdown(makeRun());
    expect(md).toContain("GPT");
    expect(md).toContain("Judge");
    expect(md).toContain("Round 1 concluded.");
  });

  it("lists participants with status", () => {
    const md = exportRunMarkdown(makeRun());
    expect(md).toContain("## Participants");
    expect(md).toMatch(/GPT.*saved/);
  });
});
