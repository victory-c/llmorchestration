import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  memoryQueue,
  resetMemoryQueueForTests,
} from "@/server/jobs/memoryQueue";

describe("memoryQueue", () => {
  beforeEach(() => {
    resetMemoryQueueForTests();
  });

  it("enqueues and claims jobs in priority order", async () => {
    await memoryQueue.enqueue({
      type: "run-round",
      payload: { runId: "a" },
      priority: 0,
    });
    await memoryQueue.enqueue({
      type: "run-round",
      payload: { runId: "b" },
      priority: 10,
    });

    const claim = await memoryQueue.claim({
      workerId: "w1",
      maxJobs: 1,
      leaseDurationMs: 60_000,
    });
    expect(claim.claimed).toHaveLength(1);
    expect(
      (claim.claimed[0]!.payloadJson as { runId: string }).runId,
    ).toBe("b");
  });

  it("respects maxJobs per claim (TICK_MAX_JOBS_PER_CALL)", async () => {
    for (let i = 0; i < 10; i++) {
      await memoryQueue.enqueue({
        type: "run-round",
        payload: { runId: `r${i}` },
      });
    }
    const claim = await memoryQueue.claim({
      workerId: "w1",
      maxJobs: 5,
      leaseDurationMs: 60_000,
    });
    expect(claim.claimed).toHaveLength(5);
  });

  it("does not double-claim a job still within its lease", async () => {
    await memoryQueue.enqueue({
      type: "run-round",
      payload: { runId: "a" },
    });
    const first = await memoryQueue.claim({
      workerId: "w1",
      maxJobs: 5,
      leaseDurationMs: 60_000,
    });
    expect(first.claimed).toHaveLength(1);

    const second = await memoryQueue.claim({
      workerId: "w2",
      maxJobs: 5,
      leaseDurationMs: 60_000,
    });
    expect(second.claimed).toHaveLength(0);
  });

  it("reclaims a processing job whose lease has expired", async () => {
    await memoryQueue.enqueue({
      type: "run-round",
      payload: { runId: "a" },
    });
    const realNow = Date.now();

    const firstSpy = vi.spyOn(Date, "now").mockReturnValue(realNow);
    await memoryQueue.claim({
      workerId: "w1",
      maxJobs: 5,
      leaseDurationMs: 60_000,
    });
    firstSpy.mockRestore();

    // 2 minutes later, worker w2 shows up; lease has expired
    const second = await memoryQueue.claim({
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
    const job = await memoryQueue.enqueue({
      type: "run-round",
      payload: { runId: "a" },
    });

    for (let i = 0; i < 3; i++) {
      await memoryQueue.claim({
        workerId: `w${i}`,
        maxJobs: 1,
        leaseDurationMs: 60_000,
      });
      await memoryQueue.failJob(job.id, `err-${i}`, { maxAttempts: 3 });
    }
    const final = await memoryQueue.getJob(job.id);
    expect(final?.status).toBe("failed");
    expect(final?.lastError).toBe("err-2");
  });

  it("cancels queued/processing jobs for a run", async () => {
    await memoryQueue.enqueue({
      type: "run-round",
      payload: { runId: "a" },
    });
    await memoryQueue.enqueue({
      type: "run-round",
      payload: { runId: "b" },
    });
    const cancelled = await memoryQueue.cancelJobsForRun("a");
    expect(cancelled).toBe(1);
    const stats = await memoryQueue.stats();
    expect(stats.cancelled).toBe(1);
    expect(stats.queued).toBe(1);
  });
});
