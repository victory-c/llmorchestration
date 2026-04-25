import { getEnv } from "@/lib/env";
import { getGateway } from "@/server/gateways";
import { getRunStore } from "@/server/store";
import { runOneRound } from "@/server/engine/runOneRound";
import type { Job } from "@/server/jobs/types";
import { getJobQueue } from "@/server/jobs";
import { getDefaultJudgeModelId } from "@/server/models/registry";
import {
  checkMidRunBudget,
  LimitViolationError,
} from "@/server/cost/enforceLimits";
import { estimateRunCost } from "@/server/cost/estimateCost";
import { moderateActorOutput, MODERATION_OUTPUT_FLAG_THRESHOLD } from "@/server/safety/moderateOutput";
import { logSafetyEvent, sumActualCostUsd } from "@/server/cost/logUsage";
import type { RunState } from "@/server/engine/types";
import { getTTSProvider } from "@/server/tts";
import { getStorage } from "@/server/storage";
import { getMediaAssets } from "@/server/media";
import { generateAudioForRun } from "@/server/media/generateAudio";
import { generateVideoForRun } from "@/server/media/generateVideo";
import type { VideoStyle } from "@/server/media/storyboard";

declare global {
  // eslint-disable-next-line no-var
  var __arenaRunModerationFlags: Map<string, number> | undefined;
}

function flagStore(): Map<string, number> {
  if (!globalThis.__arenaRunModerationFlags)
    globalThis.__arenaRunModerationFlags = new Map();
  return globalThis.__arenaRunModerationFlags;
}

function judgeModelIdForRun(): string {
  const env = getEnv();
  if (env.MODEL_GATEWAY_PROVIDER === "mock") return getDefaultJudgeModelId();
  if (env.MODEL_GATEWAY_PROVIDER === "openrouter") return "openrouter-claude-haiku";
  if (env.MODEL_GATEWAY_PROVIDER === "vercel-ai-gateway")
    return "vercel-claude-haiku";
  return getDefaultJudgeModelId();
}

async function handleRunRound(job: Job): Promise<void> {
  const env = getEnv();
  const runId = (job.payloadJson as { runId?: string }).runId;
  if (!runId) throw new Error("run-round job missing runId");

  const store = getRunStore();
  const queue = getJobQueue();
  const stored = await store.getRun(runId);
  if (!stored) throw new Error(`Run not found: ${runId}`);

  if (
    stored.state.status === "completed" ||
    stored.state.status === "failed" ||
    stored.state.status === "cancelled"
  ) {
    return;
  }

  if (env.MODEL_GATEWAY_PROVIDER !== "mock") {
    const actualCost = sumActualCostUsd(runId);
    const nextRoundEstimate = estimateRunCost({
      scenario: stored.scenario,
      participants: stored.state.participants.filter((p) => p.status === "active"),
      judgeModelId: judgeModelIdForRun(),
      rounds: 1,
      avgOutputTokensPerActor: env.MAX_OUTPUT_TOKENS_PER_CALL,
      avgOutputTokensPerJudge: env.MAX_OUTPUT_TOKENS_PER_CALL,
    }).estimatedUsd;

    try {
      checkMidRunBudget({
        actualCostUsd: actualCost,
        estimatedNextRoundUsd: nextRoundEstimate,
      });
    } catch (err) {
      if (err instanceof LimitViolationError) {
        logSafetyEvent({
          runId,
          eventType: "cost-cap",
          metadata: { reason: err.message },
        });
        const cancelled: RunState = {
          ...stored.state,
          status: "failed",
          terminationReason: "cost_cap",
        };
        await store.updateRunState(runId, cancelled);
        return;
      }
      throw err;
    }
  }

  const gateway = getGateway(env.MODEL_GATEWAY_PROVIDER);
  const { state: newState, terminated } = await runOneRound(runId, {
    gateway,
    store,
    judgeModelId: judgeModelIdForRun(),
    maxOutputTokens: env.MAX_OUTPUT_TOKENS_PER_CALL,
  });

  const updated = await store.getRun(runId);
  if (updated) {
    const lastRound = newState.round;
    const actorMessagesThisRound = updated.messages.filter(
      (m) => m.round === lastRound && m.speakerType === "actor",
    );
    let flags = flagStore().get(runId) ?? 0;
    for (const m of actorMessagesThisRound) {
      const result = moderateActorOutput(m.content);
      if (!result.allowed) {
        flags++;
        logSafetyEvent({
          runId,
          eventType: "moderation-block",
          metadata: {
            messageId: m.id,
            participantId: m.participantId,
            violations: result.violations,
          },
        });
      }
    }
    flagStore().set(runId, flags);

    if (flags >= MODERATION_OUTPUT_FLAG_THRESHOLD) {
      const blocked: RunState = {
        ...newState,
        status: "failed",
        terminationReason: "moderation_block",
      };
      await store.updateRunState(runId, blocked);
      await queue.cancelJobsForRun(runId);
      return;
    }
  }

  if (terminated) return;

  await queue.enqueue({
    type: "run-round",
    payload: { runId },
    priority: job.priority,
  });
}

async function handleGenerateAudio(job: Job): Promise<void> {
  const env = getEnv();
  if (env.DISABLE_TTS_GENERATION) {
    return;
  }

  const runId = (job.payloadJson as { runId?: string }).runId;
  if (!runId) throw new Error("generate-audio job missing runId");

  const store = getRunStore();
  const stored = await store.getRun(runId);
  if (!stored) throw new Error(`Run not found: ${runId}`);

  await generateAudioForRun({
    runId,
    messages: stored.messages,
    participants: stored.state.participants,
    deps: {
      tts: getTTSProvider(env.TTS_PROVIDER),
      storage: getStorage(),
      assets: getMediaAssets(),
    },
  });
}

async function handleGenerateVideo(job: Job): Promise<void> {
  const env = getEnv();
  if (env.DISABLE_VIDEO_GENERATION) {
    return;
  }

  const payload = job.payloadJson as {
    runId?: string;
    style?: string;
  };
  if (!payload.runId) throw new Error("generate-video job missing runId");

  const store = getRunStore();
  const stored = await store.getRun(payload.runId);
  if (!stored) throw new Error(`Run not found: ${payload.runId}`);

  await generateVideoForRun({
    runId: payload.runId,
    scenario: stored.scenario,
    state: stored.state,
    messages: stored.messages,
    styleOverride: payload.style as VideoStyle | undefined,
    deps: {
      storage: getStorage(),
      assets: getMediaAssets(),
    },
  });
}

export async function handleJob(job: Job): Promise<void> {
  switch (job.type) {
    case "run-round":
      await handleRunRound(job);
      return;
    case "generate-audio":
      await handleGenerateAudio(job);
      return;
    case "generate-video":
      await handleGenerateVideo(job);
      return;
    default: {
      const _exhaustive: never = job.type;
      throw new Error(`Unsupported job type: ${_exhaustive}`);
    }
  }
}

export function resetRunModerationFlagsForTests() {
  globalThis.__arenaRunModerationFlags = new Map();
}
