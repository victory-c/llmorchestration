import type { RunParticipant, Scenario } from "@/server/engine/types";
import { findModel } from "@/server/models/registry";

const CHARS_PER_TOKEN = 4;

export function approxTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export type EstimateRunCostInput = {
  scenario: Scenario;
  participants: RunParticipant[];
  judgeModelId: string;
  rounds: number;
  avgOutputTokensPerActor: number;
  avgOutputTokensPerJudge: number;
  systemPromptCharsPerActor?: number;
  recentTranscriptCharsPerRound?: number;
};

export type EstimateRunCostResult = {
  estimatedUsd: number;
  perParticipant: Record<string, number>;
  judgeUsd: number;
  breakdown: {
    totalInputTokens: number;
    totalOutputTokens: number;
  };
};

function perMillionCost(n: number | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export function estimateCallCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const model = findModel(modelId);
  if (!model) return 0;
  const inRate = perMillionCost(model.inputCostPerMillionTokens);
  const outRate = perMillionCost(model.outputCostPerMillionTokens);
  return (inputTokens * inRate + outputTokens * outRate) / 1_000_000;
}

export function estimateRunCost(
  input: EstimateRunCostInput,
): EstimateRunCostResult {
  const systemChars = input.systemPromptCharsPerActor ?? 1500;
  const transcriptChars = input.recentTranscriptCharsPerRound ?? 800;

  const perRoundInputTokensActor = approxTokens(
    `${" ".repeat(systemChars)}${" ".repeat(transcriptChars)}`,
  );
  const perRoundInputTokensJudge = approxTokens(
    `${" ".repeat(systemChars)}${" ".repeat(transcriptChars * 2)}`,
  );

  const perParticipant: Record<string, number> = {};
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let actorCost = 0;

  for (const p of input.participants) {
    const roundCost = estimateCallCost(
      p.modelId,
      perRoundInputTokensActor,
      input.avgOutputTokensPerActor,
    );
    const cost = roundCost * input.rounds;
    perParticipant[p.id] = cost;
    actorCost += cost;
    totalInputTokens += perRoundInputTokensActor * input.rounds;
    totalOutputTokens += input.avgOutputTokensPerActor * input.rounds;
  }

  const judgeRoundCost = estimateCallCost(
    input.judgeModelId,
    perRoundInputTokensJudge,
    input.avgOutputTokensPerJudge,
  );
  const judgeUsd = judgeRoundCost * input.rounds;
  totalInputTokens += perRoundInputTokensJudge * input.rounds;
  totalOutputTokens += input.avgOutputTokensPerJudge * input.rounds;

  return {
    estimatedUsd: actorCost + judgeUsd,
    perParticipant,
    judgeUsd,
    breakdown: {
      totalInputTokens,
      totalOutputTokens,
    },
  };
}
