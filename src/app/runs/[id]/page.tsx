import { notFound } from "next/navigation";
import { getRunStore } from "@/server/store";
import { RunLiveViewer } from "@/components/run-viewer/RunLiveViewer";

export const dynamic = "force-dynamic";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const run = await getRunStore().getRun(id);
  if (!run) notFound();

  return (
    <RunLiveViewer
      runId={id}
      initial={{
        scenario: run.scenario,
        state: run.state,
        messages: run.messages,
      }}
    />
  );
}
