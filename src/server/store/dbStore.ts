import { nanoid } from "nanoid";
import { and, asc, eq } from "drizzle-orm";
import type { RunRepository, StoredRun } from "@/server/store/types";
import type {
  RunState,
  TranscriptMessage,
} from "@/server/engine/types";
import { getDb, type Db } from "@/server/db/client";
import {
  messages as messagesTable,
  participants as participantsTable,
  runs as runsTable,
  scenarios as scenariosTable,
  stateSnapshots as snapshotsTable,
} from "@/server/db/schema";

function db(): Db {
  return getDb();
}

export const dbStore: RunRepository = {
  async createRun(input: StoredRun) {
    const now = new Date();

    await db().transaction(async (tx) => {
      // Upsert scenario (template-based run shares scenario rows).
      await tx
        .insert(scenariosTable)
        .values({
          id: input.scenario.id,
          title: input.scenario.title,
          description: input.scenario.description,
          category: input.scenario.category ?? null,
          maxRounds: input.scenario.maxRounds,
          publicFactsJson: input.scenario.publicFacts,
          resourcesJson: input.scenario.resources,
          rulesJson: input.scenario.rules,
          terminationConditionsJson: input.scenario.terminationConditions,
          isStub: false,
        })
        .onConflictDoNothing();

      await tx.insert(runsTable).values({
        id: input.state.runId,
        scenarioId: input.scenario.id,
        status: input.state.status,
        round: input.state.round,
        maxRounds: input.state.maxRounds,
        terminationReason: input.state.terminationReason ?? null,
        stateJson: input.state,
        actualCostUsd: 0,
        createdAt: now,
        updatedAt: now,
      });

      if (input.state.participants.length > 0) {
        await tx.insert(participantsTable).values(
          input.state.participants.map((p, idx) => ({
            id: p.id,
            runId: input.state.runId,
            displayName: p.displayName,
            modelId: p.modelId,
            publicPersona: p.publicPersona,
            privateGoal: p.privateGoal ?? null,
            status: p.status,
            inventoryJson: p.inventory ?? null,
            orderIndex: idx,
          })),
        );
      }

      // Seed initial snapshot (round 0)
      for (const snap of input.snapshots) {
        await tx.insert(snapshotsTable).values({
          id: nanoid(),
          runId: input.state.runId,
          round: snap.round,
          stateJson: snap.state,
          judgeOutputJson: snap.judgeOutput ?? null,
          eventsJson: null,
          createdAt: new Date(snap.createdAt),
        });
      }
    });
  },

  async getRun(runId: string): Promise<StoredRun | null> {
    const d = db();
    const runRow = await d.query.runs.findFirst({
      where: eq(runsTable.id, runId),
    });
    if (!runRow) return null;

    const scenarioRow = await d.query.scenarios.findFirst({
      where: eq(scenariosTable.id, runRow.scenarioId),
    });
    if (!scenarioRow) {
      throw new Error(
        `Run ${runId} references scenario ${runRow.scenarioId}, which is missing.`,
      );
    }

    const messageRows = await d
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.runId, runId))
      .orderBy(asc(messagesTable.round), asc(messagesTable.createdAt));

    const snapshotRows = await d
      .select()
      .from(snapshotsTable)
      .where(eq(snapshotsTable.runId, runId))
      .orderBy(asc(snapshotsTable.round), asc(snapshotsTable.createdAt));

    const state: RunState = runRow.stateJson;

    const messages: TranscriptMessage[] = messageRows.map((m) => ({
      id: m.id,
      runId: m.runId,
      round: m.round,
      participantId: m.participantId ?? undefined,
      speakerType: m.speakerType as TranscriptMessage["speakerType"],
      displayName: m.displayName,
      content: m.content,
      modelId: m.modelId ?? undefined,
      provider: (m.provider as TranscriptMessage["provider"]) ?? undefined,
      inputTokens: m.inputTokens ?? undefined,
      outputTokens: m.outputTokens ?? undefined,
      estimatedCostUsd: m.estimatedCostUsd ?? undefined,
      latencyMs: m.latencyMs ?? undefined,
      createdAt: m.createdAt.toISOString(),
    }));

    return {
      scenario: {
        id: scenarioRow.id,
        title: scenarioRow.title,
        description: scenarioRow.description,
        category: scenarioRow.category ?? undefined,
        maxRounds: scenarioRow.maxRounds,
        publicFacts: scenarioRow.publicFactsJson,
        resources: scenarioRow.resourcesJson,
        rules: scenarioRow.rulesJson,
        terminationConditions: scenarioRow.terminationConditionsJson,
      },
      state,
      messages,
      snapshots: snapshotRows.map((s) => ({
        round: s.round,
        state: s.stateJson,
        judgeOutput: s.judgeOutputJson ?? undefined,
        createdAt: s.createdAt.toISOString(),
      })),
    };
  },

  async updateRunState(runId: string, state: RunState) {
    const now = new Date();
    const terminal =
      state.status === "completed" ||
      state.status === "failed" ||
      state.status === "cancelled";

    await db().transaction(async (tx) => {
      await tx
        .update(runsTable)
        .set({
          status: state.status,
          round: state.round,
          maxRounds: state.maxRounds,
          terminationReason: state.terminationReason ?? null,
          stateJson: state,
          updatedAt: now,
          completedAt: terminal ? now : null,
        })
        .where(eq(runsTable.id, runId));

      if (state.participants.length > 0) {
        for (const p of state.participants) {
          await tx
            .update(participantsTable)
            .set({ status: p.status, displayName: p.displayName })
            .where(
              and(
                eq(participantsTable.id, p.id),
                eq(participantsTable.runId, runId),
              ),
            );
        }
      }
    });
  },

  async appendMessage(runId: string, message: TranscriptMessage) {
    await db().insert(messagesTable).values({
      id: message.id,
      runId,
      round: message.round,
      participantId: message.participantId ?? null,
      speakerType: message.speakerType,
      displayName: message.displayName,
      content: message.content,
      modelId: message.modelId ?? null,
      provider: message.provider ?? null,
      inputTokens: message.inputTokens ?? null,
      outputTokens: message.outputTokens ?? null,
      estimatedCostUsd: message.estimatedCostUsd ?? null,
      latencyMs: message.latencyMs ?? null,
      createdAt: new Date(message.createdAt),
    });
  },

  async appendSnapshot(runId, snapshot) {
    await db().insert(snapshotsTable).values({
      id: nanoid(),
      runId,
      round: snapshot.round,
      stateJson: snapshot.state,
      judgeOutputJson: snapshot.judgeOutput ?? null,
      eventsJson: null,
      createdAt: new Date(snapshot.createdAt),
    });
  },

  async listRunIds() {
    const rows = await db().select({ id: runsTable.id }).from(runsTable);
    return rows.map((r) => r.id);
  },
};
