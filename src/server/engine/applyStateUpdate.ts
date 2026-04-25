import type {
  JudgeOutput,
  RunState,
  ParticipantStatus,
} from "@/server/engine/types";

export function applyStateUpdate(
  state: RunState,
  judge: JudgeOutput,
): RunState {
  const updates = judge.stateUpdates ?? {};

  const newRound =
    typeof updates.round === "number" ? updates.round : state.round + 1;

  const nextParticipants = state.participants.map((p) => {
    const statusUpdate = judge.participantStatusUpdates?.[p.id];
    if (!statusUpdate) return p;
    return { ...p, status: statusUpdate as ParticipantStatus };
  });

  const appendedEvents = judge.newEvents.map((e) => ({
    ...e,
    round: newRound,
  }));

  const nextStatus: RunState["status"] = judge.shouldTerminate
    ? "completed"
    : state.status;

  return {
    ...state,
    round: newRound,
    status: nextStatus,
    publicFacts: updates.publicFacts ?? state.publicFacts,
    resources: updates.resources
      ? { ...state.resources, ...updates.resources }
      : state.resources,
    participants: nextParticipants,
    recentEvents: [...state.recentEvents, ...appendedEvents].slice(-32),
    terminationReason: judge.shouldTerminate
      ? judge.terminationReason ?? state.terminationReason
      : state.terminationReason,
  };
}
