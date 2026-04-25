import type { StoredRun } from "@/server/store/types";

export function exportRunMarkdown(run: StoredRun): string {
  const lines: string[] = [];
  lines.push(`# ${run.scenario.title}`);
  lines.push("");
  lines.push(run.scenario.description);
  lines.push("");
  lines.push(`**Run ID:** \`${run.state.runId}\``);
  lines.push(`**Status:** ${run.state.status}`);
  lines.push(`**Rounds:** ${run.state.round} / ${run.state.maxRounds}`);
  if (run.state.terminationReason) {
    lines.push(`**Termination reason:** ${run.state.terminationReason}`);
  }
  lines.push("");
  lines.push("## Participants");
  lines.push("");
  for (const p of run.state.participants) {
    lines.push(
      `- **${p.displayName}** (${p.modelId}) — status: \`${p.status}\` — ${p.publicPersona}`,
    );
  }
  lines.push("");

  const rounds = new Map<number, typeof run.messages>();
  for (const m of run.messages) {
    const arr = rounds.get(m.round) ?? [];
    arr.push(m);
    rounds.set(m.round, arr);
  }
  const sortedRounds = Array.from(rounds.keys()).sort((a, b) => a - b);
  for (const round of sortedRounds) {
    lines.push(`## Round ${round}`);
    lines.push("");
    for (const m of rounds.get(round)!) {
      const tag =
        m.speakerType === "judge"
          ? "🧑‍⚖️ Judge"
          : m.speakerType === "system"
            ? "⚙️ System"
            : `🎭 ${m.displayName}`;
      lines.push(`**${tag}**${m.modelId ? ` _(${m.modelId})_` : ""}:`);
      lines.push("");
      lines.push(m.content);
      lines.push("");
    }
  }

  return lines.join("\n");
}
