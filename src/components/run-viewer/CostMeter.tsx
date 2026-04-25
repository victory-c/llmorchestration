export function CostMeter({
  totalCost,
  totalTokens,
}: {
  totalCost: number;
  totalTokens: number;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-4 text-sm">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Usage
      </h3>
      <div className="flex items-baseline justify-between">
        <span className="text-zinc-400 text-xs">Tokens</span>
        <span className="font-mono text-zinc-200">{totalTokens}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-zinc-400 text-xs">Est. cost</span>
        <span className="font-mono text-zinc-200">
          ${totalCost.toFixed(4)}
        </span>
      </div>
    </div>
  );
}
