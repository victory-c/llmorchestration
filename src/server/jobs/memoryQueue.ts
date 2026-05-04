// WARNING: Dev-only in-memory job queue.
// Mirrors the shape of the DB `jobs` table that lands in Milestone 3.
// Not safe across serverless instances. Not persistent.

import { nanoid } from "nanoid";
import type {
  ClaimOptions,
  ClaimResult,
  Job,
  JobQueue,
  JobQueueStats,
  JobStatus,
  JobType,
} from "@/server/jobs/types";

declare global {
   
  var __arenaJobQueue: Map<string, Job> | undefined;
}

function store(): Map<string, Job> {
  if (!globalThis.__arenaJobQueue) globalThis.__arenaJobQueue = new Map();
  return globalThis.__arenaJobQueue;
}

function sortClaimable(jobs: Job[]): Job[] {
  return [...jobs].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.runAfter - b.runAfter;
  });
}

export const memoryQueue: JobQueue = {
  async enqueue({ type, payload, priority = 0, delayMs = 0 }) {
    const now = Date.now();
    const job: Job = {
      id: nanoid(),
      type,
      payloadJson: payload,
      status: "queued",
      attempts: 0,
      priority,
      runAfter: now + delayMs,
      createdAt: now,
    };
    store().set(job.id, job);
    return job;
  },

  async claim(options: ClaimOptions): Promise<ClaimResult> {
    const { workerId, maxJobs, leaseDurationMs } = options;
    const now = (options.now ?? Date.now)();
    const s = store();

    const candidates: Job[] = [];
    const reclaimed: Job[] = [];

    for (const job of s.values()) {
      if (job.status === "queued" && job.runAfter <= now) {
        candidates.push(job);
      } else if (
        job.status === "processing" &&
        job.lockedAt !== undefined &&
        now - job.lockedAt > leaseDurationMs
      ) {
        candidates.push(job);
        reclaimed.push(job);
      }
    }

    const ordered = sortClaimable(candidates).slice(0, maxJobs);

    const claimed: Job[] = [];
    for (const job of ordered) {
      const updated: Job = {
        ...job,
        status: "processing",
        attempts: job.attempts + 1,
        lockedBy: workerId,
        lockedAt: now,
      };
      s.set(job.id, updated);
      claimed.push(updated);
    }

    return { claimed, reclaimed };
  },

  async completeJob(jobId) {
    const s = store();
    const job = s.get(jobId);
    if (!job) return;
    s.set(jobId, {
      ...job,
      status: "completed",
      completedAt: Date.now(),
      lockedBy: undefined,
      lockedAt: undefined,
    });
  },

  async failJob(jobId, error, { maxAttempts }) {
    const s = store();
    const job = s.get(jobId);
    if (!job) return { status: "failed" as JobStatus, attempts: 0 };
    const failed = job.attempts >= maxAttempts;
    const updated: Job = {
      ...job,
      status: failed ? "failed" : "queued",
      lastError: error,
      lockedBy: undefined,
      lockedAt: undefined,
      runAfter: failed ? job.runAfter : Date.now(),
      completedAt: failed ? Date.now() : undefined,
    };
    s.set(jobId, updated);
    return { status: updated.status, attempts: updated.attempts };
  },

  async renewLease(jobId, workerId) {
    const s = store();
    const job = s.get(jobId);
    if (!job) return;
    if (job.lockedBy !== workerId) return;
    s.set(jobId, { ...job, lockedAt: Date.now() });
  },

  async cancelJobsForRun(runId: string) {
    const s = store();
    let count = 0;
    for (const job of s.values()) {
      const pid = (job.payloadJson as { runId?: string }).runId;
      if (pid !== runId) continue;
      if (job.status === "queued" || job.status === "processing") {
        s.set(job.id, {
          ...job,
          status: "cancelled",
          lockedBy: undefined,
          lockedAt: undefined,
          completedAt: Date.now(),
        });
        count++;
      }
    }
    return count;
  },

  async getJob(jobId) {
    return store().get(jobId);
  },

  async cleanupOldJobs(olderThanDays: number): Promise<number> {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let count = 0;
    for (const [id, job] of store().entries()) {
      if (
        (job.status === "completed" ||
          job.status === "cancelled" ||
          job.status === "failed") &&
        job.completedAt !== undefined &&
        job.completedAt < cutoff
      ) {
        store().delete(id);
        count++;
      }
    }
    return count;
  },

  async stats(): Promise<JobQueueStats> {
    const out: JobQueueStats = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      total: 0,
    };
    for (const job of store().values()) {
      out.total++;
      out[job.status]++;
    }
    return out;
  },
};

export function resetMemoryQueueForTests() {
  globalThis.__arenaJobQueue = new Map();
}

export function listAllJobsForTests(): Job[] {
  return Array.from(store().values());
}

export function listJobsForRun(runId: string): Job[] {
  return Array.from(store().values()).filter(
    (j) => (j.payloadJson as { runId?: string }).runId === runId,
  );
}

export function enqueueTypedJob(
  type: JobType,
  payload: Record<string, unknown>,
  options?: { priority?: number; delayMs?: number },
): Promise<Job> {
  return memoryQueue.enqueue({
    type,
    payload,
    priority: options?.priority,
    delayMs: options?.delayMs,
  });
}
