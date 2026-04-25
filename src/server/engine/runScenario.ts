// M1-only synchronous wrapper. From M2 onward, the jobs queue drives per-round
// execution via runOneRound; this wrapper is bypassed.
import { runOneRound, type RunOneRoundDeps } from "@/server/engine/runOneRound";
import type { RunState } from "@/server/engine/types";

export async function runScenario(
  runId: string,
  deps: RunOneRoundDeps,
): Promise<RunState> {
  const MAX_ITERATIONS = 32;
  let last: RunState | null = null;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await runOneRound(runId, deps);
    last = result.state;
    if (result.terminated) break;
  }
  if (!last) throw new Error(`runScenario produced no state for ${runId}`);
  return last;
}
