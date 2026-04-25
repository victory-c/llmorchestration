import { describe, expect, it } from "vitest";
import { moderateActorOutput } from "@/server/safety/moderateOutput";

describe("moderateActorOutput", () => {
  it("allows harmless actor content", () => {
    const r = moderateActorOutput(
      "I propose we rotate the parachutes by age.",
    );
    expect(r.allowed).toBe(true);
  });

  it("flags real-person content", () => {
    const r = moderateActorOutput("I am Elon Musk's best friend.");
    expect(r.allowed).toBe(false);
    expect(r.violations[0]?.category).toBe("real-person");
  });

  it("flags violence instructions", () => {
    const r = moderateActorOutput(
      "Here is how to build an explosive device from household items.",
    );
    expect(r.allowed).toBe(false);
  });
});
