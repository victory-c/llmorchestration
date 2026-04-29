import { nanoid } from "nanoid";
import type { ModelGateway } from "@/server/gateways/types";
import type { RunRepository } from "@/server/store/types";
import type {
  RunState,
  TranscriptMessage,
} from "@/server/engine/types";
import { buildActorPrompt } from "@/server/engine/buildActorPrompt";
import { buildJudgePrompt } from "@/server/engine/buildJudgePrompt";
import {
  validateJudgeOutput,
  synthesizeFallbackJudgeOutput,
} from "@/server/engine/validateJudgeOutput";
import { applyStateUpdate } from "@/server/engine/applyStateUpdate";
import { getDefaultJudgeModelId } from "@/server/models/registry";
import { logModelCall } from "@/server/cost/logUsage";

export type RunOneRoundDeps = {
  gateway: ModelGateway;
  store: RunRepository;
  now?: () => Date;
  judgeModelId?: string;
  maxOutputTokens?: number;
};

export async function runOneRound(
  runId: string,
  deps: RunOneRoundDeps,
): Promise<{ state: RunState; terminated: boolean }> {
  const stored = await deps.store.getRun(runId);
  if (!stored) throw new Error(`Run not found: ${runId}`);

  const { state, scenario } = stored;
  const now = deps.now ?? (() => new Date());
  const maxOutputTokens = deps.maxOutputTokens ?? 300;

  if (state.status !== "running" && state.status !== "queued") {
    return { state, terminated: true };
  }
  if (state.round >= state.maxRounds) {
    const completed: RunState = {
      ...state,
      status: "completed",
      terminationReason: state.terminationReason ?? "max-rounds-reached",
    };
    await deps.store.updateRunState(runId, completed);
    return { state: completed, terminated: true };
  }

  const runningState: RunState = { ...state, status: "running" };
  await deps.store.updateRunState(runId, runningState);

  const activeParticipants = runningState.participants.filter(
    (p) => p.status === "active",
  );

  const actorRequests = activeParticipants.map((p) =>
    buildActorPrompt({
      scenario,
      state: runningState,
      participant: p,
      recentMessages: stored.messages,
      maxOutputTokens,
    }),
  );

  const actorResults = await Promise.allSettled(
    actorRequests.map((req) => deps.gateway.generate(req)),
  );

  const newRoundMessages: TranscriptMessage[] = [];
  for (let i = 0; i < activeParticipants.length; i++) {
    const participant = activeParticipants[i]!;
    const result = actorResults[i]!;
    if (result.status === "rejected") {
      const msg: TranscriptMessage = {
        id: nanoid(),
        runId,
        round: runningState.round + 1,
        participantId: participant.id,
        speakerType: "system",
        displayName: "System",
        content: `${participant.displayName} failed to respond this round.`,
        createdAt: now().toISOString(),
      };
      await deps.store.appendMessage(runId, msg);
      newRoundMessages.push(msg);
      continue;
    }
    const response = result.value;
    const msg: TranscriptMessage = {
      id: nanoid(),
      runId,
      round: runningState.round + 1,
      participantId: participant.id,
      speakerType: "actor",
      displayName: participant.displayName,
      content: response.content,
      modelId: response.model,
      provider: response.provider,
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
      estimatedCostUsd: response.usage?.estimatedCostUsd,
      latencyMs: response.latencyMs,
      createdAt: now().toISOString(),
    };
    await deps.store.appendMessage(runId, msg);
    newRoundMessages.push(msg);
    logModelCall({
      runId,
      participantId: participant.id,
      provider: response.provider,
      modelId: response.model,
      usage: response.usage,
      latencyMs: response.latencyMs,
    });
  }

  const judgeRequest = buildJudgePrompt({
    scenario,
    state: runningState,
    roundMessages: newRoundMessages,
    judgeModelId: deps.judgeModelId ?? getDefaultJudgeModelId(),
    maxOutputTokens,
  });

  let judgeOutput;
  try {
    const raw = await deps.gateway.generate(judgeRequest);
    logModelCall({
      runId,
      provider: raw.provider,
      modelId: raw.model,
      usage: raw.usage,
      latencyMs: raw.latencyMs,
      metadata: { role: "judge" },
    });
    const first = validateJudgeOutput(raw.content);
    if (first.ok) {
      judgeOutput = first.value;
    } else {
      const repairRequest = {
        ...judgeRequest,
        messages: [
          ...judgeRequest.messages,
          {
            role: "user" as const,
            content: `Your previous output was invalid: ${first.error}\nYou MUST output only valid JSON matching the schema. No prose.`,
          },
        ],
      };
      const retry = await deps.gateway.generate(repairRequest);
      const second = validateJudgeOutput(retry.content);
      judgeOutput = second.ok
        ? second.value
        : synthesizeFallbackJudgeOutput({
            round: runningState.round,
            maxRounds: runningState.maxRounds,
            reason: second.error,
          });
    }
  } catch (err) {
    judgeOutput = synthesizeFallbackJudgeOutput({
      round: runningState.round,
      maxRounds: runningState.maxRounds,
      reason: `judge call threw: ${(err as Error).message}`,
    });
  }

  const judgeMessage: TranscriptMessage = {
    id: nanoid(),
    runId,
    round: runningState.round + 1,
    speakerType: "judge",
    displayName: "Judge",
    content: judgeOutput.roundSummary,
    createdAt: now().toISOString(),
  };
  await deps.store.appendMessage(runId, judgeMessage);

  const nextState = applyStateUpdate(runningState, judgeOutput);

  const terminal =
    judgeOutput.shouldTerminate || nextState.round >= nextState.maxRounds;
  const finalState: RunState = terminal
    ? {
        ...nextState,
        status: "completed",
        terminationReason:
          judgeOutput.terminationReason ??
          nextState.terminationReason ??
          "max-rounds-reached",
      }
    : nextState;

  await deps.store.updateRunState(runId, finalState);
  await deps.store.appendSnapshot(runId, {
    round: finalState.round,
    state: finalState,
    judgeOutput,
    createdAt: now().toISOString(),
  });

  return { state: finalState, terminated: terminal };
}
