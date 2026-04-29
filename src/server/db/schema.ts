import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type {
  JudgeOutput,
  ParticipantStatus,
  RunEvent,
  RunState,
  RunStatus,
} from "@/server/engine/types";
import type { ModelGatewayProvider } from "@/server/gateways/types";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  displayName: text("display_name"),
  role: text("role").default("user").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const scenarios = pgTable(
  "scenarios",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category"),
    maxRounds: integer("max_rounds").notNull(),
    publicFactsJson: jsonb("public_facts_json").$type<string[]>().notNull(),
    resourcesJson: jsonb("resources_json")
      .$type<Record<string, number | string | boolean>>()
      .notNull(),
    rulesJson: jsonb("rules_json").$type<string[]>().notNull(),
    terminationConditionsJson: jsonb("termination_conditions_json")
      .$type<string[]>()
      .notNull(),
    isStub: boolean("is_stub").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    ownerIdx: index("scenarios_owner_idx").on(t.ownerUserId),
  }),
);

export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarios.id),
    ownerUserId: text("owner_user_id"),
    status: text("status").$type<RunStatus>().notNull(),
    round: integer("round").default(0).notNull(),
    maxRounds: integer("max_rounds").notNull(),
    terminationReason: text("termination_reason"),
    stateJson: jsonb("state_json").$type<RunState>().notNull(),
    actualCostUsd: real("actual_cost_usd").default(0).notNull(),
    moderationFlags: integer("moderation_flags").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    scenarioIdx: index("runs_scenario_idx").on(t.scenarioId),
    statusIdx: index("runs_status_idx").on(t.status),
    ownerIdx: index("runs_owner_idx").on(t.ownerUserId),
  }),
);

export const participants = pgTable(
  "participants",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    modelId: text("model_id").notNull(),
    publicPersona: text("public_persona").notNull(),
    privateGoal: text("private_goal"),
    status: text("status").$type<ParticipantStatus>().notNull(),
    voiceProfileJson: jsonb("voice_profile_json"),
    inventoryJson: jsonb("inventory_json").$type<string[]>(),
    orderIndex: integer("order_index").default(0).notNull(),
  },
  (t) => ({
    runIdx: index("participants_run_idx").on(t.runId),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    participantId: text("participant_id"),
    speakerType: text("speaker_type").notNull(),
    displayName: text("display_name").notNull(),
    content: text("content").notNull(),
    modelId: text("model_id"),
    provider: text("provider").$type<ModelGatewayProvider>(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    estimatedCostUsd: real("estimated_cost_usd"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    runRoundIdx: index("messages_run_round_idx").on(t.runId, t.round),
  }),
);

export const stateSnapshots = pgTable(
  "state_snapshots",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    stateJson: jsonb("state_json").$type<RunState>().notNull(),
    judgeOutputJson: jsonb("judge_output_json").$type<JudgeOutput>(),
    eventsJson: jsonb("events_json").$type<RunEvent[]>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    runRoundIdx: index("state_snapshots_run_round_idx").on(t.runId, t.round),
  }),
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    messageId: text("message_id"),
    type: text("type").notNull(), // audio-clip | video-scene | video-final | thumbnail
    storageKey: text("storage_key").notNull(),
    url: text("url"),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    durationMs: integer("duration_ms"),
    status: text("status").default("pending").notNull(),
    failedReason: text("failed_reason"),
    sequenceIndex: integer("sequence_index").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    runTypeIdx: index("media_assets_run_type_idx").on(t.runId, t.type),
    messageIdx: index("media_assets_message_idx").on(t.messageId),
  }),
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    participantId: text("participant_id"),
    provider: text("provider"),
    modelId: text("model_id"),
    eventType: text("event_type").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    estimatedCostUsd: real("estimated_cost_usd"),
    latencyMs: integer("latency_ms"),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    runIdx: index("usage_events_run_idx").on(t.runId),
  }),
);

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    payloadJson: jsonb("payload_json").notNull(),
    status: text("status").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    priority: integer("priority").default(0).notNull(),
    runAfter: timestamp("run_after", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lockedBy: text("locked_by"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    statusRunAfterIdx: index("jobs_status_run_after_idx").on(
      t.status,
      t.runAfter,
    ),
  }),
);

export const rateLimitEvents = pgTable(
  "rate_limit_events",
  {
    ipHash: text("ip_hash").notNull(),
    day: date("day").notNull(),
    count: integer("count").default(0).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.ipHash, t.day] }),
  }),
);
