// M2 in-memory per-IP / per-route rate limiter.
// NOT safe across serverless instances or process restarts.
// Replaced by a Supabase-backed table in Milestone 3+.

type Bucket = {
  count: number;
  resetAt: number;
};

type BucketMap = Map<string, Bucket>;

declare global {
  // eslint-disable-next-line no-var
  var __arenaRateLimiter: Map<string, BucketMap> | undefined;
}

function buckets(namespace: string): BucketMap {
  if (!globalThis.__arenaRateLimiter) {
    globalThis.__arenaRateLimiter = new Map();
  }
  const all = globalThis.__arenaRateLimiter;
  let m = all.get(namespace);
  if (!m) {
    m = new Map();
    all.set(namespace, m);
  }
  return m;
}

export type RateLimitCheck = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export function checkRateLimit(options: {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimitCheck {
  const now = (options.now ?? Date.now)();
  const b = buckets(options.namespace);
  const existing = b.get(options.key);

  if (!existing || existing.resetAt <= now) {
    const fresh: Bucket = { count: 1, resetAt: now + options.windowMs };
    b.set(options.key, fresh);
    return {
      allowed: true,
      remaining: Math.max(0, options.limit - 1),
      resetAt: fresh.resetAt,
    };
  }

  if (existing.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, options.limit - existing.count),
    resetAt: existing.resetAt,
  };
}

export function resetRateLimitsForTests() {
  globalThis.__arenaRateLimiter = new Map();
}

export function getClientIp(req: Request): string {
  const h = req.headers;
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") ?? "unknown";
}
