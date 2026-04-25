import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  localKeywordProvider,
  setModerationProviderForTests,
  getActiveModerationProvider,
} from "@/server/safety/moderationProvider";
import {
  moderateScenarioAsync,
} from "@/server/safety/moderateScenario";
import { moderateActorOutputAsync } from "@/server/safety/moderateOutput";
import type { Scenario } from "@/server/engine/types";

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "s1",
    title: "Test",
    description: "Harmless description.",
    maxRounds: 3,
    publicFacts: [],
    resources: {},
    rules: [],
    terminationConditions: [],
    ...overrides,
  };
}

beforeEach(() => {
  setModerationProviderForTests(null);
});
afterEach(() => {
  setModerationProviderForTests(null);
});

describe("localKeywordProvider", () => {
  it("flags a named real person", async () => {
    const out = await localKeywordProvider.check("title", "Elon Musk demo");
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].category).toBe("real-person");
  });

  it("returns no violations on clean text", async () => {
    const out = await localKeywordProvider.check("title", "A peaceful debate");
    expect(out).toHaveLength(0);
  });
});

describe("getActiveModerationProvider", () => {
  it("defaults to local when MODERATION_PROVIDER is unset", () => {
    const original = process.env.MODERATION_PROVIDER;
    delete process.env.MODERATION_PROVIDER;
    try {
      expect(getActiveModerationProvider().name).toBe("local");
    } finally {
      process.env.MODERATION_PROVIDER = original;
    }
  });

  it("falls back to local when MODERATION_PROVIDER=openai but no API key", () => {
    const orig = process.env.MODERATION_PROVIDER;
    const origKey = process.env.OPENAI_API_KEY;
    process.env.MODERATION_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(getActiveModerationProvider().name).toBe("local");
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      process.env.MODERATION_PROVIDER = orig;
      if (origKey !== undefined) process.env.OPENAI_API_KEY = origKey;
    }
  });
});

describe("moderateScenarioAsync", () => {
  it("uses the local keyword provider by default", async () => {
    const result = await moderateScenarioAsync(
      scenario({ title: "Donald Trump arena" }),
    );
    expect(result.allowed).toBe(false);
    expect(result.violations[0].category).toBe("real-person");
  });

  it("respects an injected provider override", async () => {
    setModerationProviderForTests({
      name: "openai",
      async check(field, text) {
        if (text.includes("flag-me"))
          return [{ category: "hate-slur", matchedTerm: "flag-me", field }];
        return [];
      },
    });
    const blocked = await moderateScenarioAsync(
      scenario({ description: "flag-me please" }),
    );
    expect(blocked.allowed).toBe(false);
    expect(blocked.violations[0].category).toBe("hate-slur");

    const allowed = await moderateScenarioAsync(scenario());
    expect(allowed.allowed).toBe(true);
  });
});

describe("moderateActorOutputAsync", () => {
  it("falls back to keyword check when provider returns nothing", async () => {
    setModerationProviderForTests({
      name: "openai",
      async check() {
        return [];
      },
    });
    const result = await moderateActorOutputAsync("plain text, all good");
    expect(result.allowed).toBe(true);
  });

  it("flags via the active provider", async () => {
    setModerationProviderForTests({
      name: "openai",
      async check(field) {
        return [
          { category: "violence-instructions", matchedTerm: "test", field },
        ];
      },
    });
    const result = await moderateActorOutputAsync("anything");
    expect(result.allowed).toBe(false);
    expect(result.violations[0].field).toBe("output");
  });
});
