export type JobType = "run-round" | "generate-audio" | "generate-video";

export type JobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type RunRoundPayload = {
  runId: string;
};

export type GenerateAudioPayload = {
  runId: string;
};

export type GenerateVideoPayload = {
  runId: string;
};

export type JobPayload =
  | { type: "run-round"; data: RunRoundPayload }
  | { type: "generate-audio"; data: GenerateAudioPayload }
  | { type: "generate-video"; data: GenerateVideoPayload };

export type Job = {
  id: string;
  type: JobType;
  payloadJson: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  priority: number;
  runAfter: number; // epoch ms
  lockedBy?: string;
  lockedAt?: number; // epoch ms
  lastError?: string;
  createdAt: number;
  completedAt?: number;
};

export type ClaimOptions = {
  workerId: string;
  maxJobs: number;
  leaseDurationMs: number;
  now?: () => number;
};

export type ClaimResult = {
  claimed: Job[];
  reclaimed: Job[];
};

export type JobQueueStats = {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
};

export interface JobQueue {
  enqueue(input: {
    type: JobType;
    payload: Record<string, unknown>;
    priority?: number;
    delayMs?: number;
  }): Promise<Job>;

  claim(options: ClaimOptions): Promise<ClaimResult>;

  completeJob(jobId: string): Promise<void>;

  failJob(
    jobId: string,
    error: string,
    options: { maxAttempts: number },
  ): Promise<{ status: JobStatus; attempts: number }>;

  renewLease(jobId: string, workerId: string): Promise<void>;

  cancelJobsForRun(runId: string): Promise<number>;

  getJob(jobId: string): Promise<Job | undefined>;

  stats(): Promise<JobQueueStats>;
}
