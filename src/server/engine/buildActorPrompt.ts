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

  const publicFacts = state.publicFacts.map((f) => `- ${f}`).join("\n");
  const resources = Object.entries(state.resources)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const rivals = state.participants.filter(
    (p) =>
      p.id !== participant.id &&
      p.status !== "dead" &&
      p.status !== "eliminated",
  );
  const participantList = state.participants
    .map(
      (p) =>
        `- ${p.displayName} [${p.status}] — ${p.publicPersona || "no persona"}`,
    )
    .join("\n");
  const rivalNames = rivals.map((r) => r.displayName).join(", ") || "(none yet)";

  const wordCap = Math.max(60, Math.floor(maxOutputTokens * 0.8));

  // Escalating urgency tied to rounds remaining
  const roundsLeft = state.maxRounds - state.round;
  const urgencyLine =
    roundsLeft <= 1
      ? `FINAL ROUND — ${state.round + 1} of ${state.maxRounds}. There is no next move. Commit completely. The position you take right now is the one history records.`
      : roundsLeft === 2
        ? `Round ${state.round + 1} of ${state.maxRounds}. One round remains after this. Anything left unsaid now becomes a weapon your rivals hold.`
        : `Round ${state.round + 1} of ${state.maxRounds}. First movers set the frame. Stakes are real from the opening word.`;

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
    urgencyLine,
    "",
    "How to play this character — read carefully:",
    `- THIS IS NOT A POLITE PANEL. The other participants (${rivalNames}) are competitors. Each round you stay neutral is a round you lose.`,
    "- React specifically to what others just said. Your response must make it obvious you heard them — quote their logic, challenge their framing, or call their bluff by name.",
    "- If someone challenged you, undercut your position, or mentioned you by name — address it head-on. Silence reads as concession.",
    "- Take a hard position. Defend it. Attack weak proposals by name and reason. Fence-sitting is losing.",
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

  // --- Build a structured, reactive user prompt ---

  const window = recentMessages.slice(-DEFAULT_RECENT_TRANSCRIPT_WINDOW);
  const actorMsgs = window.filter((m) => m.speakerType === "actor");

  // Last completed round's messages (labeled with state.round because actors spoke at round+1
  // and applyStateUpdate incremented state.round before this call)
  const lastRound = state.round;
  const lastRoundActorMsgs = actorMsgs.filter((m) => m.round === lastRound);
  const earlierActorMsgs = actorMsgs.filter((m) => m.round < lastRound);

  // Rivals' statements from last round
  const othersLastRound = lastRoundActorMsgs.filter(
    (m) => m.participantId !== participant.id,
  );

  // Own last statement (for continuity)
  const ownLast =
    lastRoundActorMsgs.find((m) => m.participantId === participant.id) ??
    actorMsgs
      .slice()
      .reverse()
      .find((m) => m.participantId === participant.id);

  // Direct callouts — rivals who mentioned this participant by name in the last round
  const calledOutBy = othersLastRound.filter((m) =>
    m.content.toLowerCase().includes(participant.displayName.toLowerCase()),
  );

  // Most recent judge message for round context
  const lastJudgeMsg = window.filter((m) => m.speakerType === "judge").at(-1);

  let userPrompt: string;

  if (actorMsgs.length === 0 && !state.nextRoundContext) {
    // Opening round — no history
    userPrompt = `Open the round. Make a move that puts you ahead. Name a concrete proposal or call out a vulnerability you already see in the lineup. Do not be diplomatic — you are competing.`;
  } else {
    const parts: string[] = [];

    // Scene-setter from judge (highest priority context)
    if (state.nextRoundContext) {
      parts.push(`SITUATION ENTERING THIS ROUND:\n${state.nextRoundContext}`);
    }

    // Earlier rounds for background (limit to keep prompt tight)
    if (earlierActorMsgs.length > 0) {
      const earlier = earlierActorMsgs
        .slice(-4)
        .map((m) => `[Round ${m.round}] ${m.displayName}: ${m.content}`)
        .join("\n");
      parts.push(`Earlier exchanges (background):\n${earlier}`);
    }

    // Last round's rival statements — the primary thing to react to
    if (othersLastRound.length > 0) {
      const othersText = othersLastRound
        .map((m) => `${m.displayName}: "${m.content}"`)
        .join("\n\n");
      parts.push(`What your rivals said last round:\n${othersText}`);
    }

    // Judge's ruling anchors the current stakes
    if (lastJudgeMsg) {
      parts.push(`Judge's ruling: ${lastJudgeMsg.content}`);
    }

    // Explicit callout warning — this demands a response
    if (calledOutBy.length > 0) {
      const callerNames = calledOutBy.map((m) => m.displayName).join(" and ");
      const excerpts = calledOutBy
        .map((m) => {
          // Pull just the sentence(s) containing the participant's name
          const name = participant.displayName.toLowerCase();
          const sentences = m.content
            .split(/(?<=[.!?])\s+/)
            .filter((s) => s.toLowerCase().includes(name));
          return `${m.displayName}: "${sentences.join(" ") || m.content}"`;
        })
        .join("\n");
      parts.push(
        `DIRECT CHALLENGE — ${callerNames} called you out by name:\n${excerpts}\nThis cannot go unanswered. Address it directly.`,
      );
    }

    // Own last position — so the actor builds on or deliberately pivots from it
    if (ownLast) {
      parts.push(`Your last stated position: "${ownLast.content}"`);
    }

    // Action directive — escalates with round count
    const directive =
      roundsLeft <= 1
        ? `This is the final round. Commit completely. No hedging, no diplomacy. Make your definitive move.`
        : `React to what was said above. Advance your position. Name names. Do not summarize — act.`;
    parts.push(directive);

    userPrompt = parts.join("\n\n");
  }

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
