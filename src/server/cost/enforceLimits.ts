import { getEnv, type Env } from "@/lib/env";
import {
  HOSTED_DEMO_MAX_COST_USD,
  HOSTED_DEMO_MAX_OUTPUT_TOKENS,
  HOSTED_DEMO_MAX_PARTICIPANTS,
  HOSTED_DEMO_MAX_ROUNDS,
} from "@/lib/constants";
import { GatewayConfigError } from "@/server/gateways/errors";
import { findModel } from "@/server/models/registry";
import type { ModelRequest } from "@/server/gateways/types";
import type { RunParticipant, Scenario } from "@/server/engine/types";
import { estimateRunCost } from "@/server/cost/estimateCost";

export type EffectiveLimits = {
  maxParticipants: number;
  maxRounds: number;
  maxOutputTokensPerCall: number;
  maxEstimatedCostUsd: number;
};

// Applies hosted-demo caps on top of operator env. Hosted mode can only
// tighten, never loosen.
export function effectiveLimits(env: Env = getEnv()): EffectiveLimits {
  if (env.DEMO_MODE) {
    return {
      maxParticipants: Math.min(
        env.MAX_PARTICIPANTS_PER_RUN,
        HOSTED_DEMO_MAX_PARTICIPANTS,
      ),
      maxRounds: Math.min(env.MAX_ROUNDS_PER_RUN, HOSTED_DEMO_MAX_ROUNDS),
      maxOutputTokensPerCall: Math.min(
        env.MAX_OUTPUT_TOKENS_PER_CALL,
        HOSTED_DEMO_MAX_OUTPUT_TOKENS,
      ),
      maxEstimatedCostUsd: Math.min(
        env.MAX_ESTIMATED_COST_PER_RUN_USD,
        HOSTED_DEMO_MAX_COST_USD,
      ),
    };
  }
  return {
    maxParticipants: env.MAX_PARTICIPANTS_PER_RUN,
    maxRounds: env.MAX_ROUNDS_PER_RUN,
    maxOutputTokensPerCall: env.MAX_OUTPUT_TOKENS_PER_CALL,
    maxEstimatedCostUsd: env.MAX_ESTIMATED_COST_PER_RUN_USD,
  };
}

export class LimitViolationError extends Error {
  constructor(
    public readonly code:
      | "kill-switch"
      | "max-participants"
      | "max-rounds"
      | "max-output-tokens"
      | "estimated-cost"
      | "actual-cost"
      | "model-disabled"
      | "unknown-model",
    message: string,
  ) {
    super(message);
    this.name = "LimitViolationError";
  }
}

export type PreflightInput = {
  scenario: Scenario;
  participants: RunParticipant[];
  judgeModelId: string;
  maxRounds: number;
  maxOutputTokensPerCall: number;
};

export type PreflightResult = {
  estimatedUsd: number;
  judgeUsd: number;
  perParticipant: Record<string, number>;
};

export function preflightRunLimits(input: PreflightInput): PreflightResult {
  const env = getEnv();
  const caps = effectiveLimits(env);

  if (env.GLOBAL_AI_KILL_SWITCH) {
    throw new LimitViolationError(
      "kill-switch",
      "AI calls are disabled by the global kill switch (GLOBAL_AI_KILL_SWITCH).",
    );
  }

  if (input.participants.length > caps.maxParticipants) {
    throw new LimitViolationError(
      "max-participants",
      `Run has ${input.participants.length} participants; max is ${caps.maxParticipants}.`,
    );
  }

  if (input.maxRounds > caps.maxRounds) {
    throw new LimitViolationError(
      "max-rounds",
      `Run has ${input.maxRounds} rounds; max is ${caps.maxRounds}.`,
    );
  }

  if (input.maxOutputTokensPerCall > caps.maxOutputTokensPerCall) {
    throw new LimitViolationError(
      "max-output-tokens",
      `maxOutputTokensPerCall ${input.maxOutputTokensPerCall} exceeds cap ${caps.maxOutputTokensPerCall}.`,
    );
  }

  for (const p of input.participants) {
    const m = findModel(p.modelId);
    if (!m) {
      throw new LimitViolationError(
        "unknown-model",
        `Unknown model for participant ${p.id}: ${p.modelId}.`,
      );
    }
    if (!m.enabled) {
      throw new LimitViolationError(
        "model-disabled",
        `Model ${p.modelId} is disabled in this deployment.`,
      );
    }
  }
  const judge = findModel(input.judgeModelId);
  if (!judge) {
    throw new LimitViolationError(
      "unknown-model",
      `Unknown judge model: ${input.judgeModelId}.`,
    );
  }
  if (!judge.enabled) {
    throw new LimitViolationError(
      "model-disabled",
      `Judge model ${input.judgeModelId} is disabled in this deployment.`,
    );
  }

  const estimate = estimateRunCost({
    scenario: input.scenario,
    participants: input.participants,
    judgeModelId: input.judgeModelId,
    rounds: input.maxRounds,
    avgOutputTokensPerActor: input.maxOutputTokensPerCall,
    avgOutputTokensPerJudge: input.maxOutputTokensPerCall,
  });

  if (estimate.estimatedUsd > caps.maxEstimatedCostUsd) {
    throw new LimitViolationError(
      "estimated-cost",
      `Estimated cost $${estimate.estimatedUsd.toFixed(4)} exceeds per-run cap $${caps.maxEstimatedCostUsd}.`,
    );
  }

  return {
    estimatedUsd: estimate.estimatedUsd,
    judgeUsd: estimate.judgeUsd,
    perParticipant: estimate.perParticipant,
  };
}

export function clampModelRequestTokens(req: ModelRequest): ModelRequest {
  const env = getEnv();
  if (env.GLOBAL_AI_KILL_SWITCH) {
    throw new GatewayConfigError(
      "Paid model calls are disabled by GLOBAL_AI_KILL_SWITCH.",
    );
  }
  const caps = effectiveLimits(env);
  const currentMax = req.maxOutputTokens ?? caps.maxOutputTokensPerCall;
  const clamped = Math.min(currentMax, caps.maxOutputTokensPerCall);
  if (clamped === req.maxOutputTokens) return req;
  return { ...req, maxOutputTokens: clamped };
}

export type MidRunBudgetCheck = {
  actualCostUsd: number;
  estimatedNextRoundUsd: number;
};

export function checkMidRunBudget(check: MidRunBudgetCheck): void {
  const caps = effectiveLimits();
  const projected = check.actualCostUsd + check.estimatedNextRoundUsd;
  if (projected > caps.maxEstimatedCostUsd) {
    throw new LimitViolationError(
      "actual-cost",
      `Projected cost $${projected.toFixed(4)} (actual $${check.actualCostUsd.toFixed(4)} + next round $${check.estimatedNextRoundUsd.toFixed(4)}) exceeds cap $${caps.maxEstimatedCostUsd}.`,
    );
  }
}
