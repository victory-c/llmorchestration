import { createHash, timingSafeEqual } from "node:crypto";
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

// Constant-time comparison of two secret tokens. Hashing both sides to a
// fixed-size digest keeps the comparison constant-time regardless of length
// and avoids the `===` short-circuit that can leak how many leading
// characters matched.
function tokensMatch(a: string | undefined, b: string | undefined): boolean {
  if (a == null || b == null) return false;
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
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

// Core ownership check given a raw owner token (from a cookie or header).
// Returns true if the token authorizes access to the run.
//
// Two backwards-compatibility fail-open cases are preserved:
//   * no DATABASE_URL  — local single-user dev / in-memory store, no auth.
//   * run has no ownerUserId — created before ownership was wired up.
// A run that *does* have an owner requires a matching token.
export async function isAuthorizedRunToken(
  runId: string,
  token: string | undefined,
): Promise<boolean> {
  if (!hasDatabaseUrl()) return true;
  const row = await getDb().query.runs.findFirst({
    where: eq(runs.id, runId),
    columns: { ownerUserId: true },
  });
  if (!row) return false;
  if (!row.ownerUserId) return true;
  return tokensMatch(token, row.ownerUserId);
}

// Returns true if the caller is authorized to access/mutate the run via the
// owner cookie. Used by both read and write API routes.
export async function checkRunOwnership(
  runId: string,
  req: Request,
): Promise<boolean> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const token = parseCookie(cookieHeader, ownerCookieName(runId));
  return isAuthorizedRunToken(runId, token);
}

// Like checkRunOwnership, but also accepts the owner token via the
// X-Run-Owner-Token header for API consumers that cannot send cookies.
export async function verifyRunOwner(
  runId: string,
  req: Request,
): Promise<boolean> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const cookieToken = parseCookie(cookieHeader, ownerCookieName(runId));
  if (await isAuthorizedRunToken(runId, cookieToken)) return true;
  const headerToken = req.headers.get("x-run-owner-token") ?? undefined;
  return isAuthorizedRunToken(runId, headerToken);
}
