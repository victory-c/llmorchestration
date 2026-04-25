import type { RunState } from "@/server/engine/types";

export function StatePanel({ state }: { state: RunState }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-4 text-sm">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
        World state
      </h3>
      {state.publicFacts.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-zinc-500 mb-1">Public facts</div>
          <ul className="space-y-1 text-xs text-zinc-300">
            {state.publicFacts.map((f, i) => (
              <li key={i}>• {f}</li>
            ))}
          </ul>
        </div>
      )}
      {Object.keys(state.resources).length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-zinc-500 mb-1">Resources</div>
          <ul className="space-y-1 text-xs text-zinc-300">
            {Object.entries(state.resources).map(([k, v]) => (
              <li key={k}>
                {k}: <span className="text-zinc-100">{String(v)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {state.recentEvents.length > 0 && (
        <div>
          <div className="text-xs text-zinc-500 mb-1">Recent events</div>
          <ul className="space-y-1 text-xs text-zinc-400">
            {state.recentEvents.slice(-6).map((e, i) => (
              <li key={i}>
                [r{e.round}] {e.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
