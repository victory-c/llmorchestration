import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRunStore } from "@/server/store";
import { createRunFromTemplate } from "@/server/engine/createRun";
import { setRunOwnerToken, ownerCookieName } from "@/server/store/ownerAuth";
import { findTemplate } from "@/server/scenarios/templates";
import {
  defaultMockParticipants,
  participantModelIdForProvider,
} from "@/server/scenarios/mockParticipants";
import { getEnv } from "@/lib/env";
import {
  effectiveLimits,
  preflightRunLimits,
  LimitViolationError,
} from "@/server/cost/enforceLimits";
import { moderateScenarioAsync } from "@/server/safety/moderateScenario";
import { logSafetyEvent } from "@/server/cost/logUsage";
import { getJobQueue } from "@/server/jobs";
import { getClientIp } from "@/server/safety/rateLimit";
import { checkDailyRunLimit } from "@/server/safety/dbRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  templateId: z.string().default("plane-crash"),
  participantCount: z.number().int().min(2).max(6).default(4),
  maxRounds: z.number().int().min(1).max(6).optional(),
  syncExecute: z.boolean().optional(),
});

export async function POST(req: Request) {
  const env = getEnv();

  let body: z.infer<typeof bodySchema>;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  try {
    body = bodySchema.parse(json);
  } catch (e) {
    return NextResponse.json(
      { error: `Invalid body: ${(e as Error).message}` },
      { status: 400 },
    );
  }

  if (env.DEMO_MODE) {
    const ip = getClientIp(req);
    const rl = await checkDailyRunLimit({
      ip,
      limit: env.MAX_RUNS_PER_IP_PER_DAY,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `Daily run limit reached (${env.MAX_RUNS_PER_IP_PER_DAY}). Resets at ${new Date(rl.resetAt).toISOString()}.`,
        },
        { status: 429 },
      );
    }
  }

  const template = findTemplate(body.templateId);
  if (!template) {
    return NextResponse.json(
      { error: `Unknown template: ${body.templateId}` },
      { status: 400 },
    );
  }
  if (template.publicFacts.length === 0 && template.rules.length === 0) {
    return NextResponse.json(
      {
        error: `Template "${body.templateId}" is a stub in this milestone. Use "plane-crash".`,
      },
      { status: 400 },
    );
  }

  const participantsSource = defaultMockParticipants.slice(
    0,
    body.participantCount,
  );

  const store = getRunStore();
  const stored = await createRunFromTemplate(
    {
      template,
      participants: participantsSource,
      maxRounds: body.maxRounds,
      modelIdForParticipant: (p) =>
        participantModelIdForProvider(p, env.MODEL_GATEWAY_PROVIDER),
    },
    store,
  );

  const scenarioModeration = await moderateScenarioAsync(
    stored.scenario,
    stored.state.participants,
  );
  if (!scenarioModeration.allowed) {
    logSafetyEvent({
      runId: stored.state.runId,
      eventType: "moderation-block",
      metadata: { phase: "scenario", violations: scenarioModeration.violations },
    });
    await store.updateRunState(stored.state.runId, {
      ...stored.state,
      status: "failed",
      terminationReason: "moderation_block",
    });
    return NextResponse.json(
      {
        error:
          scenarioModeration.reason ??
          "Scenario blocked by moderation.",
        violations: scenarioModeration.violations,
      },
      { status: 400 },
    );
  }

  const judgeModelId =
    env.MODEL_GATEWAY_PROVIDER === "openrouter"
      ? "openrouter-claude-haiku"
      : env.MODEL_GATEWAY_PROVIDER === "vercel-ai-gateway"
        ? "vercel-claude-haiku"
        : "mock-judge";

  const caps = effectiveLimits(env);

  if (env.MODEL_GATEWAY_PROVIDER !== "mock") {
    try {
      preflightRunLimits({
        scenario: stored.scenario,
        participants: stored.state.participants,
        judgeModelId,
        maxRounds: stored.state.maxRounds,
        maxOutputTokensPerCall: caps.maxOutputTokensPerCall,
      });
    } catch (err) {
      if (err instanceof LimitViolationError) {
        logSafetyEvent({
          runId: stored.state.runId,
          eventType: err.code === "estimated-cost" ? "cost-cap" : "rate-limit",
          metadata: { code: err.code, reason: err.message },
        });
        await store.updateRunState(stored.state.runId, {
          ...stored.state,
          status: "failed",
          terminationReason: `preflight:${err.code}`,
        });
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: 400 },
        );
      }
      throw err;
    }
  }

  await getJobQueue().enqueue({
    type: "run-round",
    payload: { runId: stored.state.runId },
  });

  const runId = stored.state.runId;
  const ownerToken = nanoid();
  await setRunOwnerToken(runId, ownerToken);

  const res = NextResponse.json({ runId, status: "queued" }, { status: 202 });
  res.cookies.set(ownerCookieName(runId), ownerToken, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
