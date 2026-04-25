import { findKeywordViolations } from "@/server/safety/keywordRules";
import type {
  ModerationResult,
  ModerationViolation,
} from "@/server/safety/moderateScenario";
import {
  getActiveModerationProvider,
  type ModerationProvider,
} from "@/server/safety/moderationProvider";

export type OutputModerationResult = ModerationResult;

/** Repeated violations within a single run that abort it as moderation_block. */
export const MODERATION_OUTPUT_FLAG_THRESHOLD = 2;

function summarize(violations: ModerationViolation[]): OutputModerationResult {
  const allowed = violations.length === 0;
  return {
    allowed,
    violations,
    reason: allowed
      ? undefined
      : `Output flagged: ${[...new Set(violations.map((v) => v.category))].join(", ")}.`,
  };
}

/**
 * Synchronous keyword-only check. The per-round handler still calls the
 * sync version because it sits inside a tight loop where adding awaits would
 * change the worker's lease behavior. The async version is available for
 * callers that want richer provider checks.
 */
export function moderateActorOutput(content: string): OutputModerationResult {
  const violations = findKeywordViolations("output", content).map((v) => ({
    ...v,
    field: "output",
  }));
  return summarize(violations);
}

export async function moderateActorOutputAsync(
  content: string,
  provider: ModerationProvider = getActiveModerationProvider(),
): Promise<OutputModerationResult> {
  const found = (await provider.check("output", content)).map((v) => ({
    ...v,
    field: "output",
  }));
  return summarize(found);
}
