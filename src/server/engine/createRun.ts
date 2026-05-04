import { nanoid } from "nanoid";
import type { RunRepository, StoredRun } from "@/server/store/types";
import type {
  RunParticipant,
  RunState,
  Scenario,
} from "@/server/engine/types";
import type { ScenarioTemplate } from "@/server/scenarios/templates";
import type { MockParticipant } from "@/server/scenarios/mockParticipants";

export type CreateRunInput = {
  template: ScenarioTemplate;
  participants: MockParticipant[];
  maxRounds?: number;
  modelIdForParticipant?: (p: MockParticipant) => string;
};

export async function createRunFromTemplate(
  input: CreateRunInput,
  store: RunRepository,
): Promise<StoredRun> {
  const runId = nanoid(12);
  const scenarioId = nanoid(8);

  // Sanitize string inputs
  const title = input.template.title.trim();
  const description = input.template.description.trim();
  if (!title) throw new Error("Scenario title cannot be empty");
  if (!description) throw new Error("Scenario description cannot be empty");

  const scenario: Scenario = {
    id: scenarioId,
    title,
    description,
    category: input.template.category,
    maxRounds: input.maxRounds ?? input.template.maxRounds,
    publicFacts: input.template.publicFacts.map((f) => f.trim()).filter(Boolean),
    resources: input.template.resources,
    rules: input.template.rules.map((r) => r.trim()).filter(Boolean),
    terminationConditions: input.template.terminationConditions
      .map((t) => t.trim())
      .filter(Boolean),
  };

  const resolveModelId =
    input.modelIdForParticipant ?? ((p: MockParticipant) => p.defaultModelId);

  const participants: RunParticipant[] = input.participants.map((p) => ({
    id: nanoid(8),
    displayName: p.displayName,
    modelId: resolveModelId(p),
    status: "active",
    publicPersona: p.persona,
    privateGoal: p.privateGoal,
  }));

  const state: RunState = {
    scenarioId,
    runId,
    round: 0,
    maxRounds: scenario.maxRounds,
    status: "queued",
    publicFacts: [...scenario.publicFacts],
    resources: { ...scenario.resources },
    participants,
    recentEvents: [],
  };

  const stored: StoredRun = {
    scenario,
    state,
    messages: [],
    snapshots: [
      {
        round: 0,
        state,
        createdAt: new Date().toISOString(),
      },
    ],
  };

  await store.createRun(stored);
  return stored;
}
