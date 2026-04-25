import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dbStore } from "@/server/store/dbStore";
import { createRunFromTemplate } from "@/server/engine/createRun";
import { findTemplate } from "@/server/scenarios/templates";
import { defaultMockParticipants } from "@/server/scenarios/mockParticipants";
import {
  setupPglite,
  teardownPglite,
  resetPgliteSchema,
} from "@/server/db/pglite";

describe("dbStore (pglite)", () => {
  beforeAll(async () => {
    await setupPglite();
  });

  afterAll(async () => {
    await teardownPglite();
  });

  beforeEach(async () => {
    await resetPgliteSchema();
  });

  const planeCrash = findTemplate("plane-crash")!;

  it("creates a run and reads it back with scenario + participants + snapshot", async () => {
    const stored = await createRunFromTemplate(
      {
        template: planeCrash,
        participants: defaultMockParticipants.slice(0, 3),
      },
      dbStore,
    );

    const roundtrip = await dbStore.getRun(stored.state.runId);
    expect(roundtrip).not.toBeNull();
    expect(roundtrip!.scenario.title).toBe(planeCrash.title);
    expect(roundtrip!.state.participants).toHaveLength(3);
    expect(roundtrip!.state.runId).toBe(stored.state.runId);
    expect(roundtrip!.snapshots).toHaveLength(1);
    expect(roundtrip!.snapshots[0]!.round).toBe(0);
  });

  it("appends messages and reads them ordered by round", async () => {
    const stored = await createRunFromTemplate(
      {
        template: planeCrash,
        participants: defaultMockParticipants.slice(0, 2),
      },
      dbStore,
    );
    const p0 = stored.state.participants[0]!;

    await dbStore.appendMessage(stored.state.runId, {
      id: "msg-2",
      runId: stored.state.runId,
      round: 2,
      participantId: p0.id,
      speakerType: "actor",
      displayName: p0.displayName,
      content: "Round 2 msg",
      createdAt: new Date(Date.now() + 2000).toISOString(),
    });
    await dbStore.appendMessage(stored.state.runId, {
      id: "msg-1",
      runId: stored.state.runId,
      round: 1,
      participantId: p0.id,
      speakerType: "actor",
      displayName: p0.displayName,
      content: "Round 1 msg",
      createdAt: new Date(Date.now() + 1000).toISOString(),
    });

    const loaded = await dbStore.getRun(stored.state.runId);
    expect(loaded!.messages.map((m) => m.id)).toEqual(["msg-1", "msg-2"]);
  });

  it("updateRunState persists status and participant status", async () => {
    const stored = await createRunFromTemplate(
      {
        template: planeCrash,
        participants: defaultMockParticipants.slice(0, 2),
      },
      dbStore,
    );

    const updated = {
      ...stored.state,
      status: "running" as const,
      round: 1,
      participants: stored.state.participants.map((p, i) => ({
        ...p,
        status: i === 0 ? ("eliminated" as const) : p.status,
      })),
    };
    await dbStore.updateRunState(stored.state.runId, updated);

    const loaded = await dbStore.getRun(stored.state.runId);
    expect(loaded!.state.status).toBe("running");
    expect(loaded!.state.round).toBe(1);
    expect(loaded!.state.participants[0]!.status).toBe("eliminated");
  });

  it("appendSnapshot persists snapshots in round order", async () => {
    const stored = await createRunFromTemplate(
      {
        template: planeCrash,
        participants: defaultMockParticipants.slice(0, 2),
      },
      dbStore,
    );

    await dbStore.appendSnapshot(stored.state.runId, {
      round: 1,
      state: { ...stored.state, round: 1 },
      createdAt: new Date().toISOString(),
    });

    const loaded = await dbStore.getRun(stored.state.runId);
    expect(loaded!.snapshots.map((s) => s.round)).toEqual([0, 1]);
  });

  it("listRunIds returns all run ids", async () => {
    await createRunFromTemplate(
      {
        template: planeCrash,
        participants: defaultMockParticipants.slice(0, 2),
      },
      dbStore,
    );
    await createRunFromTemplate(
      {
        template: planeCrash,
        participants: defaultMockParticipants.slice(0, 2),
      },
      dbStore,
    );
    const ids = await dbStore.listRunIds();
    expect(ids).toHaveLength(2);
  });
});
