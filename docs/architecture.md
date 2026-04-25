# Architecture

## Goals

1. **Engine independence.** Swapping `MODEL_GATEWAY_PROVIDER` from `mock` to
   `openrouter` to `vercel-ai-gateway` requires zero changes outside
   `src/server/gateways/`.
2. **Resumability.** A run survives any process crash. State, transcript,
   and snapshots are persisted round-by-round. Restart resumes from the
   last completed round.
3. **No long HTTP holds.** A single API call never owns a multi-round model
   loop. The unit of work is one round per `jobs` row.
4. **Hosted-safe.** Rate limits, cost caps, moderation, and a global kill
   switch all run before any paid model call. `DEMO_MODE=true` tightens
   everything further.

## Layered diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  Next.js UI (App Router, React 19)                                   │
│  ─ scenario builder, run viewer, audio panel, video panel             │
└──────────────────────────────────────────────────────────────────────┘
                  │ (HTTP)
                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│  API routes  (src/app/api/**)                                        │
│  ─ /api/runs (POST: create + moderate + enqueue first round)          │
│  ─ /api/runs/:id, /cancel, /audio, /video, /media, /storyboard        │
│  ─ /api/jobs/tick (drainer; lease + stale-lock recovery)              │
└──────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Engine + jobs (src/server/{engine,jobs}/**)                          │
│  ─ runOneRound: actor fan-out → judge → validate → apply → persist    │
│  ─ jobs queue (memory + DB-backed) with lease + SKIP LOCKED            │
└──────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌────────────────────────┐  ┌─────────────────────────┐  ┌──────────────┐
│ ModelGateway adapters  │  │ Storage / TTS / Media   │  │ Persistence  │
│  ─ mock                │  │  ─ ElevenLabs / mock     │  │  ─ Drizzle    │
│  ─ openrouter          │  │  ─ Vercel Blob / local   │  │  ─ Supabase   │
│  ─ vercel-ai-gateway   │  │  ─ Satori → Resvg → ffmpeg│ │  ─ pglite (CI)│
└────────────────────────┘  └─────────────────────────┘  └──────────────┘
```

## The unit of work: one round

`runOneRound(runId)` is the single function the rest of the system schedules:

1. Load `RunState` + recent messages.
2. For every active participant, build a `ModelRequest`
   ([`buildActorPrompt`](../src/server/engine/buildActorPrompt.ts)) and call
   the gateway through `Promise.allSettled`. Settled-rejected actor calls
   become "(no response)" placeholder messages so one timeout doesn't kill
   the round.
3. Build the judge prompt with `responseFormat: "json"`, parse + Zod-validate
   the JSON; on validation failure, retry once with a repair prompt; on
   second failure synthesize a minimal pass-through `JudgeOutput` so the
   run keeps going.
4. Apply the judge's `stateUpdates` into a new immutable `RunState` and
   persist messages + snapshot.
5. If the judge said `shouldTerminate` or we've hit `maxRounds`, mark the
   run terminal. Otherwise the caller (`handleRunRound`) enqueues the next
   `run-round` job.

## Job lifecycle

The `jobs` table mirrors a tiny work queue:

```sql
status text          -- queued | processing | completed | failed | cancelled
attempts int         -- bumped on every reclaim
priority int
run_after timestamptz
locked_by text
locked_at timestamptz
last_error text
```

Drain query (in `src/server/jobs/dbQueue.ts`):

```sql
SELECT ... FROM jobs
 WHERE status='queued'
   AND run_after <= now()
   AND (locked_at IS NULL OR locked_at < now() - interval '60 seconds')
 ORDER BY priority DESC, run_after ASC
 FOR UPDATE SKIP LOCKED
 LIMIT $TICK_MAX_JOBS_PER_CALL;
```

`SKIP LOCKED` lets concurrent tickers safely race; the lease (60s) means a
crashed worker's job is reclaimed on the next tick with `attempts++`. After
`max_attempts = 3` the job moves to `status=failed` and the owning run is
marked failed.

## Where the model gateway lives

```
src/server/gateways/
  types.ts                ModelGateway interface (PRD §7.2 verbatim)
  errors.ts               typed errors (Unavailable, RateLimit, ConfigError, JsonFormat)
  mockGateway.ts          deterministic seeded dialogue
  mockJudge.ts            valid JudgeOutput for any state
  openRouterGateway.ts    OpenAI SDK pointed at openrouter.ai/api/v1
  vercelGateway.ts        @ai-sdk/gateway + ai SDK
  index.ts                getGateway(provider) factory
```

The engine imports **only** `getGateway` and the types. Adding a new
provider means: write `src/server/gateways/<name>Gateway.ts`, add a slug to
the env enum, and add cost-per-token entries to
[`src/server/models/registry.ts`](../src/server/models/registry.ts).

## Persistence

Drizzle schema ([`src/server/db/schema.ts`](../src/server/db/schema.ts))
mirrors the PRD §11 layout: `users`, `scenarios`, `runs`, `participants`,
`messages`, `state_snapshots`, `media_assets`, `usage_events`, `jobs`,
`rate_limit_events`. Indexes:

- `jobs(status, run_after)` — drain query
- `messages(run_id, round)` — transcript fetch
- `state_snapshots(run_id, round)` — snapshot lookup
- `usage_events(run_id)` — cost rollup
- `media_assets(run_id, type)` — audio/video lookup

For tests, `@electric-sql/pglite` runs the same Drizzle schema in-process
so SQL paths get the same coverage as in production.

## Trigger tiers (for `/api/jobs/tick`)

| Where | How the tick fires |
| --- | --- |
| `pnpm dev` | Run page polls every 2s; manually hit `/api/jobs/tick` if needed. |
| Vercel Hobby | Run page polls + nudges `/api/jobs/tick`. No server cron required. |
| Vercel Pro | Optional Vercel Cron with `X-Jobs-Tick-Token` header (set `JOBS_TICK_TOKEN`). |
| External worker | Set `JOBS_TICK_TOKEN`, hit `/api/jobs/tick` from any HTTP client. |

The tick endpoint is rate-limited per IP when `DEMO_MODE=true` and respects
`GLOBAL_AI_KILL_SWITCH=true` by returning `{drained: 0}` and leaving jobs
queued.

## Cost & safety in the call chain

Every paid call path goes through `enforceLimits` ([`src/server/cost/enforceLimits.ts`](../src/server/cost/enforceLimits.ts)):

1. `GLOBAL_AI_KILL_SWITCH=true` → reject with `GatewayConfigError`.
2. `MAX_PARTICIPANTS_PER_RUN`, `MAX_ROUNDS_PER_RUN` → reject pre-flight.
3. `MAX_OUTPUT_TOKENS_PER_CALL` → clamps `maxOutputTokens`.
4. `MAX_ESTIMATED_COST_PER_RUN_USD` → preflight + mid-run budget check via
   `checkMidRunBudget`. If a run's actual cost + next-round estimate
   exceeds the cap, the run aborts with `terminationReason=cost_cap`.

Moderation ([`docs/safety.md`](safety.md)) runs **before** any of the above,
on both the scenario and (per-round) on actor outputs.

## Where to read code first

- [`src/server/engine/runOneRound.ts`](../src/server/engine/runOneRound.ts)
  — the heart of the system.
- [`src/server/jobs/dbQueue.ts`](../src/server/jobs/dbQueue.ts) — claim
  query, lease renewal, stale-lock recovery.
- [`src/server/jobs/handlers.ts`](../src/server/jobs/handlers.ts) — wires
  cost-cap, moderation flag, and per-round enqueue together.
- [`src/server/media/generateAudio.ts`](../src/server/media/generateAudio.ts)
  — `Promise.allSettled` failure isolation.
- [`src/server/media/storyboard.ts`](../src/server/media/storyboard.ts) —
  pure scene planner consumed by the video pipeline.
