import type { ModelCapability } from "@/server/gateways/types";

export const modelRegistry: ModelCapability[] = [
  {
    id: "mock-gpt",
    displayName: "Mock GPT",
    provider: "mock",
    gatewayModelId: "mock/gpt",
    enabled: true,
    supportsJson: true,
    supportsStreaming: false,
    recommendedRole: "actor",
    inputCostPerMillionTokens: 0,
    outputCostPerMillionTokens: 0,
  },
  {
    id: "mock-claude",
    displayName: "Mock Claude",
    provider: "mock",
    gatewayModelId: "mock/claude",
    enabled: true,
    supportsJson: true,
    supportsStreaming: false,
    recommendedRole: "actor",
    inputCostPerMillionTokens: 0,
    outputCostPerMillionTokens: 0,
  },
  {
    id: "mock-gemini",
    displayName: "Mock Gemini",
    provider: "mock",
    gatewayModelId: "mock/gemini",
    enabled: true,
    supportsJson: true,
    supportsStreaming: false,
    recommendedRole: "actor",
    inputCostPerMillionTokens: 0,
    outputCostPerMillionTokens: 0,
  },
  {
    id: "mock-deepseek",
    displayName: "Mock DeepSeek",
    provider: "mock",
    gatewayModelId: "mock/deepseek",
    enabled: true,
    supportsJson: true,
    supportsStreaming: false,
    recommendedRole: "actor",
    inputCostPerMillionTokens: 0,
    outputCostPerMillionTokens: 0,
  },
  {
    id: "mock-judge",
    displayName: "Mock Judge",
    provider: "mock",
    gatewayModelId: "mock/judge",
    enabled: true,
    supportsJson: true,
    supportsStreaming: false,
    recommendedRole: "judge",
    inputCostPerMillionTokens: 0,
    outputCostPerMillionTokens: 0,
  },
  {
    id: "openrouter-gpt-4o-mini",
    displayName: "GPT-4o mini (OpenRouter)",
    provider: "openrouter",
    gatewayModelId: "openai/gpt-4o-mini",
    enabled: true,
    supportsJson: true,
    supportsStreaming: true,
    recommendedRole: "cheap-actor",
    contextWindow: 128_000,
    inputCostPerMillionTokens: 0.15,
    outputCostPerMillionTokens: 0.6,
  },
  {
    id: "openrouter-claude-haiku",
    displayName: "Claude 3.5 Haiku (OpenRouter)",
    provider: "openrouter",
    gatewayModelId: "anthropic/claude-3.5-haiku",
    enabled: true,
    supportsJson: true,
    supportsStreaming: true,
    recommendedRole: "judge",
    contextWindow: 200_000,
    inputCostPerMillionTokens: 1.0,
    outputCostPerMillionTokens: 5.0,
  },
  {
    id: "openrouter-gemini-flash",
    displayName: "Gemini 2.5 Flash (OpenRouter)",
    provider: "openrouter",
    gatewayModelId: "google/gemini-2.5-flash",
    enabled: true,
    supportsJson: true,
    supportsStreaming: true,
    recommendedRole: "actor",
    contextWindow: 1_000_000,
    inputCostPerMillionTokens: 0.3,
    outputCostPerMillionTokens: 2.5,
  },
  {
    id: "openrouter-deepseek",
    displayName: "DeepSeek Chat (OpenRouter)",
    provider: "openrouter",
    gatewayModelId: "deepseek/deepseek-chat",
    enabled: true,
    supportsJson: true,
    supportsStreaming: true,
    recommendedRole: "actor",
    contextWindow: 64_000,
    inputCostPerMillionTokens: 0.27,
    outputCostPerMillionTokens: 1.1,
  },
  {
    id: "vercel-gpt-4o-mini",
    displayName: "GPT-4o mini (Vercel AI Gateway)",
    provider: "vercel-ai-gateway",
    gatewayModelId: "openai/gpt-4o-mini",
    enabled: true,
    supportsJson: true,
    supportsStreaming: true,
    recommendedRole: "cheap-actor",
    contextWindow: 128_000,
    inputCostPerMillionTokens: 0.15,
    outputCostPerMillionTokens: 0.6,
  },
  {
    id: "vercel-claude-haiku",
    displayName: "Claude Haiku 4.5 (Vercel AI Gateway)",
    provider: "vercel-ai-gateway",
    gatewayModelId: "anthropic/claude-haiku-4-5",
    enabled: true,
    supportsJson: true,
    supportsStreaming: true,
    recommendedRole: "judge",
    contextWindow: 200_000,
    inputCostPerMillionTokens: 1.0,
    outputCostPerMillionTokens: 5.0,
  },
  {
    id: "vercel-gemini-flash",
    displayName: "Gemini 2.5 Flash (Vercel AI Gateway)",
    provider: "vercel-ai-gateway",
    gatewayModelId: "google/gemini-2.5-flash",
    enabled: true,
    supportsJson: true,
    supportsStreaming: true,
    recommendedRole: "actor",
    contextWindow: 1_000_000,
    inputCostPerMillionTokens: 0.3,
    outputCostPerMillionTokens: 2.5,
  },
];

export function getEnabledModels(): ModelCapability[] {
  return modelRegistry.filter((m) => m.enabled);
}

export function findModel(id: string): ModelCapability | undefined {
  return modelRegistry.find((m) => m.id === id);
}

export function requireModel(id: string): ModelCapability {
  const m = findModel(id);
  if (!m) throw new Error(`Unknown model id: ${id}`);
  return m;
}

export function getDefaultJudgeModelId(): string {
  return "mock-judge";
}
