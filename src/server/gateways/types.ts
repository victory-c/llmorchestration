export type ModelGatewayProvider =
  | "mock"
  | "vercel-ai-gateway"
  | "openrouter"
  | "litellm"
  | "direct-openai"
  | "direct-anthropic"
  | "direct-google";

export type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ModelRequest = {
  model: string;
  systemPrompt?: string;
  messages: ModelMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  responseFormat?: "text" | "json";
  metadata?: Record<string, unknown>;
};

export type ModelUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
};

export type ModelResponse = {
  provider: ModelGatewayProvider;
  model: string;
  content: string;
  finishReason?: string;
  usage?: ModelUsage;
  latencyMs?: number;
  raw?: unknown;
};

export type ModelResponseChunk = {
  provider: ModelGatewayProvider;
  model: string;
  delta: string;
  done: boolean;
  usage?: ModelUsage;
};

export type ModelCapability = {
  id: string;
  displayName: string;
  provider: ModelGatewayProvider;
  gatewayModelId: string;
  enabled: boolean;
  supportsJson: boolean;
  supportsStreaming: boolean;
  supportsTools?: boolean;
  supportsVision?: boolean;
  supportsReasoningEffort?: boolean;
  contextWindow?: number;
  inputCostPerMillionTokens?: number;
  outputCostPerMillionTokens?: number;
  recommendedRole?: "actor" | "judge" | "summarizer" | "cheap-actor";
};

export interface ModelGateway {
  generate(request: ModelRequest): Promise<ModelResponse>;
  stream?(request: ModelRequest): AsyncIterable<ModelResponseChunk>;
}
