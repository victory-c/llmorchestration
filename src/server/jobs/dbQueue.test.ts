import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dbQueue } from "@/server/jobs/dbQueue";
import {
  setupPglite,
  teardownPglite,
  resetPgliteSchema,
} from "@/server/db/pglite";

describe("dbQueue (pglite)", () => {
  beforeAll(async () => {
    await setupPglite();
  });

  afterAll(async () => {
    await teardownPglite();
  });

  beforeEach(async () => {
    await resetPgliteSchema();
  });

  it("enqueues and claims jobs in priority order", async () => {
    await dbQueue.enqueue({
      type: "run-round",
      payload: { runId: "a" },
      priority: 0,
    });
    await dbQueue.enqueue({
      type: "run-round",
      payload: { runId: "b" },
      priority: 10,
    });

    const claim = await dbQueue.claim({
      workerId: "w1",
      maxJobs: 1,
      leaseDurationMs: 60_000,
    });
    expect(claim.claimed).toHaveLength(1);
    expect(
      (claim.claimed[0]!.payloadJson as { runId: string }).runId,
    ).toBe("b");
  });

  it("respects maxJobs per claim", async () => {
    for (let i = 0; i < 10; i++) {
      await dbQueue.enqueue({
        type: "run-round",
        payload: { runId: `r${i}` },
      });
    }
    const claim = await dbQueue.claim({
      workerId: "w1",
      maxJobs: 5,
      leaseDurationMs: 60_000,
    });
    expect(claim.claimed).toHaveLength(5);
  });

  it("does not double-claim a job still within its lease", async () => {
    await dbQueue.enqueue({
      type: "run-round",
      payload: { runId: "a" },
    });
    const first = await dbQueue.claim({
      workerId: "w1",
      maxJobs: 5,
      leaseDurationMs: 60_000,
    });
    expect(first.claimed).toHaveLength(1);

    const second = await dbQueue.claim({
      workerId: "w2",
      maxJobs: 5,
      leaseDurationMs: 60_000,
    });
    expect(second.claimed).toHaveLength(0);
  });

  it("reclaims a processing job whose lease has expired (stale-lock recovery)", async () => {
    await dbQueue.enqueue({
      type: "run-round",
      payload: { runId: "a" },
    });
    const realNow = Date.now();
    await dbQueue.claim({
      workerId: "w1",
      maxJobs: 5,
      leaseDurationMs: 60_000,
      now: () => realNow,
    });

    const second = await dbQueue.claim({
      workerId: "w2",
      maxJobs: 5,
      leaseDurationMs: 60_000,
      now: () => realNow + 120_000,
    });
    expect(second.claimed).toHaveLength(1);
    expect(second.reclaimed).toHaveLength(1);
    expect(second.claimed[0]!.attempts).toBe(2);
    expect(second.claimed[0]!.lockedBy).toBe("w2");
  });

  it("transitions to failed after maxAttempts", async () => {
    const job = await dbQueue.enqueue({
      type: "run-round",
      payload: { runId: "a" },
    });

    const realNow = Date.now();
    for (let i = 0; i < 3; i++) {
      await dbQueue.claim({
        workerId: `w${i}`,
        maxJobs: 1,
        leaseDurationMs: 60_000,
        now: () => realNow + i * 120_000,
      });
      await dbQueue.failJob(job.id, `err-${i}`, { maxAttempts: 3 });
    }

    const final = await dbQueue.getJob(job.id);
    expect(final?.status).toBe("failed");
    expect(final?.lastError).toBe("err-2");
    expect(final?.attempts).toBe(3);
  });

  it("cancels queued/processing jobs for a run", async () => {
    await dbQueue.enqueue({
      type: "run-round",
      payload: { runId: "a" },
    });
    await dbQueue.enqueue({
      type: "run-round",
      payload: { runId: "b" },
    });
    const cancelled = await dbQueue.cancelJobsForRun("a");
    expect(cancelled).toBe(1);
    const stats = await dbQueue.stats();
    expect(stats.cancelled).toBe(1);
    expect(stats.queued).toBe(1);
  });

  it("completeJob clears lock and marks completed", async () => {
    const job = await dbQueue.enqueue({
      type: "run-round",
      payload: { runId: "a" },
    });
    await dbQueue.claim({
      workerId: "w1",
      maxJobs: 1,
      leaseDurationMs: 60_000,
    });
    await dbQueue.completeJob(job.id);
    const after = await dbQueue.getJob(job.id);
    expect(after?.status).toBe("completed");
    expect(after?.lockedBy).toBeUndefined();
    expect(after?.lockedAt).toBeUndefined();
    expect(after?.completedAt).toBeDefined();
  });

  it("renewLease only renews when the caller owns the lock", async () => {
    const job = await dbQueue.enqueue({
      type: "run-round",
      payload: { runId: "a" },
    });
    await dbQueue.claim({
      workerId: "w1",
      maxJobs: 1,
      leaseDurationMs: 60_000,
    });
    const claimed = await dbQueue.getJob(job.id);
    const origLockedAt = claimed?.lockedAt;
    await new Promise((r) => setTimeout(r, 5));

    await dbQueue.renewLease(job.id, "imposter");
    let after = await dbQueue.getJob(job.id);
    expect(after?.lockedAt).toBe(origLockedAt);

    await dbQueue.renewLease(job.id, "w1");
    after = await dbQueue.getJob(job.id);
    expect(after?.lockedAt).not.toBe(origLockedAt);
  });
});
