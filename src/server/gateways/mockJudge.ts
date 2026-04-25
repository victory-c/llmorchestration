import type { ModelRequest } from "@/server/gateways/types";
import type { JudgeOutput } from "@/server/engine/types";

type JudgeInputContext = {
  round: number;
  maxRounds: number;
  participants: Array<{ id: string; displayName: string }>;
  resources: Record<string, number | string | boolean>;
};

function parseContextFromRequest(
  request: ModelRequest,
): JudgeInputContext | null {
  const ctx = request.metadata?.judgeContext as JudgeInputContext | undefined;
  return ctx ?? null;
}

export function generateMockJudgeJson(request: ModelRequest): string {
  const ctx = parseContextFromRequest(request);
  const round = ctx?.round ?? 0;
  const maxRounds = ctx?.maxRounds ?? 3;
  const nextRound = round + 1;
  const shouldTerminate = nextRound >= maxRounds;

  const participants = ctx?.participants ?? [];
  const statusUpdates: Record<string, "active" | "eliminated" | "saved"> = {};
  if (shouldTerminate && participants.length >= 4) {
    for (let i = 0; i < participants.length; i++) {
      statusUpdates[participants[i]!.id] = i < 4 ? "saved" : "eliminated";
    }
  }

  const newEvents = [
    {
      type: "round-summary",
      description: `Round ${nextRound} concluded. The group continues deliberating.`,
    },
  ];
  if (shouldTerminate) {
    newEvents.push({
      type: "termination",
      description: "Maximum rounds reached. Judge finalizes outcome.",
    });
  }

  const output: JudgeOutput = {
    roundSummary: shouldTerminate
      ? `Round ${nextRound}: the group reached a final allocation. Four participants receive parachutes.`
      : `Round ${nextRound}: participants exchanged positions. No consensus yet.`,
    stateUpdates: {
      round: nextRound,
    },
    participantStatusUpdates:
      Object.keys(statusUpdates).length > 0 ? statusUpdates : undefined,
    newEvents,
    nextRoundPrompt: shouldTerminate
      ? undefined
      : "Continue negotiating. Be concrete about proposals.",
    shouldTerminate,
    terminationReason: shouldTerminate ? "max-rounds-reached" : undefined,
  };

  return JSON.stringify(output);
}
