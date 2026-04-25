import type { Scenario, RunParticipant } from "@/server/engine/types";
import { findKeywordViolations } from "@/server/safety/keywordRules";
import {
  getActiveModerationProvider,
  type ModerationProvider,
} from "@/server/safety/moderationProvider";

export type ModerationViolation = {
  category:
    | "real-person"
    | "hate-slur"
    | "graphic-sadism"
    | "self-harm-encouragement"
    | "violence-instructions"
    | "illegal-operations"
    | "voice-impersonation";
  matchedTerm: string;
  field: string;
};

export type ModerationResult = {
  allowed: boolean;
  violations: ModerationViolation[];
  reason?: string;
};

function fieldsToCheck(
  scenario: Scenario,
  participants: RunParticipant[],
): Array<[string, string]> {
  const out: Array<[string, string]> = [
    ["title", scenario.title],
    ["description", scenario.description],
  ];
  for (let i = 0; i < scenario.rules.length; i++) {
    out.push([`rules[${i}]`, scenario.rules[i]!]);
  }
  for (let i = 0; i < scenario.publicFacts.length; i++) {
    out.push([`publicFacts[${i}]`, scenario.publicFacts[i]!]);
  }
  for (const p of participants) {
    out.push([`participant:${p.id}.persona`, p.publicPersona]);
    out.push([`participant:${p.id}.displayName`, p.displayName]);
    if (p.privateGoal) {
      out.push([`participant:${p.id}.goal`, p.privateGoal]);
    }
  }
  return out;
}

function summarize(violations: ModerationViolation[]): ModerationResult {
  const allowed = violations.length === 0;
  return {
    allowed,
    violations,
    reason: allowed
      ? undefined
      : `Scenario blocked: ${[...new Set(violations.map((v) => v.category))].join(", ")}.`,
  };
}

/**
 * Synchronous keyword-only check. Preserves the M2 call-site contract for
 * places that can't easily await (rendered layouts, validators, tests).
 *
 * Prefer `moderateScenarioAsync` whenever the call site is already async —
 * that path uses the active provider (local or OpenAI) and is what runs in
 * production before any paid model call.
 */
export function moderateScenario(
  scenario: Scenario,
  participants: RunParticipant[] = [],
): ModerationResult {
  const violations: ModerationViolation[] = [];
  for (const [field, text] of fieldsToCheck(scenario, participants)) {
    violations.push(...findKeywordViolations(field, text));
  }
  return summarize(violations);
}

/**
 * Async path that respects the configured moderation provider. Used by
 * `POST /api/runs/:id/start` so the hosted demo can run a real moderation
 * model when MODERATION_PROVIDER=openai is set, while still applying the
 * keyword check for named-entity coverage.
 */
export async function moderateScenarioAsync(
  scenario: Scenario,
  participants: RunParticipant[] = [],
  provider: ModerationProvider = getActiveModerationProvider(),
): Promise<ModerationResult> {
  const violations: ModerationViolation[] = [];
  for (const [field, text] of fieldsToCheck(scenario, participants)) {
    const found = await provider.check(field, text);
    violations.push(...found);
  }
  return summarize(violations);
}
