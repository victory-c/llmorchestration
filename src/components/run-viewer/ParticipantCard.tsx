import type { RunParticipant } from "@/server/engine/types";

export function ParticipantCard({
  participant,
}: {
  participant: RunParticipant;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-zinc-100">
          {participant.displayName}
        </span>
        <span
          className={`text-xs uppercase tracking-wide ${
            participant.status === "saved"
              ? "text-emerald-400"
              : participant.status === "eliminated" ||
                  participant.status === "dead"
                ? "text-red-400"
                : "text-zinc-500"
          }`}
        >
          {participant.status}
        </span>
      </div>
      <div className="mt-1 text-xs text-zinc-500">{participant.modelId}</div>
      <p className="mt-2 text-xs text-zinc-400 line-clamp-3">
        {participant.publicPersona}
      </p>
    </div>
  );
}
