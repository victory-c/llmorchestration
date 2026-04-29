import { eq } from "drizzle-orm";
import { getDb, hasDatabaseUrl } from "@/server/db/client";
import { runs } from "@/server/db/schema";

function parseCookie(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) return part.slice(idx + 1).trim();
  }
  return undefined;
}

export function ownerCookieName(runId: string): string {
  return `arena-run-${runId}`;
}

export async function setRunOwnerToken(
  runId: string,
  token: string,
): Promise<void> {
  if (!hasDatabaseUrl()) return;
  await getDb()
    .update(runs)
    .set({ ownerUserId: token })
    .where(eq(runs.id, runId));
}

// Returns true if the caller is authorized to mutate the run.
// A run with no ownerUserId is considered unowned (created before auth was
// wired up) and allows any caller through for backwards compatibility.
// When there is no DATABASE_URL (local dev), all callers are allowed.
export async function checkRunOwnership(
  runId: string,
  req: Request,
): Promise<boolean> {
  if (!hasDatabaseUrl()) return true;
  const row = await getDb().query.runs.findFirst({
    where: eq(runs.id, runId),
    columns: { ownerUserId: true },
  });
  if (!row) return false;
  if (!row.ownerUserId) return true;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const token = parseCookie(cookieHeader, ownerCookieName(runId));
  return token === row.ownerUserId;
}
