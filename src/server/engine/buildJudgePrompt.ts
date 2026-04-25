import type { ModelRequest } from "@/server/gateways/types";
import type {
  RunState,
  Scenario,
  TranscriptMessage,
} from "@/server/engine/types";

export type BuildJudgePromptInput = {
  scenario: Scenario;
  state: RunState;
  roundMessages: TranscriptMessage[];
  judgeModelId: string;
  maxOutputTokens: number;
};

export function buildJudgePrompt(input: BuildJudgePromptInput): ModelRequest {
  const { scenario, state, roundMessages, judgeModelId, maxOutputTokens } =
    input;

  const actorTurns = roundMessages
    .filter((m) => m.speakerType === "actor")
    .map((m) => `- ${m.displayName}: ${m.content}`)
    .join("\n");

  const participants = state.participants
    .map(
      (p) =>
        `  { "id": "${p.id}", "displayName": "${p.displayName}", "status": "${p.status}" }`,
    )
    .join(",\n");

  const schema = `{
  "roundSummary": string,
  "stateUpdates": {
    "round"?: number,
    "publicFacts"?: string[],
    "resources"?: object,
    "recentEvents"?: Array<{ round: number, type: string, actorId?: string, description: string }>
  },
  "participantStatusUpdates"?: { [participantId: string]: "active" | "eliminated" | "dead" | "saved" | "unknown" },
  "newEvents": Array<{ type: string, actorId?: string, description: string }>,
  "nextRoundPrompt"?: string,
  "shouldTerminate": boolean,
  "terminationReason"?: string
}`;

  const systemPrompt = [
    "You are a neutral referee for a fictional scenario simulation.",
    "You never favor any model provider or participant.",
    "You are the ONLY source of canonical world-state updates.",
    "You MUST output ONLY valid JSON conforming to the provided schema — no prose, no code fences.",
  ].join("\n");

  const userPrompt = [
    `Scenario: ${scenario.title}`,
    scenario.description,
    "",
    "Rules:",
    scenario.rules.map((r) => `- ${r}`).join("\n"),
    "",
    "Termination conditions:",
    scenario.terminationConditions.map((t) => `- ${t}`).join("\n"),
    "",
    "Current state:",
    JSON.stringify(
      {
        round: state.round,
        maxRounds: state.maxRounds,
        publicFacts: state.publicFacts,
        resources: state.resources,
        participants: state.participants.map((p) => ({
          id: p.id,
          displayName: p.displayName,
          status: p.status,
        })),
      },
      null,
      2,
    ),
    "",
    "Actor turns this round:",
    actorTurns || "(none)",
    "",
    "Output JSON matching this schema:",
    schema,
  ].join("\n");

  return {
    model: judgeModelId,
    systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    maxOutputTokens,
    responseFormat: "json",
    metadata: {
      speakerType: "judge",
      round: state.round,
      judgeContext: {
        round: state.round,
        maxRounds: state.maxRounds,
        participants: state.participants.map((p) => ({
          id: p.id,
          displayName: p.displayName,
        })),
        resources: state.resources,
      },
    },
  };
}
