export class GatewayError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "GatewayError";
  }
}

export class ModelUnavailableError extends GatewayError {
  constructor(public readonly modelId: string, cause?: unknown) {
    super(`Model unavailable: ${modelId}`, cause);
    this.name = "ModelUnavailableError";
  }
}

export class ModelJsonFormatError extends GatewayError {
  constructor(public readonly modelId: string, public readonly raw?: string) {
    super(`Model returned invalid JSON: ${modelId}`);
    this.name = "ModelJsonFormatError";
  }
}

export class GatewayRateLimitError extends GatewayError {
  constructor(public readonly retryAfterMs?: number, cause?: unknown) {
    super(
      `Gateway rate limit hit${
        retryAfterMs ? ` (retry in ${retryAfterMs}ms)` : ""
      }`,
      cause,
    );
    this.name = "GatewayRateLimitError";
  }
}

export class GatewayConfigError extends GatewayError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "GatewayConfigError";
  }
}
