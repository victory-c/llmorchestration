import { NextResponse } from "next/server";
import { getRunStore } from "@/server/store";
import { getJobQueue } from "@/server/jobs";
import { getEnv } from "@/lib/env";
import { checkRunOwnership } from "@/server/store/ownerAuth";
import { getClientIp } from "@/server/safety/rateLimit";
import { checkDailyMediaLimit } from "@/server/safety/dbRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Enqueues a `generate-audio` job for a completed (or at least non-failed) run.
// At most one generate-audio job per run is queued/processing at a time, and
// the job itself only synthesizes chunks that do not have a ready clip yet, so
// repeated calls retry missing clips instead of paying for the run again.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const env = getEnv();
  if (env.DISABLE_TTS_GENERATION) {
    return NextResponse.json(
      { error: "Audio generation is disabled (DISABLE_TTS_GENERATION=true)." },
      { status: 403 },
    );
  }
  if (env.GLOBAL_AI_KILL_SWITCH) {
    return NextResponse.json(
      { error: "Paid calls are disabled (GLOBAL_AI_KILL_SWITCH=true)." },
      { status: 403 },
    );
  }

  const { id } = await params;

  if (!await checkRunOwnership(id, req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stored = await getRunStore().getRun(id);
  if (!stored) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (
    stored.state.status !== "completed" &&
    stored.state.status !== "cancelled" &&
    stored.state.status !== "failed"
  ) {
    return NextResponse.json(
      {
        error: `Run must be terminal (completed/cancelled/failed) to generate audio. Current status: ${stored.state.status}.`,
      },
      { status: 409 },
    );
  }

  const queue = getJobQueue();
  if (await queue.hasActiveJobForRun(id, "generate-audio")) {
    return NextResponse.json(
      { error: "Audio generation is already queued for this run." },
      { status: 409 },
    );
  }

  if (env.DEMO_MODE) {
    const rl = await checkDailyMediaLimit({
      ip: getClientIp(req),
      limit: env.MAX_MEDIA_REQUESTS_PER_IP_PER_DAY,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `Daily media generation limit reached (${env.MAX_MEDIA_REQUESTS_PER_IP_PER_DAY}). Resets at ${new Date(rl.resetAt).toISOString()}.`,
        },
        { status: 429 },
      );
    }
  }

  const job = await queue.enqueue({
    type: "generate-audio",
    payload: { runId: id },
  });

  return NextResponse.json(
    { runId: id, jobId: job.id, status: "queued" },
    { status: 202 },
  );
}
