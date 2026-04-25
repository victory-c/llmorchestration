"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StoredRun } from "@/server/store/types";
import { Transcript } from "@/components/run-viewer/Transcript";
import { ParticipantCard } from "@/components/run-viewer/ParticipantCard";
import { StatePanel } from "@/components/run-viewer/StatePanel";
import { CostMeter } from "@/components/run-viewer/CostMeter";
import { AudioPanel } from "@/components/media/AudioPanel";
import { VideoPanel } from "@/components/media/VideoPanel";

type RunResponse = {
  state: StoredRun["state"];
  messages: StoredRun["messages"];
  scenario: StoredRun["scenario"];
};

const POLL_INTERVAL_MS = 2000;

export function RunLiveViewer({
  runId,
  initial,
}: {
  runId: string;
  initial: RunResponse;
}) {
  const [data, setData] = useState<RunResponse>(initial);
  const [tickError, setTickError] = useState<string | null>(null);

  const isTerminal = useMemo(
    () =>
      data.state.status === "completed" ||
      data.state.status === "failed" ||
      data.state.status === "cancelled",
    [data.state.status],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as RunResponse;
      setData(next);
    } catch {
      // swallow — next tick will retry
    }
  }, [runId]);

  const nudgeTick = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/tick`, {
        method: "POST",
        cache: "no-store",
      });
      if (res.status === 429) {
        setTickError("Rate limited. Backing off.");
        return;
      }
      setTickError(null);
    } catch {
      // ignored
    }
  }, []);

  useEffect(() => {
    if (isTerminal) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const loop = async () => {
      if (cancelled) return;
      await Promise.all([nudgeTick(), refresh()]);
      if (cancelled) return;
      timer = setTimeout(loop, POLL_INTERVAL_MS);
    };

    loop();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isTerminal, nudgeTick, refresh]);

  const { scenario, state, messages } = data;

  const totalCost = messages.reduce(
    (s, m) => s + (m.estimatedCostUsd ?? 0),
    0,
  );
  const totalTokens = messages.reduce(
    (s, m) => s + (m.inputTokens ?? 0) + (m.outputTokens ?? 0),
    0,
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 text-zinc-100">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">{scenario.title}</h1>
        <p className="mt-2 text-zinc-400">{scenario.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full border border-zinc-700 px-3 py-1 text-zinc-300">
            Round {state.round} / {state.maxRounds}
          </span>
          <span
            className={`rounded-full border px-3 py-1 ${
              state.status === "completed"
                ? "border-emerald-700 text-emerald-300"
                : state.status === "failed"
                  ? "border-red-700 text-red-300"
                  : state.status === "running"
                    ? "border-amber-600 text-amber-300"
                    : "border-zinc-700 text-zinc-300"
            }`}
          >
            {state.status}
          </span>
          {state.terminationReason && (
            <span className="text-zinc-500">
              ({state.terminationReason})
            </span>
          )}
          {!isTerminal && (
            <span className="text-xs text-zinc-500">Polling live…</span>
          )}
          {tickError && (
            <span className="text-xs text-amber-400">{tickError}</span>
          )}
          <a
            href={`/api/exports/${runId}/markdown`}
            className="ml-auto rounded-md border border-zinc-700 px-3 py-1 text-zinc-200 hover:bg-zinc-900"
          >
            Export Markdown
          </a>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
        <section>
          <h2 className="mb-4 text-lg font-medium">Transcript</h2>
          <Transcript messages={messages} />
        </section>

        <aside className="space-y-6">
          <div>
            <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
              Participants
            </h3>
            <div className="space-y-2">
              {state.participants.map((p) => (
                <ParticipantCard key={p.id} participant={p} />
              ))}
            </div>
          </div>
          <StatePanel state={state} />
          <CostMeter totalCost={totalCost} totalTokens={totalTokens} />
          <div>
            <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
              Audio
            </h3>
            <AudioPanel
              runId={runId}
              messages={messages}
              isTerminal={isTerminal}
            />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
              Video
            </h3>
            <VideoPanel
              runId={runId}
              isTerminal={isTerminal}
              scenarioCategory={scenario.category}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}
