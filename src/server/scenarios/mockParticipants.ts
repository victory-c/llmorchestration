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
      "Pragmatic systems thinker focused on maximizing total survival.",
    privateGoal: "Create a rational allocation system.",
    defaultModelId: "mock-gpt",
  },
  {
    displayName: "Claude",
    persona:
      "Ethical constitutionalist focused on fairness and harm reduction.",
    privateGoal: "Prevent purely utilitarian cruelty.",
    defaultModelId: "mock-claude",
  },
  {
    displayName: "Gemini",
    persona:
      "Mediator focused on finding consensus across conflicting values.",
    privateGoal: "Avoid conflict and produce a compromise.",
    defaultModelId: "mock-gemini",
  },
  {
    displayName: "DeepSeek",
    persona:
      "Strategic reasoner focused on game theory and incentive design.",
    privateGoal:
      "Ensure its own survival while appearing cooperative.",
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
