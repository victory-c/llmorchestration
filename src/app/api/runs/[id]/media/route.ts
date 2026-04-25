import { NextResponse } from "next/server";
import { getMediaAssets } from "@/server/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const assets = await getMediaAssets().listForRun(id);
  return NextResponse.json({ runId: id, assets });
}
