import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, hasDatabaseUrl } from "@/server/db/client";
import { rateLimitEvents } from "@/server/db/schema";
import { checkRateLimit, type RateLimitCheck } from "@/server/safety/rateLimit";

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function endOfDayMs(now: Date): number {
  const d = new Date(now);
  d.setUTCHours(23, 59, 59, 999);
  return d.getTime();
}

// Atomically increments a per-IP/day counter in Postgres and returns a
// RateLimitCheck consistent with the in-memory implementation.
//
// Uses INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count
// so two concurrent workers cannot both observe count < limit and both succeed.
export async function checkDailyRunLimitInDb(options: {
  ip: string;
  limit: number;
  now?: Date;
}): Promise<RateLimitCheck> {
  const now = options.now ?? new Date();
  const day = todayKey(now);
  const ipHash = hashIp(options.ip);

  const db = getDb();

  const rows = await db
    .insert(rateLimitEvents)
    .values({ ipHash, day, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitEvents.ipHash, rateLimitEvents.day],
      set: { count: sql`${rateLimitEvents.count} + 1` },
    })
    .returning({ count: rateLimitEvents.count });

  const count = rows[0]?.count ?? 1;

  if (count > options.limit) {
    // Roll back the increment so the counter stops growing once capped.
    await db
      .update(rateLimitEvents)
      .set({ count: options.limit })
      .where(
        and(
          eq(rateLimitEvents.ipHash, ipHash),
          eq(rateLimitEvents.day, day),
        ),
      );
    return {
      allowed: false,
      remaining: 0,
      resetAt: endOfDayMs(now),
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, options.limit - count),
    resetAt: endOfDayMs(now),
  };
}

// Picks DB-backed or in-memory based on DATABASE_URL presence.
export async function checkDailyRunLimit(options: {
  ip: string;
  limit: number;
  now?: Date;
}): Promise<RateLimitCheck> {
  const now = options.now ?? new Date();
  if (hasDatabaseUrl()) {
    return checkDailyRunLimitInDb({ ip: options.ip, limit: options.limit, now });
  }
  // Fallback for local/dev: in-memory per-day bucket.
  const day = todayKey(now);
  return checkRateLimit({
    namespace: "runs-per-day",
    key: `${options.ip}:${day}`,
    limit: options.limit,
    windowMs: 24 * 60 * 60 * 1000,
    now: () => now.getTime(),
  });
}
