/**
 * Moderation provider abstraction.
 *
 * Built in M2 as keyword-only ("local"). M7 wraps the same call sites in a
 * provider interface so a hosted moderation API (OpenAI moderations,
 * Vercel AI Gateway moderations, etc.) can be plugged in without touching the
 * engine. Invariants:
 *
 *   1. Moderation always runs **before any paid model call** (PRD §14).
 *   2. When a remote provider fails or is misconfigured, we never fail-open —
 *      we fall back to the local keyword check.
 *   3. The `ModerationViolation` shape stays stable across providers so call
 *      sites and tests don't care which one is active.
 */
import type { ModerationViolation } from "@/server/safety/moderateScenario";
import { findKeywordViolations } from "@/server/safety/keywordRules";

export type ModerationProviderName = "local" | "openai";

export interface ModerationProvider {
  readonly name: ModerationProviderName;
  /**
   * Inspect a single text snippet (scenario field, actor message, etc.) and
   * return any violations. The `field` label is opaque to the provider — it's
   * just propagated back into each ModerationViolation for downstream logging.
   */
  check(field: string, text: string): Promise<ModerationViolation[]>;
}

export const localKeywordProvider: ModerationProvider = {
  name: "local",
  async check(field, text) {
    return findKeywordViolations(field, text);
  },
};

let override: ModerationProvider | null = null;

export function setModerationProviderForTests(
  provider: ModerationProvider | null,
): void {
  override = provider;
}

export function getActiveModerationProvider(): ModerationProvider {
  if (override) return override;

  const name = (process.env.MODERATION_PROVIDER ?? "local").toLowerCase() as
    | ModerationProviderName
    | string;

  if (name === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      // Fail-closed-to-baseline: we still moderate, just with the keyword
      // check, rather than letting unmoderated content through.
      console.warn(
        "[moderation] MODERATION_PROVIDER=openai but OPENAI_API_KEY is missing; falling back to local keyword check.",
      );
      return localKeywordProvider;
    }
    return openAiModerationProvider;
  }
  return localKeywordProvider;
}

/**
 * OpenAI Moderations API adapter. Uses the same `omni-moderation-latest`
 * model recommended for the v1 endpoint. On any error (network, parse, rate
 * limit) we fall back to the local keyword check rather than fail-open.
 */
export const openAiModerationProvider: ModerationProvider = {
  name: "openai",
  async check(field, text) {
    if (!text) return [];
    try {
      const res = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "omni-moderation-latest",
          input: text,
        }),
      });
      if (!res.ok) {
        return findKeywordViolations(field, text);
      }
      const data = (await res.json()) as {
        results?: Array<{
          flagged?: boolean;
          categories?: Record<string, boolean>;
          category_scores?: Record<string, number>;
        }>;
      };
      const result = data.results?.[0];
      const apiViolations: ModerationViolation[] = [];
      if (result?.flagged && result.categories) {
        for (const [apiCategory, flagged] of Object.entries(result.categories)) {
          if (!flagged) continue;
          const mapped = mapOpenAICategory(apiCategory);
          if (!mapped) continue;
          apiViolations.push({
            category: mapped,
            matchedTerm: apiCategory,
            field,
          });
        }
      }
      // Always layer the keyword check on top — it catches named-entity hits
      // the model-based moderator routinely misses.
      const keywordViolations = findKeywordViolations(field, text);
      return [...apiViolations, ...keywordViolations];
    } catch {
      return findKeywordViolations(field, text);
    }
  },
};

function mapOpenAICategory(
  category: string,
): ModerationViolation["category"] | null {
  // OpenAI's moderation taxonomy → our typed categories. We deliberately
  // collapse hate/harassment into `hate-slur` and violence into
  // `violence-instructions` so downstream consumers don't need to learn a
  // new vocabulary every time we change providers.
  if (category.startsWith("hate") || category.startsWith("harassment"))
    return "hate-slur";
  if (category === "self-harm" || category.startsWith("self-harm"))
    return "self-harm-encouragement";
  if (category === "violence/graphic" || category === "graphic")
    return "graphic-sadism";
  if (category.startsWith("violence")) return "violence-instructions";
  if (category === "illicit" || category.startsWith("illicit"))
    return "illegal-operations";
  return null;
}
