import type { ModelGateway, ModelGatewayProvider } from "@/server/gateways/types";
import { mockGateway } from "@/server/gateways/mockGateway";
import { openRouterGateway } from "@/server/gateways/openRouterGateway";
import { vercelGateway } from "@/server/gateways/vercelGateway";
import { GatewayConfigError } from "@/server/gateways/errors";

export function getGateway(provider: ModelGatewayProvider): ModelGateway {
  switch (provider) {
    case "mock":
      return mockGateway;
    case "openrouter":
      return openRouterGateway;
    case "vercel-ai-gateway":
      return vercelGateway;
    case "litellm":
    case "direct-openai":
    case "direct-anthropic":
    case "direct-google":
      throw new GatewayConfigError(
        `Gateway provider "${provider}" is not yet implemented. Set MODEL_GATEWAY_PROVIDER=mock, openrouter, or vercel-ai-gateway.`,
      );
    default: {
      const _exhaustive: never = provider;
      throw new GatewayConfigError(`Unknown gateway provider: ${_exhaustive}`);
    }
  }
}
