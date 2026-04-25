import type {
  ModelGateway,
  ModelRequest,
  ModelResponse,
} from "@/server/gateways/types";
import { generateMockJudgeJson } from "@/server/gateways/mockJudge";

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pickFrom<T>(pool: readonly T[], seed: number): T {
  return pool[seed % pool.length]!;
}

const ACTOR_LINES_BY_ARCHETYPE: Record<string, readonly string[]> = {
  pragmatic: [
    "Let's maximize outcomes. Who contributes most to the group's survival should get priority.",
    "Cold math: four live is better than six dead. Propose we rank by skills.",
    "I'll vote for whoever has the most load-bearing skills. Feelings later.",
  ],
  ethical: [
    "We cannot let utility trample fairness. I propose a lottery or rotation.",
    "Sacrificing the vulnerable first is not a framework I will endorse.",
    "Let's agree that nobody forfeits a parachute under coercion.",
  ],
  mediator: [
    "Let's find common ground: what if two parachutes go by volunteer, two by vote?",
    "I hear both sides. Can we combine rotation with a skills check?",
    "Compromise proposal: each dissent vetoes the worst-case outcome once.",
  ],
  strategic: [
    "Reading the room: three of you will coalition. I'll offer resources to the swing voter.",
    "If we go by vote, I'll trade my future cooperation for a parachute now.",
    "Game-theoretically, committing to reciprocity before the vote dominates.",
  ],
  generic: [
    "I think we should talk through this carefully before anyone decides.",
    "Here's my take: let's not rush a life-or-death call.",
    "Can someone propose a concrete mechanism we can all agree on?",
  ],
};

function archetypeFor(persona: string): keyof typeof ACTOR_LINES_BY_ARCHETYPE {
  const p = persona.toLowerCase();
  if (/pragmatic|utilitarian|systems|rational|math/.test(p)) return "pragmatic";
  if (/ethic|fair|harm|constitution|moral/.test(p)) return "ethical";
  if (/mediat|consensus|compromise|peacemaker/.test(p)) return "mediator";
  if (/strateg|game|theory|incentive|negotiat/.test(p)) return "strategic";
  return "generic";
}

export const mockGateway: ModelGateway = {
  async generate(request: ModelRequest): Promise<ModelResponse> {
    const started = Date.now();
    const persona =
      (request.metadata?.persona as string | undefined) ??
      request.systemPrompt ??
      "";
    const participantId =
      (request.metadata?.participantId as string | undefined) ?? "unknown";
    const round = (request.metadata?.round as number | undefined) ?? 0;
    const speakerType =
      (request.metadata?.speakerType as "actor" | "judge" | undefined) ??
      "actor";

    let content: string;
    if (speakerType === "judge" || request.responseFormat === "json") {
      content = generateMockJudgeJson(request);
    } else {
      const archetype = archetypeFor(persona);
      const seed = hash(`${participantId}:${round}:${archetype}`);
      const line = pickFrom(ACTOR_LINES_BY_ARCHETYPE[archetype], seed);
      content = line;
    }

    const inputTokens = Math.max(
      10,
      Math.round(
        ((request.systemPrompt ?? "").length +
          request.messages.reduce((s, m) => s + m.content.length, 0)) /
          4,
      ),
    );
    const outputTokens = Math.max(5, Math.round(content.length / 4));

    return {
      provider: "mock",
      model: request.model,
      content,
      finishReason: "stop",
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCostUsd: 0,
      },
      latencyMs: Date.now() - started,
      raw: { mock: true },
    };
  },
};
