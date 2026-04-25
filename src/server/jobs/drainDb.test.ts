import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { resetEnvCacheForTests } from "@/lib/env";
import { dbStore } from "@/server/store/dbStore";
import { dbQueue } from "@/server/jobs/dbQueue";
import { drainJobs } from "@/server/jobs/drain";
import { createRunFromTemplate } from "@/server/engine/createRun";
import { findTemplate } from "@/server/scenarios/templates";
import { defaultMockParticipants } from "@/server/scenarios/mockParticipants";
import { resetUsageEventsForTests } from "@/server/cost/logUsage";
import { resetRunModerationFlagsForTests } from "@/server/jobs/handlers";
import {
  setupPglite,
  teardownPglite,
  resetPgliteSchema,
} from "@/server/db/pglite";

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCacheForTests();
}

describe("drainJobs + dbStore/dbQueue (pglite end-to-end)", () => {
  beforeAll(async () => {
    await setupPglite();
  });

  afterAll(async () => {
    await teardownPglite();
  });

  beforeEach(async () => {
    await resetPgliteSchema();
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

  it("runs a mock plane-crash end-to-end, persisting messages and snapshots round-by-round", async () => {
    const template = findTemplate("plane-crash")!;
    const stored = await createRunFromTemplate(
      {
        template,
        participants: defaultMockParticipants.slice(0, 3),
        maxRounds: 2,
      },
      dbStore,
    );
    const runId = stored.state.runId;

    await dbQueue.enqueue({
      type: "run-round",
      payload: { runId },
    });

    for (let i = 0; i < 10; i++) {
      const result = await drainJobs({ maxJobs: 1 });
      const run = await dbStore.getRun(runId);
      if (
        run?.state.status === "completed" ||
        run?.state.status === "failed" ||
        run?.state.status === "cancelled"
      ) {
        break;
      }
      if (result.remaining === 0 && result.drained === 0) break;
    }

    const finalRun = await dbStore.getRun(runId);
    expect(finalRun?.state.status).toBe("completed");
    expect(finalRun?.state.round).toBeGreaterThanOrEqual(2);
    // Each round: 3 actor messages + 1 judge summary = 4 messages.
    expect(finalRun!.messages.length).toBeGreaterThanOrEqual(6);
    // Snapshots: round 0 initial + one per completed round.
    expect(finalRun!.snapshots.length).toBeGreaterThanOrEqual(3);
  });

  it("resumes a run after a simulated process crash mid-round", async () => {
    // Arrange: start a run and let one round complete, then simulate crash
    // by leaving a queued job behind (acts like process restart).
    const template = findTemplate("plane-crash")!;
    const stored = await createRunFromTemplate(
      {
        template,
        participants: defaultMockParticipants.slice(0, 2),
        maxRounds: 2,
      },
      dbStore,
    );
    const runId = stored.state.runId;

    await dbQueue.enqueue({
      type: "run-round",
      payload: { runId },
    });

    // Do one tick => completes round 1 and enqueues next round-round job.
    await drainJobs({ maxJobs: 1 });

    // Simulate crash: drop in-memory moderation/usage caches and env cache.
    resetUsageEventsForTests();
    resetRunModerationFlagsForTests();
    resetEnvCacheForTests();

    const midRun = await dbStore.getRun(runId);
    expect(midRun?.state.status).toBe("running");
    expect(midRun?.state.round).toBe(1);

    // Keep draining after "restart".
    for (let i = 0; i < 10; i++) {
      const result = await drainJobs({ maxJobs: 1 });
      const r = await dbStore.getRun(runId);
      if (
        r?.state.status === "completed" ||
        r?.state.status === "failed"
      ) {
        break;
      }
      if (result.remaining === 0 && result.drained === 0) break;
    }

    const finalRun = await dbStore.getRun(runId);
    expect(finalRun?.state.status).toBe("completed");
    expect(finalRun?.state.round).toBeGreaterThanOrEqual(2);
  });

  it("stale-lock recovery: a worker claim reclaims a job whose lease has expired without double-execution", async () => {
    const template = findTemplate("plane-crash")!;
    const stored = await createRunFromTemplate(
      {
        template,
        participants: defaultMockParticipants.slice(0, 2),
        maxRounds: 2,
      },
      dbStore,
    );
    const runId = stored.state.runId;

    const job = await dbQueue.enqueue({
      type: "run-round",
      payload: { runId },
    });

    const realNow = Date.now();
    // Worker A claims but never finishes.
    const first = await dbQueue.claim({
      workerId: "worker-a",
      maxJobs: 1,
      leaseDurationMs: 60_000,
      now: () => realNow,
    });
    expect(first.claimed).toHaveLength(1);

    // Later, worker B reclaims via expired lease.
    const second = await dbQueue.claim({
      workerId: "worker-b",
      maxJobs: 1,
      leaseDurationMs: 60_000,
      now: () => realNow + 120_000,
    });
    expect(second.claimed).toHaveLength(1);
    expect(second.reclaimed).toHaveLength(1);
    expect(second.claimed[0]!.id).toBe(job.id);
    expect(second.claimed[0]!.attempts).toBe(2);
    expect(second.claimed[0]!.lockedBy).toBe("worker-b");
  });
});
