import { NextResponse } from "next/server";
import { getMediaAssets } from "@/server/media";
import { checkRunOwnership } from "@/server/store/ownerAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await checkRunOwnership(id, req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const assets = await getMediaAssets().listForRun(id);
  return NextResponse.json({ runId: id, assets });
}
