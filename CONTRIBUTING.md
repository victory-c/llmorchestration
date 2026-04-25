# Contributing

Thanks for your interest. This is an OSS portfolio project — issues and PRs
are welcome, with a small set of ground rules.

## Quick start

```bash
git clone <repo-url>
cd llmorchestration
cp .env.example .env.local
pnpm install
pnpm dev
```

`pnpm dev` runs end-to-end in mock mode with zero API keys. `pnpm test`
runs the full vitest suite (~130 tests, ~3s).

## Required checks before opening a PR

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm test        # vitest run
pnpm build       # next build (production build smoke-test)
```

CI runs all four on every PR.

## Project conventions

- **One round per job.** Never reintroduce a long in-process loop. The unit
  of work is `runOneRound(runId)`; everything beyond M1 schedules it through
  the jobs queue.
- **Engine ↔ provider isolation.** No file under `src/server/engine/` or
  `src/server/jobs/` may import a provider SDK directly. Go through
  `getGateway(provider)`.
- **Moderation runs before paid calls.** New code paths that fan out model
  requests must call `moderateScenarioAsync` (scenario time) and/or
  `moderateActorOutput` (per-message). When in doubt, model after
  `handleRunRound`.
- **Typed errors.** Throw `GatewayConfigError`, `ModelUnavailableError`,
  `ModelJsonFormatError`, `GatewayRateLimitError` — not raw `Error`. Call
  sites pattern-match on these.
- **No emojis in source files.** README and docs only, and only when the
  user asks.
- **Don't commit generated media.** `*.mp3`, `*.mp4`, anything under
  `public/media/` — already gitignored, don't override.
- **Don't commit secrets.** `.env.local` is gitignored; `.env.example`
  contains placeholders only. Run a quick `git grep` for any of your real
  keys before pushing.

## Reading order for new contributors

1. [`README.md`](README.md) — what the project does.
2. [`docs/architecture.md`](docs/architecture.md) — layered diagram and
   why one-round-per-job exists.
3. [`src/server/engine/runOneRound.ts`](src/server/engine/runOneRound.ts) —
   the heart of the system. Roughly 100 lines.
4. [`src/server/jobs/handlers.ts`](src/server/jobs/handlers.ts) — wires
   cost-cap, moderation, and per-round enqueue.
5. The matching test files. Tests are the lowest-friction way to learn
   the contract.

## Tests

We use vitest with `@electric-sql/pglite` for SQL paths. Conventions:

- One file per module, colocated as `<module>.test.ts`.
- Reset shared state in `beforeEach` (`resetMemoryAssetsForTests`,
  `resetUsageEventsForTests`, etc.).
- Use the `setXForTests` injection hooks instead of mocking module imports
  where possible.
- For React components and Next.js routes, prefer testing the underlying
  pure function rather than the route handler when feasible.

If a test is flaky on your machine but green in CI, please open an issue
before merging — flakiness is almost always a race in our code, not in
vitest.

## Adding a scenario template

1. Add a `ScenarioTemplate` to
   [`src/server/scenarios/templates.ts`](src/server/scenarios/templates.ts).
   Fully populate `publicFacts`, `rules`, `terminationConditions`,
   `resources`. Pick a `category` from
   `survival-dilemma | debate | negotiation | game-theory | reality-show`
   (or add a new one and update
   [`src/server/media/storyboard.ts`](src/server/media/storyboard.ts) to
   map it to a video style).
2. Add to the `STUB_TEMPLATES` array.
3. Run `pnpm test` — moderation runs against every template content; if
   your text contains a flagged term you'll see it.

## Adding a model gateway

See [`docs/model-gateways.md`](docs/model-gateways.md) — five steps:
type, adapter, factory, registry entry, test.

## Adding a moderation rule

See [`docs/safety.md`](docs/safety.md) — three steps: rule, test, run.

## Reporting security issues

See [`SECURITY.md`](SECURITY.md). Please don't open public issues for
exploits — email instead.

## License

By contributing you agree your work is licensed under the MIT License (the
project's license). See [`LICENSE`](LICENSE).
