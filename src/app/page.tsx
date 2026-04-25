import { ALL_TEMPLATES } from "@/server/scenarios/templates";
import { StartRunButton } from "@/components/home/StartRunButton";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12 text-zinc-100">
      <header className="mb-12">
        <h1 className="text-4xl font-semibold tracking-tight">
          LLM Scenario Arena
        </h1>
        <p className="mt-3 text-lg text-zinc-400">
          Orchestrate AI models in fictional scenarios. Mock mode runs locally
          with no API keys.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="text-xl font-medium mb-4">Start a demo run</h2>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-6">
          <p className="text-sm text-zinc-400 mb-4">
            Runs the plane-crash scenario with 4 mock participants over 3
            rounds.
          </p>
          <StartRunButton templateId="plane-crash" participantCount={4} />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-medium mb-4">Scenario templates</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ALL_TEMPLATES.map((t) => {
            const isStub =
              t.publicFacts.length === 0 && t.rules.length === 0;
            return (
              <div
                key={t.templateId}
                className={`rounded-lg border p-5 ${
                  isStub
                    ? "border-zinc-900 bg-zinc-950/20 opacity-60"
                    : "border-zinc-800 bg-zinc-950/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium">{t.title}</h3>
                  {isStub && (
                    <span className="text-xs uppercase tracking-wide text-zinc-500">
                      stub
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-zinc-400 line-clamp-3">
                  {t.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
