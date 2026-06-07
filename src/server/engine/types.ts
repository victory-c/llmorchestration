import type { ModelGatewayProvider } from "@/server/gateways/types";

export type ParticipantStatus =
  | "active"
  | "eliminated"
  | "dead"
  | "saved"
  | "unknown";

export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type RunParticipant = {
  id: string;
  displayName: string;
  modelId: string;
  status: ParticipantStatus;
  publicPersona: string;
  privateGoal?: string;
  inventory?: string[];
};

export type RunEvent = {
  round: number;
  type: string;
  actorId?: string;
  description: string;
};

export type RunState = {
  scenarioId: string;
  runId: string;
  round: number;
  maxRounds: number;
  status: RunStatus;
  publicFacts: string[];
  resources: Record<string, number | string | boolean>;
  participants: RunParticipant[];
  recentEvents: RunEvent[];
  terminationReason?: string;
};

export type SpeakerType = "actor" | "judge" | "system";

export type TranscriptMessage = {
  id: string;
  runId: string;
  round: number;
  participantId?: string;
  speakerType: SpeakerType;
  displayName: string;
  content: string;
  modelId?: string;
  provider?: ModelGatewayProvider;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  latencyMs?: number;
  createdAt: string;
};

export type JudgeOutput = {
  roundSummary: string;
  stateUpdates: Partial<RunState>;
  participantStatusUpdates?: Record<string, ParticipantStatus>;
  newEvents: Array<{
    type: string;
    actorId?: string;
    description: string;
  }>;
  nextRoundPrompt?: string;
  shouldTerminate: boolean;
  terminationReason?: string;
};

export type Scenario = {
  id: string;
  title: string;
  description: string;
  category?: string;
  maxRounds: number;
  publicFacts: string[];
  resources: Record<string, number | string | boolean>;
  rules: string[];
  terminationConditions: string[];
};
