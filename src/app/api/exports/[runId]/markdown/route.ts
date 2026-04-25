import { getRunStore } from "@/server/store";
import { exportRunMarkdown } from "@/server/engine/exportMarkdown";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const run = await getRunStore().getRun(runId);
  if (!run) {
    return new Response("Run not found", { status: 404 });
  }
  const md = exportRunMarkdown(run);
  return new Response(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="run-${runId}.md"`,
    },
  });
}
