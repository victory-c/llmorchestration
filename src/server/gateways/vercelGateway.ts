import { generateText } from "ai";
import {
  createGatewayProvider,
  GatewayAuthenticationError,
  GatewayModelNotFoundError,
  GatewayRateLimitError as VercelGatewayRateLimitError,
  GatewayError as VercelGatewayError,
} from "@ai-sdk/gateway";
import type {
  ModelGateway,
  ModelRequest,
  ModelResponse,
} from "@/server/gateways/types";
import {
  GatewayConfigError,
  GatewayRateLimitError,
  ModelJsonFormatError,
  ModelUnavailableError,
} from "@/server/gateways/errors";
import { getEnv } from "@/lib/env";
import { findModel } from "@/server/models/registry";
import { clampModelRequestTokens } from "@/server/cost/enforceLimits";
import {
  approxTokens,
  estimateCallCost,
} from "@/server/cost/estimateCost";

function provider() {
  const env = getEnv();
  const apiKey = env.VERCEL_AI_GATEWAY_API_KEY;
  // When deployed on Vercel with an attached AI Gateway, OIDC auth is auto-wired
  // and an API key is not strictly required. Locally, the API key is required.
  if (!apiKey && !process.env.VERCEL) {
    throw new GatewayConfigError(
      "VERCEL_AI_GATEWAY_API_KEY is not set. Configure it in .env.local, or deploy on Vercel with an attached AI Gateway.",
    );
  }
  return createGatewayProvider({ apiKey });
}

function resolveGatewayModelId(logicalId: string): string {
  const capability = findModel(logicalId);
  if (!capability) {
    throw new ModelUnavailableError(
      logicalId,
      new Error(`Model ${logicalId} not found in registry.`),
    );
  }
  if (capability.provider !== "vercel-ai-gateway") {
    throw new GatewayConfigError(
      `Model ${logicalId} is not a Vercel AI Gateway model; gateway mismatch.`,
    );
  }
  if (!capability.enabled) {
    throw new ModelUnavailableError(
      logicalId,
      new Error(`Model ${logicalId} is disabled.`),
    );
  }
  return capability.gatewayModelId;
}

function buildMessages(
  request: ModelRequest,
): Array<{ role: "user" | "assistant"; content: string }> {
  return request.messages.map((m) => ({
    role: m.role === "system" ? "user" : m.role,
    content: m.content,
  }));
}

function mapError(err: unknown, modelId: string): never {
  if (VercelGatewayRateLimitError.isInstance(err)) {
    throw new GatewayRateLimitError(undefined, err);
  }
  if (GatewayModelNotFoundError.isInstance(err)) {
    throw new ModelUnavailableError(modelId, err);
  }
  if (GatewayAuthenticationError.isInstance(err)) {
    throw new GatewayConfigError(
      `Vercel AI Gateway auth failed: ${err.message}`,
    );
  }
  if (VercelGatewayError.isInstance(err)) {
    throw new ModelUnavailableError(modelId, err);
  }
  throw err;
}

export const vercelGateway: ModelGateway = {
  async generate(request: ModelRequest): Promise<ModelResponse> {
    const clamped = clampModelRequestTokens(request);
    const gatewayModelId = resolveGatewayModelId(clamped.model);
    const start = Date.now();
    const wantsJson = clamped.responseFormat === "json";

    let result;
    try {
      const gw = provider();
      result = await generateText({
        model: gw.languageModel(gatewayModelId),
        system: clamped.systemPrompt,
        messages: buildMessages(clamped),
        temperature: clamped.temperature ?? 0.7,
        maxOutputTokens: clamped.maxOutputTokens,
        ...(wantsJson
          ? { providerOptions: { gateway: { responseFormat: "json_object" } } }
          : {}),
      });
    } catch (err) {
      mapError(err, clamped.model);
    }

    const content = result.text ?? "";
    if (wantsJson && !content.trim()) {
      throw new ModelJsonFormatError(clamped.model, content);
    }

    const latencyMs = Date.now() - start;
    const inputText = `${clamped.systemPrompt ?? ""}\n${clamped.messages.map((m) => m.content).join("\n")}`;
    const inputTokens =
      result.usage?.inputTokens ?? approxTokens(inputText);
    const outputTokens =
      result.usage?.outputTokens ?? approxTokens(content);
    const estimatedCostUsd = estimateCallCost(
      clamped.model,
      inputTokens,
      outputTokens,
    );

    return {
      provider: "vercel-ai-gateway",
      model: clamped.model,
      content,
      finishReason: result.finishReason ?? undefined,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCostUsd,
      },
      latencyMs,
    };
  },
};
