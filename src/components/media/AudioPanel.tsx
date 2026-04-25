"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MediaAsset } from "@/server/media/types";
import type { TranscriptMessage } from "@/server/engine/types";

type AudioPanelProps = {
  runId: string;
  messages: TranscriptMessage[];
  isTerminal: boolean;
};

type MediaResponse = { runId: string; assets: MediaAsset[] };

const POLL_INTERVAL_MS = 3000;

function statusChip(status: MediaAsset["status"]): string {
  switch (status) {
    case "ready":
      return "border-emerald-700 text-emerald-300";
    case "processing":
      return "border-amber-600 text-amber-300 animate-pulse";
    case "failed":
      return "border-red-700 text-red-300";
    case "pending":
    default:
      return "border-zinc-700 text-zinc-400";
  }
}

export function AudioPanel({ runId, messages, isTerminal }: AudioPanelProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [generating, setGenerating] = useState(false);
  const [enqueued, setEnqueued] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchAssets = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}/media`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as MediaResponse;
      setAssets(data.assets);
    } catch {
      // ignored — next tick will retry
    }
  }, [runId]);

  useEffect(() => {
    // Defer one microtask so the state update from fetchAssets() never
    // happens synchronously during the effect (React 19 lint guard).
    queueMicrotask(() => void fetchAssets());
  }, [fetchAssets]);

  const assetsByMessage = useMemo(() => {
    const m = new Map<string, MediaAsset[]>();
    for (const a of assets) {
      if (!a.messageId) continue;
      const arr = m.get(a.messageId) ?? [];
      arr.push(a);
      m.set(a.messageId, arr);
    }
    for (const arr of m.values()) {
      arr.sort((x, y) => x.sequenceIndex - y.sequenceIndex);
    }
    return m;
  }, [assets]);

  const anyPending = assets.some(
    (a) => a.status === "processing" || a.status === "pending",
  );

  // Poll while clips are still rendering.
  useEffect(() => {
    if (!anyPending) return;
    const handle = setInterval(() => {
      void fetchAssets();
      // Nudge the tick so the job actually runs on Hobby deployments.
      void fetch(`/api/jobs/tick`, { method: "POST" }).catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [anyPending, fetchAssets]);

  const onGenerate = useCallback(async () => {
    setGenerating(true);
    setErr(null);
    try {
      const res = await fetch(`/api/runs/${runId}/audio`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
          error?: string;
        };
        setErr(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setEnqueued(true);
      // Immediately kick the tick once so the worker picks it up.
      void fetch(`/api/jobs/tick`, { method: "POST" }).catch(() => {});
      await fetchAssets();
    } finally {
      setGenerating(false);
    }
  }, [runId, fetchAssets]);

  const regenerateClip = useCallback(
    async (assetId: string) => {
      try {
        const res = await fetch(`/api/media/${assetId}/regenerate`, {
          method: "POST",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setErr(body.error ?? `HTTP ${res.status}`);
          return;
        }
        await fetchAssets();
      } catch (e) {
        setErr((e as Error).message);
      }
    },
    [fetchAssets],
  );

  if (!isTerminal) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-400">
        Audio generation is available once the run finishes.
      </div>
    );
  }

  const actorMessages = messages.filter((m) => m.speakerType === "actor");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating || anyPending}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
        >
          {generating
            ? "Queuing…"
            : anyPending
              ? "Generating…"
              : assets.length > 0
                ? "Regenerate audio"
                : "Generate audio"}
        </button>
        {enqueued && (
          <span className="text-xs text-emerald-400">Queued</span>
        )}
        {err && <span className="text-xs text-red-400">{err}</span>}
      </div>

      <ul className="space-y-2">
        {actorMessages.map((m) => {
          const clips = assetsByMessage.get(m.id) ?? [];
          return (
            <li
              key={m.id}
              className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3 text-sm"
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="font-medium text-zinc-200">
                  {m.displayName}
                </span>
                <span className="text-xs text-zinc-500">
                  Round {m.round}
                </span>
              </div>
              {clips.length === 0 ? (
                <div className="text-xs text-zinc-500">No audio yet.</div>
              ) : (
                <div className="space-y-2">
                  {clips.map((c) => (
                    <ClipRow
                      key={c.id}
                      clip={c}
                      onRegenerate={() => regenerateClip(c.id)}
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ClipRow({
  clip,
  onRegenerate,
}: {
  clip: MediaAsset;
  onRegenerate: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`rounded-full border px-2 py-0.5 text-xs ${statusChip(clip.status)}`}
      >
        {clip.status}
      </span>
      {clip.status === "ready" && clip.url ? (
        <audio controls preload="none" className="h-8 max-w-full" src={clip.url} />
      ) : clip.status === "failed" ? (
        <>
          <span className="text-xs text-red-300">
            {clip.failedReason ?? "Failed"}
          </span>
          <button
            type="button"
            onClick={onRegenerate}
            className="rounded-md border border-zinc-700 px-2 py-0.5 text-xs text-zinc-100 hover:bg-zinc-900"
          >
            Regenerate
          </button>
        </>
      ) : (
        <span className="text-xs text-zinc-500">
          chunk {clip.sequenceIndex}
        </span>
      )}
      {clip.durationMs != null && clip.status === "ready" && (
        <span className="ml-auto text-xs text-zinc-500">
          {(clip.durationMs / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}
