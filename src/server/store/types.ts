import type {
  RunState,
  TranscriptMessage,
  Scenario,
  JudgeOutput,
} from "@/server/engine/types";

export type StoredRun = {
  scenario: Scenario;
  state: RunState;
  messages: TranscriptMessage[];
  snapshots: Array<{
    round: number;
    state: RunState;
    judgeOutput?: JudgeOutput;
    createdAt: string;
  }>;
};

export interface RunRepository {
  createRun(input: StoredRun): Promise<void>;
  getRun(runId: string): Promise<StoredRun | null>;
  updateRunState(runId: string, state: RunState): Promise<void>;
  appendMessage(runId: string, message: TranscriptMessage): Promise<void>;
  appendSnapshot(
    runId: string,
    snapshot: StoredRun["snapshots"][number],
  ): Promise<void>;
  listRunIds(): Promise<string[]>;
}
