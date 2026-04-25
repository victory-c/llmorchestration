import type { JobQueue } from "@/server/jobs/types";
import { memoryQueue } from "@/server/jobs/memoryQueue";
import { dbQueue } from "@/server/jobs/dbQueue";
import { hasDatabaseUrl } from "@/server/db/client";

let override: JobQueue | null = null;

export function getJobQueue(): JobQueue {
  if (override) return override;
  return hasDatabaseUrl() ? dbQueue : memoryQueue;
}

export function setJobQueueForTests(queue: JobQueue | null) {
  override = queue;
}
