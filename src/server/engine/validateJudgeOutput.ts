import { z } from "zod";
import type { JudgeOutput } from "@/server/engine/types";

const participantStatus = z.enum([
  "active",
  "eliminated",
  "dead",
  "saved",
  "unknown",
]);

const eventSchema = z.object({
  type: z.string(),
  actorId: z.string().optional(),
  description: z.string(),
});

const stateUpdateEvent = eventSchema.extend({
  round: z.number().int().optional(),
});

export const judgeOutputZodSchema = z.object({
  roundSummary: z.string().min(1),
  stateUpdates: z
    .object({
      round: z.number().int().optional(),
      publicFacts: z.array(z.string()).optional(),
      resources: z
        .record(
          z.string(),
          z.union([z.number(), z.string(), z.boolean()]),
        )
        .optional(),
      recentEvents: z.array(stateUpdateEvent).optional(),
    })
    .default({}),
  participantStatusUpdates: z
    .record(z.string(), participantStatus)
    .optional(),
  newEvents: z.array(eventSchema).default([]),
  nextRoundPrompt: z.string().optional(),
  shouldTerminate: z.boolean(),
  terminationReason: z.string().optional(),
});

export type ValidateResult =
  | { ok: true; value: JudgeOutput }
  | { ok: false; error: string; raw: string };

function extractJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence?.[1]) return fence[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return null;
}

export function validateJudgeOutput(raw: string): ValidateResult {
  const extracted = extractJson(raw);
  if (!extracted) {
    return { ok: false, error: "No JSON object found in judge output.", raw };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted);
  } catch (e) {
    return {
      ok: false,
      error: `Invalid JSON: ${(e as Error).message}`,
      raw,
    };
  }
  const result = judgeOutputZodSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: expected ${i.message}`)
      .join("; ");
    return {
      ok: false,
      error: `Schema mismatch: ${issues}`,
      raw,
    };
  }
  return { ok: true, value: result.data as JudgeOutput };
}

export function synthesizeFallbackJudgeOutput(opts: {
  round: number;
  maxRounds: number;
  reason: string;
}): JudgeOutput {
  const nextRound = opts.round + 1;
  const shouldTerminate = nextRound >= opts.maxRounds;
  return {
    roundSummary: `Round ${nextRound}: (judge output was invalid; falling back). ${opts.reason}`,
    stateUpdates: { round: nextRound },
    newEvents: [
      {
        type: "judge-fallback",
        description: `Judge output invalid; applied minimal passthrough. Reason: ${opts.reason}`,
      },
    ],
    shouldTerminate,
    terminationReason: shouldTerminate ? "max-rounds-reached" : undefined,
  };
}
