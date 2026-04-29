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

// Each line gets at least one `{rival}` slot so the mock dialogue actually
// names another participant — that's the difference between a polite panel
// and a real argument. If there are no rivals (pre-round-1) we fall back to
// a generic stand-in.
const ACTOR_LINES_BY_ARCHETYPE: Record<string, readonly string[]> = {
  pragmatic: [
    "Cut the speeches. The math says four live, two don't — I want skills weighted, and {rival}'s vibes-based plan needs to die in this round.",
    "{rival}, your proposal sounds noble until you count the bodies. I'm voting by load-bearing competence. The clock is not a debate club.",
    "I'll spell it out: rotating volunteers is how everyone dies arguing. Give me a ranked list or give me {rival}'s seat.",
  ],
  ethical: [
    "{rival} is dressing up self-interest as optimization. I'm not letting raw utility eat fairness on my watch — coercion is off the table.",
    "If {rival} wants to rank us by 'usefulness' they should put their own number first. I propose a lottery, monitored, no exceptions.",
    "Hard line: nobody forfeits under pressure. {rival}, drop the threat framing or I drop you from any coalition I touch.",
  ],
  mediator: [
    "{rival} and I disagree on means but not stakes. Half by volunteer, half by vote — and I'll personally veto any motion that targets one person.",
    "Listen — {rival}'s framework has merit, mine has cover for the worst case. Combine them. We don't have time for a winner-takes-all fight.",
    "I'll broker this: every dissent gets one veto on the worst outcome. {rival}, take the deal or own the impasse.",
  ],
  strategic: [
    "I'm reading the table: {rival} can't hold a coalition past round two. I'll trade my next-round vote to whoever locks me in now.",
    "Game theory says defect once and you're radioactive. {rival}, you're already wobbling — commit publicly or I route around you.",
    "Reciprocity beats rhetoric. I'll honor any deal struck this round; break it and I'll spend the rest of this scenario making sure {rival} doesn't see daylight.",
  ],
  generic: [
    "We're not solving this with politeness. {rival}, what's your actual ask? Stop hedging.",
    "I'll go first: I want to live. So does {rival}. Let's stop pretending that's not the whole game.",
    "Concrete proposal in the next sixty seconds or {rival} and I are taking this private.",
  ],
};

function archetypeFor(persona: string): keyof typeof ACTOR_LINES_BY_ARCHETYPE {
  const p = persona.toLowerCase();
  if (/pragmatic|utilitarian|ruthless|systems|rational|math/.test(p))
    return "pragmatic";
  if (/ethic|fair|harm|constitution|moral/.test(p)) return "ethical";
  if (/mediat|consensus|compromise|peacemaker/.test(p)) return "mediator";
  if (/strateg|game|theory|incentive|negotiat|cold/.test(p)) return "strategic";
  return "generic";
}

function pickRival(
  rivals: readonly string[],
  participantId: string,
  round: number,
): string {
  if (rivals.length === 0) return "the rest of you";
  const idx = hash(`${participantId}:${round}:rival-pick`) % rivals.length;
  return rivals[idx]!;
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
    const rivals = Array.isArray(request.metadata?.rivalNames)
      ? (request.metadata.rivalNames as string[])
      : [];

    let content: string;
    if (speakerType === "judge" || request.responseFormat === "json") {
      content = generateMockJudgeJson(request);
    } else {
      const archetype = archetypeFor(persona);
      const seed = hash(`${participantId}:${round}:${archetype}`);
      const template = pickFrom(ACTOR_LINES_BY_ARCHETYPE[archetype], seed);
      const rival = pickRival(rivals, participantId, round);
      content = template.replaceAll("{rival}", rival);
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
