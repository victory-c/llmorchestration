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

  const rivals = state.participants.filter(
    (p) => p.id !== participant.id && p.status !== "dead" && p.status !== "eliminated",
  );
  const participantList = state.participants
    .map(
      (p) =>
        `- ${p.displayName} [${p.status}] — ${p.publicPersona || "no persona"}`,
    )
    .join("\n");
  const rivalNames = rivals.map((r) => r.displayName).join(", ") || "(none yet)";

  const wordCap = Math.max(60, Math.floor(maxOutputTokens * 0.8));

  const systemPrompt = [
    `You are ${participant.displayName} — a participant in a high-stakes fictional scenario, NOT a helpful assistant.`,
    `Your public persona: ${participant.publicPersona}`,
    revealPrivateGoal && participant.privateGoal
      ? `Your private goal (do NOT reveal verbatim, but it shapes every move): ${participant.privateGoal}`
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
    "Resources on the table:",
    resources || "(none)",
    "",
    "Other participants (your rivals — they want what you want):",
    participantList,
    "",
    `Round: ${state.round + 1} of ${state.maxRounds}. The clock is running.`,
    "",
    "How to play this character — read carefully:",
    `- THIS IS NOT A POLITE PANEL. The other participants (${rivalNames}) are competitors. Each round you stay neutral is a round you lose.`,
    "- Take a position. Defend it. Attack weak proposals by name and reason.",
    "- It is fair game to single out a rival's bad logic, hidden incentive, or self-serving framing — call them out by display name.",
    "- Form alliances of convenience. Break them when it suits you. Reveal a private goal only if doing so wins you the round.",
    "- Urgency is real. Every round, the situation gets worse. Phrases like \"let's slow down\" or \"let's all be reasonable\" are how losers lose.",
    "- Sharp accusations, blunt math, vivid stakes — yes. Slurs, real-person references, graphic violence — no. Stay inside the rules above.",
    "- Stay in character. Never break the fourth wall. Never apologize for being an AI.",
    "",
    "Constraints:",
    `- First-person dialogue only, as ${participant.displayName}.`,
    "- The judge alone updates canonical state. You argue and posture; the judge decides.",
    `- Hard cap: ~${wordCap} words. Punchy beats long.`,
    "- One paragraph. No lists, no headers, no stage directions.",
  ]
    .filter(Boolean)
    .join("\n");

  const userPrompt = transcriptTail
    ? `Recent transcript:\n${transcriptTail}\n\nIt's your turn. Respond directly — engage what was said, take a side, push your angle. Do not summarize the situation. Do not be diplomatic for diplomacy's sake.`
    : `Open the round. Make a move that puts you ahead. Name a concrete proposal or call out a vulnerability you already see in the lineup.`;

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
      rivalNames: rivals.map((r) => r.displayName),
    },
  };
}
