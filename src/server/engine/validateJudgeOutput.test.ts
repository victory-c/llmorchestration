import { describe, expect, it } from "vitest";
import {
  validateJudgeOutput,
  synthesizeFallbackJudgeOutput,
} from "@/server/engine/validateJudgeOutput";

describe("validateJudgeOutput", () => {
  it("accepts well-formed JSON", () => {
    const raw = JSON.stringify({
      roundSummary: "Round 1 ended.",
      stateUpdates: { round: 1 },
      newEvents: [{ type: "note", description: "ok" }],
      shouldTerminate: false,
    });
    const result = validateJudgeOutput(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.roundSummary).toBe("Round 1 ended.");
    }
  });

  it("extracts JSON from a code fence", () => {
    const raw = [
      "Here's the result:",
      "```json",
      JSON.stringify({
        roundSummary: "ok",
        stateUpdates: {},
        newEvents: [],
        shouldTerminate: true,
      }),
      "```",
    ].join("\n");
    const result = validateJudgeOutput(raw);
    expect(result.ok).toBe(true);
  });

  it("rejects missing required fields", () => {
    const raw = JSON.stringify({ stateUpdates: {} });
    const result = validateJudgeOutput(raw);
    expect(result.ok).toBe(false);
  });

  it("rejects non-JSON input", () => {
    const result = validateJudgeOutput("not json");
    expect(result.ok).toBe(false);
  });
});

describe("synthesizeFallbackJudgeOutput", () => {
  it("terminates when nextRound >= maxRounds", () => {
    const out = synthesizeFallbackJudgeOutput({
      round: 2,
      maxRounds: 3,
      reason: "test",
    });
    expect(out.shouldTerminate).toBe(true);
    expect(out.terminationReason).toBe("max-rounds-reached");
  });

  it("does not terminate mid-run", () => {
    const out = synthesizeFallbackJudgeOutput({
      round: 0,
      maxRounds: 3,
      reason: "test",
    });
    expect(out.shouldTerminate).toBe(false);
  });
});
