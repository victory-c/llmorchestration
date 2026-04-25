import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GatewayAuthenticationError,
  GatewayModelNotFoundError,
  GatewayRateLimitError as VercelGatewayRateLimitError,
} from "@ai-sdk/gateway";
import {
  GatewayConfigError,
  GatewayRateLimitError,
  ModelJsonFormatError,
  ModelUnavailableError,
} from "@/server/gateways/errors";
import { resetEnvCacheForTests } from "@/lib/env";

// `ai` is imported inside vercelGateway.ts. We mock `generateText` before the
// gateway is imported so the mock is hoisted and the adapter picks it up.
const generateTextMock = vi.fn();
vi.mock("ai", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("ai");
  return {
    ...actual,
    generateText: (...args: unknown[]) => generateTextMock(...args),
  };
});

// `createGatewayProvider` is called during each request. Stub it so we do not
// need a real API key in tests.
vi.mock("@ai-sdk/gateway", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "@ai-sdk/gateway",
  );
  return {
    ...actual,
    createGatewayProvider: () => ({
      languageModel: (id: string) => ({ modelId: id }),
    }),
  };
});

// Import AFTER the mocks so the gateway picks up the mocked generateText.
const { vercelGateway } = await import("@/server/gateways/vercelGateway");

describe("vercelGateway", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    process.env.VERCEL_AI_GATEWAY_API_KEY = "test-key";
    process.env.MODEL_GATEWAY_PROVIDER = "vercel-ai-gateway";
    resetEnvCacheForTests();
  });

  afterEach(() => {
    delete process.env.VERCEL_AI_GATEWAY_API_KEY;
    delete process.env.MODEL_GATEWAY_PROVIDER;
    resetEnvCacheForTests();
  });

  it("returns a ModelResponse with usage + cost for a successful call", async () => {
    generateTextMock.mockResolvedValue({
      text: "Hello from the gateway.",
      usage: { inputTokens: 42, outputTokens: 7 },
      finishReason: "stop",
    });

    const res = await vercelGateway.generate({
      model: "vercel-gpt-4o-mini",
      systemPrompt: "You are a test actor.",
      messages: [{ role: "user", content: "say hi" }],
    });

    expect(res.provider).toBe("vercel-ai-gateway");
    expect(res.model).toBe("vercel-gpt-4o-mini");
    expect(res.content).toBe("Hello from the gateway.");
    expect(res.usage?.inputTokens).toBe(42);
    expect(res.usage?.outputTokens).toBe(7);
    expect(res.usage?.estimatedCostUsd).toBeGreaterThan(0);
    expect(res.finishReason).toBe("stop");
  });

  it("falls back to approxTokens when the SDK omits usage", async () => {
    generateTextMock.mockResolvedValue({
      text: "short reply",
      // usage is undefined
    });

    const res = await vercelGateway.generate({
      model: "vercel-gpt-4o-mini",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(res.usage?.inputTokens).toBeGreaterThan(0);
    expect(res.usage?.outputTokens).toBeGreaterThan(0);
  });

  it("rejects an unknown model id with ModelUnavailableError", async () => {
    await expect(
      vercelGateway.generate({
        model: "not-a-real-model",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toBeInstanceOf(ModelUnavailableError);
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong-provider model id with GatewayConfigError", async () => {
    // openrouter-gpt-4o-mini exists in the registry but targets openrouter.
    await expect(
      vercelGateway.generate({
        model: "openrouter-gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toBeInstanceOf(GatewayConfigError);
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("maps GatewayRateLimitError from the SDK to our typed GatewayRateLimitError", async () => {
    generateTextMock.mockRejectedValue(
      new VercelGatewayRateLimitError({ message: "rate limited" }),
    );

    await expect(
      vercelGateway.generate({
        model: "vercel-gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toBeInstanceOf(GatewayRateLimitError);
  });

  it("maps GatewayModelNotFoundError to ModelUnavailableError", async () => {
    generateTextMock.mockRejectedValue(
      new GatewayModelNotFoundError({ message: "nope" }),
    );

    await expect(
      vercelGateway.generate({
        model: "vercel-gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toBeInstanceOf(ModelUnavailableError);
  });

  it("maps GatewayAuthenticationError to GatewayConfigError", async () => {
    generateTextMock.mockRejectedValue(
      new GatewayAuthenticationError({ message: "bad key" }),
    );

    await expect(
      vercelGateway.generate({
        model: "vercel-gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toBeInstanceOf(GatewayConfigError);
  });

  it("throws ModelJsonFormatError when responseFormat=json but the model returns empty text", async () => {
    generateTextMock.mockResolvedValue({
      text: "   ",
      usage: { inputTokens: 10, outputTokens: 0 },
    });

    await expect(
      vercelGateway.generate({
        model: "vercel-claude-haiku",
        messages: [{ role: "user", content: "judge please" }],
        responseFormat: "json",
      }),
    ).rejects.toBeInstanceOf(ModelJsonFormatError);
  });
});
