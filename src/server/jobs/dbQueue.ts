import { nanoid } from "nanoid";
import { and, eq, inArray, or, sql, isNull, lt } from "drizzle-orm";
import { getDb, type Db } from "@/server/db/client";
import { jobs as jobsTable } from "@/server/db/schema";
import type {
  ClaimOptions,
  ClaimResult,
  Job,
  JobQueue,
  JobQueueStats,
  JobStatus,
  JobType,
} from "@/server/jobs/types";

function db(): Db {
  return getDb();
}

type JobRow = typeof jobsTable.$inferSelect;

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    type: row.type as JobType,
    payloadJson: row.payloadJson as Record<string, unknown>,
    status: row.status as JobStatus,
    attempts: row.attempts,
    priority: row.priority,
    runAfter: row.runAfter.getTime(),
    lockedBy: row.lockedBy ?? undefined,
    lockedAt: row.lockedAt?.getTime(),
    lastError: row.lastError ?? undefined,
    createdAt: row.createdAt.getTime(),
    completedAt: row.completedAt?.getTime(),
  };
}

export const dbQueue: JobQueue = {
  async enqueue({ type, payload, priority = 0, delayMs = 0 }) {
    const runAfter = new Date(Date.now() + delayMs);
    const id = nanoid();
    const [row] = await db()
      .insert(jobsTable)
      .values({
        id,
        type,
        payloadJson: payload,
        status: "queued",
        attempts: 0,
        priority,
        runAfter,
      })
      .returning();
    if (!row) throw new Error("dbQueue.enqueue: insert returned no row");
    return rowToJob(row);
  },

  async claim(options: ClaimOptions): Promise<ClaimResult> {
    const { workerId, maxJobs, leaseDurationMs } = options;
    const nowMs = (options.now ?? Date.now)();
    const now = new Date(nowMs);
    const leaseCutoff = new Date(nowMs - leaseDurationMs);

    return db().transaction(async (tx) => {
      // Claim queued jobs OR reclaim processing jobs whose lease expired.
      // Raw SELECT so we can use FOR UPDATE SKIP LOCKED; only pull id + status.
      const rawCandidates = await tx.execute<{ id: string; status: string }>(sql`
        SELECT id, status FROM ${jobsTable}
        WHERE (
          (status = 'queued' AND run_after <= ${now})
          OR (status = 'processing' AND locked_at IS NOT NULL AND locked_at < ${leaseCutoff})
        )
        ORDER BY priority DESC, run_after ASC
        LIMIT ${maxJobs}
        FOR UPDATE SKIP LOCKED
      `);
      const candidateRowsRaw = (rawCandidates as unknown as {
        rows?: Array<{ id: string; status: string }>;
      }).rows ?? (rawCandidates as unknown as Array<{ id: string; status: string }>);
      const candidates = Array.isArray(candidateRowsRaw) ? candidateRowsRaw : [];

      if (candidates.length === 0) {
        return { claimed: [], reclaimed: [] };
      }

      const reclaimedIds = new Set(
        candidates.filter((c) => c.status === "processing").map((c) => c.id),
      );
      const ids = candidates.map((c) => c.id);
      const updated = await tx
        .update(jobsTable)
        .set({
          status: "processing",
          attempts: sql`${jobsTable.attempts} + 1`,
          lockedBy: workerId,
          lockedAt: now,
        })
        .where(inArray(jobsTable.id, ids))
        .returning();

      const claimedJobs = updated.map(rowToJob);
      const reclaimedJobs = claimedJobs.filter((j) => reclaimedIds.has(j.id));

      return {
        claimed: claimedJobs,
        reclaimed: reclaimedJobs,
      };
    });
  },

  async completeJob(jobId: string) {
    await db()
      .update(jobsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        lockedBy: null,
        lockedAt: null,
      })
      .where(eq(jobsTable.id, jobId));
  },

  async failJob(jobId: string, error: string, { maxAttempts }) {
    const row = await db().query.jobs.findFirst({
      where: eq(jobsTable.id, jobId),
    });
    if (!row) return { status: "failed" as JobStatus, attempts: 0 };
    const failed = row.attempts >= maxAttempts;
    const now = new Date();
    const [updated] = await db()
      .update(jobsTable)
      .set({
        status: failed ? "failed" : "queued",
        lastError: error,
        lockedBy: null,
        lockedAt: null,
        runAfter: failed ? row.runAfter : now,
        completedAt: failed ? now : null,
      })
      .where(eq(jobsTable.id, jobId))
      .returning();
    return {
      status: (updated?.status ?? "failed") as JobStatus,
      attempts: updated?.attempts ?? row.attempts,
    };
  },

  async renewLease(jobId: string, workerId: string) {
    await db()
      .update(jobsTable)
      .set({ lockedAt: new Date() })
      .where(
        and(eq(jobsTable.id, jobId), eq(jobsTable.lockedBy, workerId)),
      );
  },

  async cancelJobsForRun(runId: string) {
    const now = new Date();
    const result = await db()
      .update(jobsTable)
      .set({
        status: "cancelled",
        lockedBy: null,
        lockedAt: null,
        completedAt: now,
      })
      .where(
        and(
          or(eq(jobsTable.status, "queued"), eq(jobsTable.status, "processing")),
          sql`${jobsTable.payloadJson}->>'runId' = ${runId}`,
        ),
      )
      .returning({ id: jobsTable.id });
    return result.length;
  },

  async getJob(jobId: string) {
    const row = await db().query.jobs.findFirst({
      where: eq(jobsTable.id, jobId),
    });
    return row ? rowToJob(row) : undefined;
  },

  async stats(): Promise<JobQueueStats> {
    const rows = await db()
      .select({ status: jobsTable.status })
      .from(jobsTable);
    const out: JobQueueStats = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      total: 0,
    };
    for (const r of rows) {
      out.total++;
      const k = r.status as JobStatus;
      if (k in out) out[k]++;
    }
    return out;
  },
};

// Helper for tests: reclaim jobs past their lease without requiring a full claim.
// Not used in production.
export async function _markExpiredProcessingAsQueuedForTests(
  leaseDurationMs: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - leaseDurationMs);
  const res = await db()
    .update(jobsTable)
    .set({ status: "queued", lockedBy: null, lockedAt: null })
    .where(
      and(
        eq(jobsTable.status, "processing"),
        or(isNull(jobsTable.lockedAt), lt(jobsTable.lockedAt, cutoff)),
      ),
    )
    .returning({ id: jobsTable.id });
  return res.length;
}
