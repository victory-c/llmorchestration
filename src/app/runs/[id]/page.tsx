import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getRunStore } from "@/server/store";
import { isAuthorizedRunToken, ownerCookieName } from "@/server/store/ownerAuth";
import { RunLiveViewer } from "@/components/run-viewer/RunLiveViewer";

export const dynamic = "force-dynamic";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // This page server-renders the run's scenario/state/messages directly from
  // the store, so it must enforce ownership itself — otherwise anyone with a
  // run id could read the full transcript here, bypassing the API checks.
  // notFound() (404) avoids confirming the existence of someone else's run.
  const ownerToken = (await cookies()).get(ownerCookieName(id))?.value;
  if (!(await isAuthorizedRunToken(id, ownerToken))) notFound();

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
