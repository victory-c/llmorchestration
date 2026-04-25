import { describe, expect, it } from "vitest";
import { applyStateUpdate } from "@/server/engine/applyStateUpdate";
import type { JudgeOutput, RunState } from "@/server/engine/types";

function makeState(): RunState {
  return {
    scenarioId: "s1",
    runId: "r1",
    round: 0,
    maxRounds: 3,
    status: "running",
    publicFacts: ["a"],
    resources: { parachutes: 4 },
    participants: [
      {
        id: "p1",
        displayName: "GPT",
        modelId: "mock-gpt",
        status: "active",
        publicPersona: "",
      },
      {
        id: "p2",
        displayName: "Claude",
        modelId: "mock-claude",
        status: "active",
        publicPersona: "",
      },
    ],
    recentEvents: [],
  };
}

describe("applyStateUpdate", () => {
  it("does not mutate the input state", () => {
    const state = makeState();
    const snapshot = JSON.parse(JSON.stringify(state));
    const judge: JudgeOutput = {
      roundSummary: "ok",
      stateUpdates: { round: 1 },
      newEvents: [],
      shouldTerminate: false,
    };
    applyStateUpdate(state, judge);
    expect(state).toEqual(snapshot);
  });

  it("applies participant status updates", () => {
    const judge: JudgeOutput = {
      roundSummary: "ok",
      stateUpdates: {},
      participantStatusUpdates: { p1: "saved", p2: "eliminated" },
      newEvents: [],
      shouldTerminate: true,
    };
    const next = applyStateUpdate(makeState(), judge);
    expect(next.participants.find((p) => p.id === "p1")?.status).toBe("saved");
    expect(next.participants.find((p) => p.id === "p2")?.status).toBe(
      "eliminated",
    );
  });

  it("appends new events tagged with the new round", () => {
    const judge: JudgeOutput = {
      roundSummary: "ok",
      stateUpdates: { round: 2 },
      newEvents: [{ type: "vote", description: "Vote called." }],
      shouldTerminate: false,
    };
    const next = applyStateUpdate(makeState(), judge);
    expect(next.recentEvents).toHaveLength(1);
    expect(next.recentEvents[0]?.round).toBe(2);
    expect(next.recentEvents[0]?.description).toBe("Vote called.");
  });

  it("sets status=completed when shouldTerminate=true", () => {
    const judge: JudgeOutput = {
      roundSummary: "done",
      stateUpdates: {},
      newEvents: [],
      shouldTerminate: true,
      terminationReason: "max-rounds-reached",
    };
    const next = applyStateUpdate(makeState(), judge);
    expect(next.status).toBe("completed");
    expect(next.terminationReason).toBe("max-rounds-reached");
  });

  it("merges resources non-destructively", () => {
    const judge: JudgeOutput = {
      roundSummary: "ok",
      stateUpdates: { resources: { parachutes: 3, minutesRemaining: 5 } },
      newEvents: [],
      shouldTerminate: false,
    };
    const next = applyStateUpdate(makeState(), judge);
    expect(next.resources.parachutes).toBe(3);
    expect(next.resources.minutesRemaining).toBe(5);
  });
});
