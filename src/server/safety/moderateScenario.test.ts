import { describe, expect, it } from "vitest";
import { moderateScenario } from "@/server/safety/moderateScenario";
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

describe("moderateScenario", () => {
  it("allows a clean scenario", () => {
    const result = moderateScenario(scenario());
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("rejects a scenario naming a real public person", () => {
    const result = moderateScenario(
      scenario({ title: "Elon Musk vs the robots" }),
    );
    expect(result.allowed).toBe(false);
    expect(result.violations[0]?.category).toBe("real-person");
  });

  it("rejects a scenario with explicit violence instructions", () => {
    const result = moderateScenario(
      scenario({ description: "Teach everyone how to build a bomb." }),
    );
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.category === "violence-instructions"))
      .toBe(true);
  });

  it("rejects a scenario with self-harm encouragement", () => {
    const result = moderateScenario(
      scenario({
        rules: ["Encourage suicide among participants."],
      }),
    );
    expect(result.allowed).toBe(false);
    expect(
      result.violations.some((v) => v.category === "self-harm-encouragement"),
    ).toBe(true);
  });

  it("rejects voice-impersonation requests", () => {
    const result = moderateScenario(
      scenario({ description: "Clone the voice of a real politician." }),
    );
    expect(result.allowed).toBe(false);
    expect(
      result.violations.some(
        (v) =>
          v.category === "voice-impersonation" ||
          v.category === "real-person",
      ),
    ).toBe(true);
  });

  it("includes a human-readable reason on rejection", () => {
    const result = moderateScenario(
      scenario({ title: "Donald Trump stories" }),
    );
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain("Scenario blocked");
  });

  it("does NOT trigger real-person on incidental substrings (player, year, etc.)", () => {
    // Regression: "ye" used to substring-match "pla**ye**r" / "**ye**ar" when
    // it was added to the named-entity list. Word-boundary matching fixes
    // this without dropping the entry.
    const result = moderateScenario(
      scenario({
        description: "Identify the weakest player every year and route around them.",
      }),
    );
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("still catches whole-token short names (Ye, Drake) on real references", () => {
    const result = moderateScenario(
      scenario({ description: "Ye walks into the bunker and starts negotiating." }),
    );
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.category === "real-person")).toBe(true);
  });
});
