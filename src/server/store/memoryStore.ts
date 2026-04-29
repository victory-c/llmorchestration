// WARNING: This is a DEV-ONLY in-memory store.
// It is NOT safe for deployed multi-user use. Runs are lost on process restart
// and are not shared across serverless function instances.
// Replaced by a DB-backed implementation in Milestone 3.

import type { RunRepository, StoredRun } from "@/server/store/types";
import type { RunState, TranscriptMessage } from "@/server/engine/types";

declare global {
   
  var __arenaMemoryStore: Map<string, StoredRun> | undefined;
}

function getStore(): Map<string, StoredRun> {
  if (!globalThis.__arenaMemoryStore) {
    globalThis.__arenaMemoryStore = new Map();
  }
  return globalThis.__arenaMemoryStore;
}

export const memoryStore: RunRepository = {
  async createRun(input: StoredRun) {
    getStore().set(input.state.runId, input);
  },

  async getRun(runId: string) {
    return getStore().get(runId) ?? null;
  },

  async updateRunState(runId: string, state: RunState) {
    const existing = getStore().get(runId);
    if (!existing) throw new Error(`Run not found: ${runId}`);
    getStore().set(runId, { ...existing, state });
  },

  async appendMessage(runId: string, message: TranscriptMessage) {
    const existing = getStore().get(runId);
    if (!existing) throw new Error(`Run not found: ${runId}`);
    existing.messages.push(message);
  },

  async appendSnapshot(runId, snapshot) {
    const existing = getStore().get(runId);
    if (!existing) throw new Error(`Run not found: ${runId}`);
    existing.snapshots.push(snapshot);
  },

  async listRunIds() {
    return Array.from(getStore().keys());
  },
};
