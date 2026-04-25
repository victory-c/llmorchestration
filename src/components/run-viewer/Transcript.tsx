import type { TranscriptMessage } from "@/server/engine/types";

export function Transcript({ messages }: { messages: TranscriptMessage[] }) {
  if (messages.length === 0) {
    return (
      <p className="text-sm text-zinc-500">No messages yet.</p>
    );
  }

  const rounds = new Map<number, TranscriptMessage[]>();
  for (const m of messages) {
    const arr = rounds.get(m.round) ?? [];
    arr.push(m);
    rounds.set(m.round, arr);
  }
  const sorted = Array.from(rounds.keys()).sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      {sorted.map((round) => (
        <div key={round}>
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Round {round}
          </div>
          <div className="space-y-3">
            {rounds.get(round)!.map((m) => (
              <MessageCard key={m.id} message={m} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageCard({ message }: { message: TranscriptMessage }) {
  const isJudge = message.speakerType === "judge";
  const isSystem = message.speakerType === "system";

  return (
    <div
      className={`rounded-md border p-4 ${
        isJudge
          ? "border-amber-800/60 bg-amber-950/10"
          : isSystem
            ? "border-zinc-800 bg-zinc-950/40"
            : "border-zinc-800 bg-zinc-950/60"
      }`}
    >
      <div className="mb-1 flex items-center gap-2 text-sm">
        <span className="font-medium text-zinc-100">
          {isJudge ? "🧑‍⚖️ Judge" : isSystem ? "⚙️ System" : message.displayName}
        </span>
        {message.modelId && (
          <span className="text-xs text-zinc-500">({message.modelId})</span>
        )}
      </div>
      <p className="whitespace-pre-wrap text-sm text-zinc-200">
        {message.content}
      </p>
    </div>
  );
}
