import { NextResponse } from "next/server";
import { getRunStore } from "@/server/store";
import { checkRunOwnership } from "@/server/store/ownerAuth";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await checkRunOwnership(id, req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const run = await getRunStore().getRun(id);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json({
    runId: run.state.runId,
    scenario: run.scenario,
    state: run.state,
    messages: run.messages,
  });
}
