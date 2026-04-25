import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  preflightRunLimits,
  clampModelRequestTokens,
  checkMidRunBudget,
  LimitViolationError,
} from "@/server/cost/enforceLimits";
import { resetEnvCacheForTests } from "@/lib/env";
import * as registry from "@/server/models/registry";
import type { RunParticipant, Scenario } from "@/server/engine/types";

const baseScenario: Scenario = {
  id: "s1",
  title: "T",
  description: "D",
  maxRounds: 3,
  publicFacts: [],
  resources: {},
  rules: [],
  terminationConditions: [],
};

function participants(n: number): RunParticipant[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    displayName: `P${i}`,
    modelId: "mock-gpt",
    status: "active",
    publicPersona: "",
  }));
}

const baseEnv = { ...process.env };

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCacheForTests();
}

beforeEach(() => {
  for (const k of Object.keys(process.env))
    if (!(k in baseEnv)) delete process.env[k];
  Object.assign(process.env, baseEnv);
  resetEnvCacheForTests();
});

describe("preflightRunLimits", () => {
  it("returns an estimate for a mock run", () => {
    setEnv({
      MAX_PARTICIPANTS_PER_RUN: "6",
      MAX_ROUNDS_PER_RUN: "3",
      MAX_OUTPUT_TOKENS_PER_CALL: "400",
      MAX_ESTIMATED_COST_PER_RUN_USD: "0.25",
      GLOBAL_AI_KILL_SWITCH: "false",
    });
    const res = preflightRunLimits({
      scenario: baseScenario,
      participants: participants(3),
      judgeModelId: "mock-judge",
      maxRounds: 3,
      maxOutputTokensPerCall: 300,
    });
    expect(res.estimatedUsd).toBe(0); // mock = free
  });

  it("throws kill-switch when GLOBAL_AI_KILL_SWITCH=true", () => {
    setEnv({ GLOBAL_AI_KILL_SWITCH: "true" });
    expect(() =>
      preflightRunLimits({
        scenario: baseScenario,
        participants: participants(2),
        judgeModelId: "mock-judge",
        maxRounds: 3,
        maxOutputTokensPerCall: 300,
      }),
    ).toThrow(LimitViolationError);
  });

  it("throws max-participants when count exceeds env cap", () => {
    setEnv({ MAX_PARTICIPANTS_PER_RUN: "2" });
    try {
      preflightRunLimits({
        scenario: baseScenario,
        participants: participants(3),
        judgeModelId: "mock-judge",
        maxRounds: 3,
        maxOutputTokensPerCall: 300,
      });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(LimitViolationError);
      expect((e as LimitViolationError).code).toBe("max-participants");
    }
  });

  it("throws estimated-cost when run exceeds cap", () => {
    setEnv({
      MAX_PARTICIPANTS_PER_RUN: "6",
      MAX_ROUNDS_PER_RUN: "6",
      MAX_OUTPUT_TOKENS_PER_CALL: "400",
      MAX_ESTIMATED_COST_PER_RUN_USD: "0.0001",
    });
    const realParticipants: RunParticipant[] = [
      {
        id: "p1",
        displayName: "GPT",
        modelId: "openrouter-gpt-4o-mini",
        status: "active",
        publicPersona: "",
      },
    ];
    try {
      preflightRunLimits({
        scenario: baseScenario,
        participants: realParticipants,
        judgeModelId: "openrouter-claude-haiku",
        maxRounds: 3,
        maxOutputTokensPerCall: 400,
      });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(LimitViolationError);
      expect((e as LimitViolationError).code).toBe("estimated-cost");
    }
  });

  it("throws model-disabled for disabled model", () => {
    setEnv({ MAX_ESTIMATED_COST_PER_RUN_USD: "10" });
    // Stub findModel so we can simulate a disabled-registry entry without
    // depending on which specific models the registry currently ships as
    // enabled — M4 flipped the Vercel gateway models on.
    const real = registry.findModel;
    const spy = vi.spyOn(registry, "findModel").mockImplementation((id) => {
      if (id === "disabled-test-model") {
        return {
          id: "disabled-test-model",
          displayName: "Disabled Test Model",
          provider: "openrouter",
          gatewayModelId: "openai/disabled",
          enabled: false,
          supportsJson: true,
          supportsStreaming: false,
          inputCostPerMillionTokens: 0,
          outputCostPerMillionTokens: 0,
        };
      }
      return real(id);
    });

    const disabled: RunParticipant[] = [
      {
        id: "p1",
        displayName: "X",
        modelId: "disabled-test-model",
        status: "active",
        publicPersona: "",
      },
    ];
    try {
      preflightRunLimits({
        scenario: baseScenario,
        participants: disabled,
        judgeModelId: "openrouter-claude-haiku",
        maxRounds: 1,
        maxOutputTokensPerCall: 100,
      });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(LimitViolationError);
      expect((e as LimitViolationError).code).toBe("model-disabled");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("clampModelRequestTokens", () => {
  it("clamps maxOutputTokens to env cap", () => {
    setEnv({ MAX_OUTPUT_TOKENS_PER_CALL: "100" });
    const clamped = clampModelRequestTokens({
      model: "mock-gpt",
      messages: [],
      maxOutputTokens: 999,
    });
    expect(clamped.maxOutputTokens).toBe(100);
  });

  it("leaves request untouched when under cap", () => {
    setEnv({ MAX_OUTPUT_TOKENS_PER_CALL: "500" });
    const req = {
      model: "mock-gpt",
      messages: [],
      maxOutputTokens: 100,
    };
    const out = clampModelRequestTokens(req);
    expect(out).toBe(req);
  });

  it("throws when kill switch is set", () => {
    setEnv({ GLOBAL_AI_KILL_SWITCH: "true" });
    expect(() =>
      clampModelRequestTokens({
        model: "mock-gpt",
        messages: [],
      }),
    ).toThrow();
  });
});

describe("checkMidRunBudget", () => {
  it("throws when projected total exceeds cap", () => {
    setEnv({ MAX_ESTIMATED_COST_PER_RUN_USD: "0.1" });
    expect(() =>
      checkMidRunBudget({
        actualCostUsd: 0.09,
        estimatedNextRoundUsd: 0.05,
      }),
    ).toThrow(LimitViolationError);
  });

  it("allows spending under the cap", () => {
    setEnv({ MAX_ESTIMATED_COST_PER_RUN_USD: "1" });
    expect(() =>
      checkMidRunBudget({
        actualCostUsd: 0.01,
        estimatedNextRoundUsd: 0.02,
      }),
    ).not.toThrow();
  });
});
