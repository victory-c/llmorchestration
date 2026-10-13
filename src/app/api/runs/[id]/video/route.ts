import { NextResponse } from "next/server";
import { getRunStore } from "@/server/store";
import { getJobQueue } from "@/server/jobs";
import { getEnv } from "@/lib/env";
import { checkRunOwnership } from "@/server/store/ownerAuth";
import { getClientIp } from "@/server/safety/rateLimit";
import { checkDailyMediaLimit } from "@/server/safety/dbRateLimit";
import { MAX_VIDEO_RENDERS_PER_RUN } from "@/lib/constants";
import {
  buildStoryboard,
  storyboardToExportJSON,
  VIDEO_STYLES,
  type VideoStyle,
} from "@/server/media/storyboard";
import { getMediaAssets } from "@/server/media";
import { HOSTED_VIDEO_MAX_MS } from "@/server/media/generateVideo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/runs/:id/video
// body (optional): { style?: VideoStyle }
// Enqueues a `generate-video` job for a terminal run. On hosted Vercel deploys
// the job-time guard will refuse runs longer than HOSTED_VIDEO_MAX_MS, so we
// also surface that error eagerly here.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const env = getEnv();
  if (env.DISABLE_VIDEO_GENERATION) {
    return NextResponse.json(
      { error: "Video generation is disabled (DISABLE_VIDEO_GENERATION=true)." },
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
        error: `Run must be terminal (completed/cancelled/failed) to generate video. Current status: ${stored.state.status}.`,
      },
      { status: 409 },
    );
  }

  let style: VideoStyle | undefined;
  try {
    const body = await req.json().catch(() => null);
    if (body && typeof body.style === "string" && (VIDEO_STYLES as string[]).includes(body.style)) {
      style = body.style as VideoStyle;
    }
  } catch {
    // ignore — body is optional
  }

  // Each render runs ffmpeg and uploads a new MP4: one in flight per run, and
  // a fixed number of renders per run.
  const queue = getJobQueue();
  if (await queue.hasActiveJobForRun(id, "generate-video")) {
    return NextResponse.json(
      { error: "A video render is already queued for this run." },
      { status: 409 },
    );
  }
  const renders = await getMediaAssets().listForRun(id, "video-final");
  if (renders.length >= MAX_VIDEO_RENDERS_PER_RUN) {
    return NextResponse.json(
      {
        error: `This run already has ${renders.length} video renders (max ${MAX_VIDEO_RENDERS_PER_RUN}).`,
      },
      { status: 409 },
    );
  }

  // Pre-flight duration check on Vercel hosted demos.
  if (process.env.VERCEL) {
    const audioAssets = await getMediaAssets().listForRun(id, "audio-clip");
    const sb = buildStoryboard({
      runId: id,
      state: stored.state,
      messages: stored.messages,
      audioAssets,
      scenarioCategory: stored.scenario.category,
      styleOverride: style,
    });
    if (sb.totalDurationMs > HOSTED_VIDEO_MAX_MS) {
      return NextResponse.json(
        {
          error:
            `This run is ${(sb.totalDurationMs / 1000).toFixed(1)}s long; ` +
            `hosted video render only supports ≤ ${HOSTED_VIDEO_MAX_MS / 1000}s. ` +
            `Use the storyboard JSON export and render via a self-hosted worker.`,
          storyboard: storyboardToExportJSON(sb),
        },
        { status: 413 },
      );
    }
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
    type: "generate-video",
    payload: { runId: id, style },
  });

  return NextResponse.json(
    { runId: id, jobId: job.id, status: "queued", style: style ?? null },
    { status: 202 },
  );
}
