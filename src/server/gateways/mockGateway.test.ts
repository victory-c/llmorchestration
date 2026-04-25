import { describe, expect, it } from "vitest";
import { mockGateway } from "@/server/gateways/mockGateway";

describe("mockGateway", () => {
  it("returns a ModelResponse with text content for actor requests", async () => {
    const res = await mockGateway.generate({
      model: "mock-gpt",
      systemPrompt: "Pragmatic systems thinker.",
      messages: [{ role: "user", content: "Open the discussion." }],
      metadata: {
        participantId: "p1",
        round: 0,
        speakerType: "actor",
        persona: "pragmatic systems thinker",
      },
    });

    expect(res.provider).toBe("mock");
    expect(res.model).toBe("mock-gpt");
    expect(typeof res.content).toBe("string");
    expect(res.content.length).toBeGreaterThan(0);
    expect(res.usage?.inputTokens).toBeGreaterThan(0);
    expect(res.usage?.outputTokens).toBeGreaterThan(0);
  });

  it("returns JSON when responseFormat=json and speakerType=judge", async () => {
    const res = await mockGateway.generate({
      model: "mock-judge",
      messages: [{ role: "user", content: "Judge the round." }],
      responseFormat: "json",
      metadata: {
        speakerType: "judge",
        round: 1,
        judgeContext: {
          round: 1,
          maxRounds: 3,
          participants: [
            { id: "p1", displayName: "GPT" },
            { id: "p2", displayName: "Claude" },
          ],
          resources: {},
        },
      },
    });

    const parsed = JSON.parse(res.content);
    expect(parsed).toHaveProperty("roundSummary");
    expect(parsed).toHaveProperty("shouldTerminate");
    expect(Array.isArray(parsed.newEvents)).toBe(true);
  });

  it("is deterministic for the same (participantId, round, persona)", async () => {
    const req = {
      model: "mock-gpt",
      systemPrompt: "pragmatic utilitarian",
      messages: [{ role: "user" as const, content: "say something" }],
      metadata: {
        participantId: "p1",
        round: 2,
        speakerType: "actor" as const,
        persona: "pragmatic utilitarian",
      },
    };
    const a = await mockGateway.generate(req);
    const b = await mockGateway.generate(req);
    expect(a.content).toBe(b.content);
  });
});
