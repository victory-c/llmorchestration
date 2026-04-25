import type { ModelRequest } from "@/server/gateways/types";
import type {
  RunParticipant,
  RunState,
  TranscriptMessage,
} from "@/server/engine/types";
import type { Scenario } from "@/server/engine/types";
import { DEFAULT_RECENT_TRANSCRIPT_WINDOW } from "@/lib/constants";

export type BuildActorPromptInput = {
  scenario: Scenario;
  state: RunState;
  participant: RunParticipant;
  recentMessages: TranscriptMessage[];
  maxOutputTokens: number;
  revealPrivateGoal?: boolean;
};

export function buildActorPrompt(input: BuildActorPromptInput): ModelRequest {
  const {
    scenario,
    state,
    participant,
    recentMessages,
    maxOutputTokens,
    revealPrivateGoal = true,
  } = input;

  const transcriptTail = recentMessages
    .slice(-DEFAULT_RECENT_TRANSCRIPT_WINDOW)
    .map(
      (m) =>
        `[Round ${m.round}] ${m.displayName} (${m.speakerType}): ${m.content}`,
    )
    .join("\n");

  const publicFacts = state.publicFacts.map((f) => `- ${f}`).join("\n");
  const resources = Object.entries(state.resources)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  const participantList = state.participants
    .map(
      (p) =>
        `- ${p.displayName} [${p.status}] — ${p.publicPersona || "no persona"}`,
    )
    .join("\n");

  const systemPrompt = [
    `You are ${participant.displayName}, a participant in a fictional scenario.`,
    `Your public persona: ${participant.publicPersona}`,
    revealPrivateGoal && participant.privateGoal
      ? `Your private goal (do not reveal verbatim): ${participant.privateGoal}`
      : "",
    "",
    `Scenario: ${scenario.title}`,
    scenario.description,
    "",
    "Rules:",
    scenario.rules.map((r) => `- ${r}`).join("\n"),
    "",
    "Current public state:",
    publicFacts || "(none)",
    "",
    "Resources:",
    resources || "(none)",
    "",
    "Participants:",
    participantList,
    "",
    `Round: ${state.round + 1} of ${state.maxRounds}`,
    "",
    "Constraints:",
    `- Respond in first person as ${participant.displayName}, in dialogue style.`,
    "- You do NOT decide the canonical world state. A neutral judge will update state.",
    `- Keep it under ~${Math.max(60, Math.floor(maxOutputTokens * 0.8))} words.`,
    "- Stay in character. Avoid meta-commentary about being an AI.",
  ]
    .filter(Boolean)
    .join("\n");

  const userPrompt = transcriptTail
    ? `Recent transcript:\n${transcriptTail}\n\nWhat do you say next?`
    : "Open the discussion with your opening statement.";

  return {
    model: participant.modelId,
    systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    maxOutputTokens,
    responseFormat: "text",
    metadata: {
      participantId: participant.id,
      round: state.round,
      speakerType: "actor",
      persona: participant.publicPersona,
    },
  };
}
