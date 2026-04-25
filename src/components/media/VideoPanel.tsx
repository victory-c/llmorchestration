"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MediaAsset } from "@/server/media/types";
import {
  VIDEO_STYLES,
  VIDEO_STYLE_CATALOG,
  type VideoStyle,
} from "@/server/media/storyboard";

type VideoPanelProps = {
  runId: string;
  isTerminal: boolean;
  scenarioCategory?: string;
};

type MediaResponse = { runId: string; assets: MediaAsset[] };

const POLL_INTERVAL_MS = 4000;

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

export function VideoPanel({ runId, isTerminal }: VideoPanelProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [style, setStyle] = useState<VideoStyle>(VIDEO_STYLES[0]);
  const [enqueuing, setEnqueuing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchAssets = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}/media`, { cache: "no-store" });
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

  const videoAssets = useMemo(
    () =>
      assets
        .filter((a) => a.type === "video-final")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [assets],
  );

  const inFlight = videoAssets.find(
    (a) => a.status === "processing" || a.status === "pending",
  );
  const latestReady = videoAssets.find((a) => a.status === "ready");
  const lastFailed = videoAssets.find((a) => a.status === "failed");

  // Poll while a video is rendering.
  useEffect(() => {
    if (!inFlight) return;
    const handle = setInterval(() => {
      void fetchAssets();
      void fetch("/api/jobs/tick", { method: "POST" }).catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [inFlight, fetchAssets]);

  const onGenerate = useCallback(async () => {
    setEnqueuing(true);
    setErr(null);
    try {
      const res = await fetch(`/api/runs/${runId}/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
          error?: string;
        };
        setErr(body.error ?? `HTTP ${res.status}`);
        return;
      }
      void fetch("/api/jobs/tick", { method: "POST" }).catch(() => {});
      await fetchAssets();
    } finally {
      setEnqueuing(false);
    }
  }, [runId, style, fetchAssets]);

  const onDownloadStoryboard = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch(`/api/runs/${runId}/storyboard?style=${style}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
          error?: string;
        };
        setErr(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const json = await res.json();
      const blob = new Blob([JSON.stringify(json, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `storyboard-${runId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [runId, style]);

  if (!isTerminal) {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-4 text-sm text-zinc-400">
        Video export is available once the run finishes.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <span className="text-zinc-500">Style</span>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as VideoStyle)}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
          >
            {VIDEO_STYLES.map((id) => (
              <option key={id} value={id}>
                {VIDEO_STYLE_CATALOG[id].label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onGenerate}
          disabled={enqueuing || !!inFlight}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
        >
          {enqueuing
            ? "Queuing…"
            : inFlight
              ? "Rendering…"
              : latestReady
                ? "Re-render video"
                : "Generate video"}
        </button>
        <button
          type="button"
          onClick={onDownloadStoryboard}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-900"
        >
          Download storyboard JSON
        </button>
        {err && <span className="text-xs text-red-400">{err}</span>}
      </div>

      <p className="text-xs text-zinc-500">
        {VIDEO_STYLE_CATALOG[style].vibe}
      </p>

      {videoAssets.length === 0 ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-500">
          No video rendered yet. Audio generation is recommended first so each
          scene&apos;s duration matches the spoken line.
        </div>
      ) : (
        <ul className="space-y-2">
          {videoAssets.map((asset) => (
            <li
              key={asset.id}
              className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3 text-sm"
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${statusChip(asset.status)}`}
                >
                  {asset.status}
                </span>
                {asset.durationMs != null && (
                  <span className="text-xs text-zinc-500">
                    {(asset.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
                {asset.sizeBytes != null && (
                  <span className="text-xs text-zinc-500">
                    {(asset.sizeBytes / 1024 / 1024).toFixed(2)} MB
                  </span>
                )}
                <span className="ml-auto text-xs text-zinc-600">
                  {asset.createdAt}
                </span>
              </div>
              {asset.status === "ready" && asset.url ? (
                <div className="space-y-2">
                  <video
                    controls
                    preload="metadata"
                    className="w-full max-w-2xl rounded-md border border-zinc-800"
                    src={asset.url}
                  />
                  <a
                    href={asset.url}
                    download
                    className="inline-block text-xs text-emerald-400 hover:underline"
                  >
                    Download MP4
                  </a>
                </div>
              ) : asset.status === "failed" ? (
                <p className="text-xs text-red-300">
                  {asset.failedReason ?? "Render failed"}
                </p>
              ) : (
                <p className="text-xs text-zinc-500">
                  Rendering scenes — keep this tab open.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {lastFailed && !inFlight && !latestReady && (
        <p className="text-xs text-zinc-500">
          Tip: hosted Vercel renders are capped at 90s of total audio. For
          longer transcripts, download the storyboard JSON and render
          self-hosted (see <code>docs/video-pipeline.md</code>).
        </p>
      )}
    </div>
  );
}
