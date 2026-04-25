import { nanoid } from "nanoid";
import type {
  ModelGatewayProvider,
  ModelUsage,
} from "@/server/gateways/types";

export type UsageEventType =
  | "model-call"
  | "moderation-block"
  | "cost-cap"
  | "rate-limit"
  | "tts-call";

export type UsageEvent = {
  id: string;
  runId: string;
  participantId?: string;
  provider?: ModelGatewayProvider;
  modelId?: string;
  eventType: UsageEventType;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

// In-memory in M2. Flushed to DB in M3.
declare global {
  // eslint-disable-next-line no-var
  var __arenaUsageEvents: UsageEvent[] | undefined;
}

function store(): UsageEvent[] {
  if (!globalThis.__arenaUsageEvents) globalThis.__arenaUsageEvents = [];
  return globalThis.__arenaUsageEvents;
}

export function logModelCall(input: {
  runId: string;
  participantId?: string;
  provider: ModelGatewayProvider;
  modelId: string;
  usage?: ModelUsage;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}): UsageEvent {
  const event: UsageEvent = {
    id: nanoid(),
    runId: input.runId,
    participantId: input.participantId,
    provider: input.provider,
    modelId: input.modelId,
    eventType: "model-call",
    inputTokens: input.usage?.inputTokens,
    outputTokens: input.usage?.outputTokens,
    estimatedCostUsd: input.usage?.estimatedCostUsd,
    latencyMs: input.latencyMs,
    metadata: input.metadata,
    createdAt: new Date().toISOString(),
  };
  store().push(event);
  return event;
}

export function logTTSCall(input: {
  runId: string;
  provider: "mock" | "elevenlabs" | "google-tts" | "openai-tts";
  estimatedCostUsd: number;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}): UsageEvent {
  const event: UsageEvent = {
    id: nanoid(),
    runId: input.runId,
    modelId: `tts:${input.provider}`,
    eventType: "tts-call",
    estimatedCostUsd: input.estimatedCostUsd,
    latencyMs: input.latencyMs,
    metadata: input.metadata,
    createdAt: new Date().toISOString(),
  };
  store().push(event);
  return event;
}

export function logSafetyEvent(input: {
  runId: string;
  eventType: Exclude<UsageEventType, "model-call" | "tts-call">;
  metadata?: Record<string, unknown>;
}): UsageEvent {
  const event: UsageEvent = {
    id: nanoid(),
    runId: input.runId,
    eventType: input.eventType,
    metadata: input.metadata,
    createdAt: new Date().toISOString(),
  };
  store().push(event);
  return event;
}

export function listUsageEvents(runId?: string): UsageEvent[] {
  const events = store();
  if (!runId) return [...events];
  return events.filter((e) => e.runId === runId);
}

export function sumActualCostUsd(runId: string): number {
  return listUsageEvents(runId)
    .filter((e) => e.eventType === "model-call")
    .reduce((acc, e) => acc + (e.estimatedCostUsd ?? 0), 0);
}

export function resetUsageEventsForTests() {
  globalThis.__arenaUsageEvents = [];
}
