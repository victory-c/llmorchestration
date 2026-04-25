import { NextResponse } from "next/server";
import { getRunStore } from "@/server/store";
import { getMediaAssets } from "@/server/media";
import {
  buildStoryboard,
  storyboardToExportJSON,
  VIDEO_STYLES,
  type VideoStyle,
} from "@/server/media/storyboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/runs/:id/storyboard?style=<style>
// Always-available storyboard JSON export. Useful as a fallback when video
// rendering is disabled, capped, or routed to an external worker.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const stored = await getRunStore().getRun(id);
  if (!stored) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const styleParam = url.searchParams.get("style") ?? undefined;
  const style: VideoStyle | undefined =
    styleParam && (VIDEO_STYLES as string[]).includes(styleParam)
      ? (styleParam as VideoStyle)
      : undefined;

  const audioAssets = await getMediaAssets().listForRun(id, "audio-clip");
  const sb = buildStoryboard({
    runId: id,
    state: stored.state,
    messages: stored.messages,
    audioAssets,
    scenarioCategory: stored.scenario.category,
    styleOverride: style,
  });

  return NextResponse.json(storyboardToExportJSON(sb));
}
