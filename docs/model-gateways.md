# Model gateways

The arena treats every LLM as if it were the same shape. That contract
lives in [`src/server/gateways/types.ts`](../src/server/gateways/types.ts):

```ts
export type ModelGatewayProvider =
  | "mock"
  | "vercel-ai-gateway"
  | "openrouter"
  | "litellm"
  | "direct-openai"
  | "direct-anthropic"
  | "direct-google";

export type ModelRequest = {
  model: string;
  systemPrompt?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxOutputTokens?: number;
  responseFormat?: "text" | "json";
  metadata?: Record<string, unknown>;
};

export type ModelResponse = {
  provider: ModelGatewayProvider;
  model: string;
  content: string;
  finishReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
  };
  latencyMs?: number;
  raw?: unknown;
};

export interface ModelGateway {
  generate(request: ModelRequest): Promise<ModelResponse>;
}
```

The engine never imports a provider SDK. It calls
`getGateway(env.MODEL_GATEWAY_PROVIDER)` and then `gateway.generate(req)`.
Adapters live entirely under `src/server/gateways/*` and translate from the
arena's request shape into whatever the underlying SDK wants.

## Shipped adapters

### `mock`

Deterministic seeded dialogue keyed on `(participantId, round, persona)`.
Used in `pnpm dev` with no keys, in CI, and as the always-available
fallback. Returns plausible token counts so the cost meter has data to
display even without paid calls.

### `openrouter`

Wraps the OpenAI SDK pointed at `https://openrouter.ai/api/v1`. Required
custom headers per OpenRouter docs:

```ts
{
  "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL,
  "X-OpenRouter-Title": "LLM Scenario Arena",
}
```

Model IDs come from the registry — e.g. `openai/gpt-4o-mini`,
`anthropic/claude-3.5-haiku`, `google/gemini-2.0-flash`,
`deepseek/deepseek-chat`.

When OpenRouter responses don't include usage (rare), the adapter falls
back to `estimateCost` rather than throwing.

### `vercel-ai-gateway`

Uses `@ai-sdk/gateway`'s `createGatewayProvider` together with the `ai`
SDK's `generateText`. Slug format matches the gateway's catalog
(`openai/gpt-4o-mini`, `anthropic/claude-haiku-4-5`). On Vercel deploys
OIDC is auto-wired so the API key is optional.

The `ai` SDK throws typed errors (`GatewayRateLimitError` etc.) — the
adapter maps them into the arena's `GatewayRateLimitError` /
`ModelUnavailableError` so call sites see one consistent error shape.

## Errors

```ts
class GatewayConfigError      extends Error {}  // env / setup problem
class ModelUnavailableError   extends Error {}  // provider 5xx / network
class ModelJsonFormatError    extends Error {}  // judge JSON unparseable
class GatewayRateLimitError   extends Error {}  // 429 / quota exhausted
```

The engine handles `ModelJsonFormatError` (one repair retry, then
synthesizes a passthrough). The other three bubble to the API route, get
logged, and turn the run `failed` with `terminationReason` reflecting the
cause.

## Registry

[`src/server/models/registry.ts`](../src/server/models/registry.ts) is the
single source of truth for:

- logical model id (used everywhere in the app)
- provider + provider-specific slug
- `enabled` flag (UI hides disabled entries)
- `supportsJson`, `supportsTools`, `supportsVision`, `supportsStreaming`
- `recommendedRole` (`actor` / `judge` / `summarizer` / `cheap-actor`)
- `inputCostPerMillionTokens` / `outputCostPerMillionTokens`
- `contextWindow`

UI components read `registry.filter(m => m.enabled)`. Disabled entries
remain in the registry so cost calculations and migrations still work even
if the UI option goes away.

## Adding a new gateway

1. **Type.** Add the slug to `ModelGatewayProvider` in
   [`src/server/gateways/types.ts`](../src/server/gateways/types.ts) and to
   the `MODEL_GATEWAY_PROVIDER` env enum in
   [`src/lib/env.ts`](../src/lib/env.ts).
2. **Adapter.** Implement `ModelGateway` in
   `src/server/gateways/<slug>Gateway.ts`. Throw the typed errors above
   instead of letting raw SDK errors leak.
3. **Factory.** Wire into `getGateway` in
   [`src/server/gateways/index.ts`](../src/server/gateways/index.ts).
4. **Registry.** Add at least one `ModelCapability` for the new provider
   with cost numbers + `enabled: true`.
5. **Tests.** Add an adapter test that mocks the underlying SDK; assert
   typed-error mapping and that usage falls back to `estimateCost` when
   missing.

## Why not call providers directly?

Direct provider integrations couple the engine to specific SDKs and force
us to track provider-specific quirks (header formats, response shapes,
streaming semantics) inside the engine. The gateway abstraction lets us:

- swap providers per-deployment with a single env var,
- run mocked end-to-end in CI without touching the network,
- aggregate cost / token usage in one place regardless of provider,
- centralize the "before any paid call" checks (kill switch, moderation,
  cost caps) at one chokepoint.

Direct adapters (`direct-openai`, `direct-anthropic`, `direct-google`) are
declared in the type system as future work — adding them is just steps 1-5
above.
