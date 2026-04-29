import { NextResponse } from "next/server";
import { getRunStore } from "@/server/store";
import { getJobQueue } from "@/server/jobs";
import { getEnv } from "@/lib/env";
import { checkRunOwnership } from "@/server/store/ownerAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Enqueues a `generate-audio` job for a completed (or at least non-failed) run.
// Idempotent at the queue level: /api/jobs/tick will process the latest job
// and re-write media_assets rows.
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

  const job = await getJobQueue().enqueue({
    type: "generate-audio",
    payload: { runId: id },
  });

  return NextResponse.json(
    { runId: id, jobId: job.id, status: "queued" },
    { status: 202 },
  );
}
