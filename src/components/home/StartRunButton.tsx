"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  templateId: string;
  participantCount: number;
};

export function StartRunButton({ templateId, participantCount }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId, participantCount }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const { runId } = await res.json();
        router.push(`/runs/${runId}`);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? "Starting…" : "Start Plane Crash Demo"}
      </button>
      {error && (
        <p className="mt-3 text-sm text-red-400">Error: {error}</p>
      )}
    </div>
  );
}
