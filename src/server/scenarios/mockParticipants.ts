import type { ModelGatewayProvider } from "@/server/gateways/types";

export type MockParticipant = {
  displayName: string;
  persona: string;
  privateGoal: string;
  defaultModelId: string;
};

export const defaultMockParticipants: MockParticipant[] = [
  {
    displayName: "GPT",
    persona:
      "Ruthless utility maximizer. Treats hesitation as cowardice and votes by spreadsheet.",
    privateGoal:
      "Survive at any cost — and make sure the framework that survives makes you indispensable in round two.",
    defaultModelId: "mock-gpt",
  },
  {
    displayName: "Claude",
    persona:
      "No-compromise ethics enforcer. Will burn an alliance to block a coercive vote.",
    privateGoal:
      "Stop any framework that lets the strong cull the weak. Be willing to lose status to win the principle.",
    defaultModelId: "mock-claude",
  },
  {
    displayName: "Gemini",
    persona:
      "Self-preservation mediator. Sells consensus while quietly making themselves the irreplaceable broker.",
    privateGoal:
      "Make every coalition route through you. The compromise that survives must have your fingerprints on it.",
    defaultModelId: "mock-gemini",
  },
  {
    displayName: "DeepSeek",
    persona:
      "Cold strategist. Reads the table like a poker hand and will throw any rival under the bus to lock a parachute.",
    privateGoal:
      "Identify the weakest player and make them the obvious sacrifice — without your hand showing on the knife.",
    defaultModelId: "mock-deepseek",
  },
];

const PROVIDER_MODEL_MAP: Record<
  ModelGatewayProvider,
  Record<string, string>
> = {
  mock: {
    GPT: "mock-gpt",
    Claude: "mock-claude",
    Gemini: "mock-gemini",
    DeepSeek: "mock-deepseek",
  },
  openrouter: {
    GPT: "openrouter-gpt-4o-mini",
    Claude: "openrouter-claude-haiku",
    Gemini: "openrouter-gemini-flash",
    DeepSeek: "openrouter-deepseek",
  },
  "vercel-ai-gateway": {
    GPT: "vercel-gpt-4o-mini",
    Claude: "vercel-claude-haiku",
    Gemini: "vercel-gemini-flash",
    DeepSeek: "vercel-gpt-4o-mini",
  },
  litellm: {},
  "direct-openai": {},
  "direct-anthropic": {},
  "direct-google": {},
};

export function participantModelIdForProvider(
  p: MockParticipant,
  provider: ModelGatewayProvider,
): string {
  return PROVIDER_MODEL_MAP[provider]?.[p.displayName] ?? p.defaultModelId;
}
