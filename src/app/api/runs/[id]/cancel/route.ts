import { NextResponse } from "next/server";
import { getRunStore } from "@/server/store";
import { getJobQueue } from "@/server/jobs";
import { checkRunOwnership } from "@/server/store/ownerAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!await checkRunOwnership(id, req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const store = getRunStore();
  const stored = await store.getRun(id);
  if (!stored) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (
    stored.state.status === "completed" ||
    stored.state.status === "failed" ||
    stored.state.status === "cancelled"
  ) {
    return NextResponse.json(
      { runId: id, status: stored.state.status },
      { status: 200 },
    );
  }
  await store.updateRunState(id, {
    ...stored.state,
    status: "cancelled",
    terminationReason: "user_cancelled",
  });
  const cancelledCount = await getJobQueue().cancelJobsForRun(id);
  return NextResponse.json(
    { runId: id, status: "cancelled", cancelledJobs: cancelledCount },
    { status: 200 },
  );
}
