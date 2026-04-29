import { eq, sql } from "drizzle-orm";
import { getDb, hasDatabaseUrl } from "@/server/db/client";
import { runs } from "@/server/db/schema";

declare global {
   
  var __arenaRunModerationFlags: Map<string, number> | undefined;
}

function flagStore(): Map<string, number> {
  if (!globalThis.__arenaRunModerationFlags)
    globalThis.__arenaRunModerationFlags = new Map();
  return globalThis.__arenaRunModerationFlags;
}

// Atomically increments the moderation flag counter for a run and returns the
// new total. Uses DB when available (serverless-safe); falls back to an
// in-memory Map for local/test environments without a DATABASE_URL.
export async function incrementModerationFlags(
  runId: string,
  delta: number,
): Promise<number> {
  if (!hasDatabaseUrl()) {
    const store = flagStore();
    const next = (store.get(runId) ?? 0) + delta;
    store.set(runId, next);
    return next;
  }
  const [row] = await getDb()
    .update(runs)
    .set({ moderationFlags: sql`${runs.moderationFlags} + ${delta}` })
    .where(eq(runs.id, runId))
    .returning({ moderationFlags: runs.moderationFlags });
  return row?.moderationFlags ?? 0;
}

export function resetRunModerationFlagsForTests() {
  globalThis.__arenaRunModerationFlags = new Map();
}
