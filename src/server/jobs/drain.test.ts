import { beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { memoryStore } from "@/server/store/memoryStore";
import {
  memoryQueue,
  resetMemoryQueueForTests,
} from "@/server/jobs/memoryQueue";
import { drainJobs } from "@/server/jobs/drain";
import { createRunFromTemplate } from "@/server/engine/createRun";
import { findTemplate } from "@/server/scenarios/templates";
import { defaultMockParticipants } from "@/server/scenarios/mockParticipants";
import { resetUsageEventsForTests } from "@/server/cost/logUsage";
import { resetRunModerationFlagsForTests } from "@/server/jobs/handlers";

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCacheForTests();
}

beforeEach(() => {
  // Reset every global state the drain depends on.
  (globalThis as unknown as { __arenaMemoryStore: undefined }).__arenaMemoryStore =
    undefined;
  resetMemoryQueueForTests();
  resetUsageEventsForTests();
  resetRunModerationFlagsForTests();
  setEnv({
    MODEL_GATEWAY_PROVIDER: "mock",
    GLOBAL_AI_KILL_SWITCH: undefined,
    MAX_PARTICIPANTS_PER_RUN: "6",
    MAX_ROUNDS_PER_RUN: "6",
    MAX_OUTPUT_TOKENS_PER_CALL: "300",
    MAX_ESTIMATED_COST_PER_RUN_USD: "1",
    TICK_MAX_JOBS_PER_CALL: "5",
    DEMO_MODE: "false",
    JOBS_TICK_TOKEN: undefined,
  });
});

describe("drainJobs (mock end-to-end)", () => {
  it("processes run-round jobs sequentially until run completes", async () => {
    const template = findTemplate("plane-crash");
    expect(template).toBeDefined();
    const stored = await createRunFromTemplate(
      {
        template: template!,
        participants: defaultMockParticipants.slice(0, 3),
        maxRounds: 2,
      },
      memoryStore,
    );
    const runId = stored.state.runId;

    await memoryQueue.enqueue({
      type: "run-round",
      payload: { runId },
    });

    // Drain rounds one tick at a time (up to a safety cap).
    let iterations = 0;
     
    while (iterations < 10) {
      iterations++;
      const result = await drainJobs({ maxJobs: 1 });
      if (result.remaining === 0 && result.drained === 0) break;
      const run = await memoryStore.getRun(runId);
      if (
        run?.state.status === "completed" ||
        run?.state.status === "failed" ||
        run?.state.status === "cancelled"
      ) {
        break;
      }
    }

    const finalRun = await memoryStore.getRun(runId);
    expect(finalRun?.state.status).toBe("completed");
    expect(finalRun?.state.round).toBeGreaterThanOrEqual(2);
  });

  it("respects GLOBAL_AI_KILL_SWITCH and drains zero jobs", async () => {
    await memoryQueue.enqueue({
      type: "run-round",
      payload: { runId: "phantom" },
    });
    setEnv({ GLOBAL_AI_KILL_SWITCH: "true" });
    const result = await drainJobs({ maxJobs: 5 });
    expect(result.drained).toBe(0);
    expect(result.killSwitch).toBe(true);
    const stats = await memoryQueue.stats();
    expect(stats.queued).toBe(1);
  });

  it("enforces TICK_MAX_JOBS_PER_CALL via options", async () => {
    for (let i = 0; i < 8; i++) {
      await memoryQueue.enqueue({
        type: "run-round",
        payload: { runId: `ghost-${i}` },
      });
    }
    const result = await drainJobs({ maxJobs: 3 });
    expect(result.drained + result.failed).toBeLessThanOrEqual(3);
  });
});
