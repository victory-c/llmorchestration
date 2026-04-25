import { nanoid } from "nanoid";
import { getEnv } from "@/lib/env";
import {
  DEFAULT_JOB_LEASE_SECONDS,
  DEFAULT_JOB_MAX_ATTEMPTS,
} from "@/lib/constants";
import { getJobQueue } from "@/server/jobs";
import { handleJob } from "@/server/jobs/handlers";

export type DrainResult = {
  drained: number;
  failed: number;
  deferred: number;
  remaining: number;
  reclaimed: number;
  killSwitch: boolean;
};

export async function drainJobs(options?: {
  maxJobs?: number;
  workerId?: string;
  leaseSeconds?: number;
  maxAttempts?: number;
}): Promise<DrainResult> {
  const env = getEnv();
  const queue = getJobQueue();

  if (env.GLOBAL_AI_KILL_SWITCH) {
    const stats = await queue.stats();
    return {
      drained: 0,
      failed: 0,
      deferred: 0,
      remaining: stats.queued + stats.processing,
      reclaimed: 0,
      killSwitch: true,
    };
  }

  const maxJobs = options?.maxJobs ?? env.TICK_MAX_JOBS_PER_CALL;
  const leaseMs = (options?.leaseSeconds ?? DEFAULT_JOB_LEASE_SECONDS) * 1000;
  const maxAttempts = options?.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS;
  const workerId = options?.workerId ?? `worker:${nanoid(8)}`;

  const { claimed, reclaimed } = await queue.claim({
    workerId,
    maxJobs,
    leaseDurationMs: leaseMs,
  });

  let drained = 0;
  let failed = 0;

  for (const job of claimed) {
    try {
      await handleJob(job);
      await queue.completeJob(job.id);
      drained++;
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      const result = await queue.failJob(job.id, message, { maxAttempts });
      if (result.status === "failed") failed++;
    }
  }

  const stats = await queue.stats();

  return {
    drained,
    failed,
    deferred: claimed.length - drained - failed,
    remaining: stats.queued + stats.processing,
    reclaimed: reclaimed.length,
    killSwitch: false,
  };
}
