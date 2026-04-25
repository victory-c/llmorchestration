import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { drainJobs } from "@/server/jobs/drain";
import { checkRateLimit, getClientIp } from "@/server/safety/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICK_RATE_LIMIT_PER_MINUTE = 30;

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  const env = getEnv();

  const tokenHeader = req.headers.get("x-jobs-tick-token");
  const hasToken = Boolean(env.JOBS_TICK_TOKEN);
  const authorized = hasToken && tokenHeader === env.JOBS_TICK_TOKEN;

  if (hasToken && !authorized && env.DEMO_MODE) {
    // In DEMO_MODE when a token is configured, external callers MUST supply it.
    // The client-triggered tick path uses the per-IP rate limit below instead,
    // which is only skipped when the caller has the valid token.
  }

  if (hasToken && !authorized && !env.DEMO_MODE) {
    return NextResponse.json(
      { error: "Unauthorized: missing or invalid X-Jobs-Tick-Token." },
      { status: 401 },
    );
  }

  if (!authorized && env.DEMO_MODE) {
    const ip = getClientIp(req);
    const rl = checkRateLimit({
      namespace: "jobs-tick",
      key: ip,
      limit: TICK_RATE_LIMIT_PER_MINUTE,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "Rate limited: too many tick requests. Back off and retry.",
          retryAtMs: rl.resetAt,
        },
        {
          status: 429,
          headers: {
            "retry-after": String(
              Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)),
            ),
          },
        },
      );
    }
  }

  const result = await drainJobs();

  return NextResponse.json(result, { status: 200 });
}
