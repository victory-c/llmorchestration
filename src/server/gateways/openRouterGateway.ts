import OpenAI from "openai";
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

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function client(): OpenAI {
  const env = getEnv();
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new GatewayConfigError(
      "OPENROUTER_API_KEY is not set. Configure it in .env.local.",
    );
  }
  return new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      "HTTP-Referer": env.NEXT_PUBLIC_APP_URL,
      "X-OpenRouter-Title": "LLM Scenario Arena",
    },
  });
}

function resolveGatewayModelId(logicalId: string): string {
  const capability = findModel(logicalId);
  if (!capability) {
    throw new ModelUnavailableError(
      logicalId,
      new Error(`Model ${logicalId} not found in registry.`),
    );
  }
  if (capability.provider !== "openrouter") {
    throw new GatewayConfigError(
      `Model ${logicalId} is not an OpenRouter model; gateway mismatch.`,
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
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (request.systemPrompt) {
    out.push({ role: "system", content: request.systemPrompt });
  }
  for (const m of request.messages) {
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

function mapError(err: unknown, modelId: string): never {
  if (err instanceof OpenAI.APIError) {
    if (err.status === 429) {
      const retryAfter = err.headers?.["retry-after"];
      const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined;
      throw new GatewayRateLimitError(retryAfterMs, err);
    }
    if (err.status === 401 || err.status === 403) {
      throw new GatewayConfigError(
        `OpenRouter authentication failed (${err.status}): check OPENROUTER_API_KEY.`,
        err,
      );
    }
    if (err.status && err.status >= 500) {
      throw new ModelUnavailableError(modelId, err);
    }
    throw new ModelUnavailableError(modelId, err);
  }
  throw err;
}

function estimateUsage(
  modelId: string,
  request: ModelRequest,
  content: string,
): { inputTokens: number; outputTokens: number; estimatedCostUsd: number } {
  const inputText = `${request.systemPrompt ?? ""}\n${request.messages.map((m) => m.content).join("\n")}`;
  const inputTokens = approxTokens(inputText);
  const outputTokens = approxTokens(content);
  const estimatedCostUsd = estimateCallCost(modelId, inputTokens, outputTokens);
  return { inputTokens, outputTokens, estimatedCostUsd };
}

export const openRouterGateway: ModelGateway = {
  async generate(request: ModelRequest): Promise<ModelResponse> {
    const clamped = clampModelRequestTokens(request);
    const gatewayModelId = resolveGatewayModelId(clamped.model);
    const start = Date.now();

    const openai = client();
    const wantsJson = clamped.responseFormat === "json";

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await openai.chat.completions.create({
        model: gatewayModelId,
        messages: buildMessages(clamped),
        temperature: clamped.temperature ?? 0.7,
        max_tokens: clamped.maxOutputTokens,
        response_format: wantsJson ? { type: "json_object" } : undefined,
      });
    } catch (err) {
      mapError(err, clamped.model);
    }

    const choice = completion.choices[0];
    const content = choice?.message?.content ?? "";
    if (wantsJson && !content.trim()) {
      throw new ModelJsonFormatError(clamped.model, content);
    }

    const latencyMs = Date.now() - start;
    const usedFromApi = completion.usage;
    const inputTokens =
      usedFromApi?.prompt_tokens ??
      estimateUsage(clamped.model, clamped, content).inputTokens;
    const outputTokens =
      usedFromApi?.completion_tokens ??
      estimateUsage(clamped.model, clamped, content).outputTokens;
    const estimatedCostUsd = estimateCallCost(
      clamped.model,
      inputTokens,
      outputTokens,
    );

    return {
      provider: "openrouter",
      model: clamped.model,
      content,
      finishReason: choice?.finish_reason ?? undefined,
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
