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

  const scenario: Scenario = {
    id: scenarioId,
    title: input.template.title,
    description: input.template.description,
    category: input.template.category,
    maxRounds: input.maxRounds ?? input.template.maxRounds,
    publicFacts: input.template.publicFacts,
    resources: input.template.resources,
    rules: input.template.rules,
    terminationConditions: input.template.terminationConditions,
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
