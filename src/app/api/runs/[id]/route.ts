import { NextResponse } from "next/server";
import { getRunStore } from "@/server/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
