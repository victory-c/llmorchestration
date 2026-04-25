# API keys

The arena does not ship with any API keys. Every key in `.env.example` is a
placeholder. Self-hosters bring their own.

## Minimum config (mock-only)

```bash
MODEL_GATEWAY_PROVIDER=mock
TTS_PROVIDER=mock
STORAGE_PROVIDER=local
# DATABASE_URL omitted → in-memory store, runs lost on restart
```

No keys needed. `pnpm dev` boots, plane-crash runs end-to-end. This is the
target experience for "I cloned this from GitHub and want to look around."

## Real model gateway

Pick **one** of:

### OpenRouter (recommended for evaluation)

One key gives you ~150 model slugs across every major provider. OpenAI-compatible API.

```bash
MODEL_GATEWAY_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-...
```

Get the key at <https://openrouter.ai/keys>. Free tier exists (with daily
limits) for casual eval; paid is pay-as-you-go.

The arena adds two custom headers OpenRouter expects:

- `HTTP-Referer: $NEXT_PUBLIC_APP_URL`
- `X-OpenRouter-Title: LLM Scenario Arena`

### Vercel AI Gateway

Recommended for hosted Vercel deploys — OIDC auth is auto-wired so the key
is optional in production. Locally you still need it.

```bash
MODEL_GATEWAY_PROVIDER=vercel-ai-gateway
VERCEL_AI_GATEWAY_API_KEY=vgk_...   # only required when running locally
```

Get the key from the AI Gateway tab of your Vercel project settings.

## TTS

```bash
# Free / dev
TTS_PROVIDER=mock

# Real audio (per-character billing — see https://elevenlabs.io/pricing)
TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=...
```

Free-tier ElevenLabs keys work for the demo (10K free chars/month at the
time of writing). Long messages are chunked to stay under per-call limits.

`DISABLE_TTS_GENERATION=true` hard-disables audio regardless of provider —
useful as a kill switch during cost spikes or if you forgot to set
`MAX_RUNS_PER_IP_PER_DAY`.

## Storage

```bash
STORAGE_PROVIDER=local        # writes to ./public/media; rejected on Vercel
STORAGE_PROVIDER=vercel-blob  # hosted-demo default; auto-injected on Vercel
BLOB_READ_WRITE_TOKEN=...     # required when running locally pointing at Vercel Blob

STORAGE_PROVIDER=supabase     # adapter scaffolded — throws helpful config error
STORAGE_PROVIDER=s3 / r2      # scaffolded — throws helpful config error
```

`local` is convenient for `pnpm dev` but **rejected at boot when `VERCEL=1`**
because Vercel's filesystem is ephemeral and not shared across instances.

## Database (optional in dev, required in production)

```bash
DATABASE_URL=postgres://postgres:PASSWORD@db.PROJECT.supabase.co:6543/postgres?pgbouncer=true
DIRECT_URL=postgres://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres
```

`DATABASE_URL` is the pooled (pgbouncer) connection used at runtime.
`DIRECT_URL` is the direct connection used by `drizzle-kit push` for
migrations. Omit both to run in in-memory mode (transcripts lost on restart).

Supabase free tier is enough to demo the project. Any Postgres works — Neon,
RDS, Railway — as long as `DATABASE_URL` points at the pooled endpoint.

## Moderation

```bash
MODERATION_PROVIDER=local     # default — keyword baseline
MODERATION_PROVIDER=openai    # adds OpenAI Moderations API on top
OPENAI_API_KEY=sk-...         # only required when MODERATION_PROVIDER=openai
```

When `MODERATION_PROVIDER=openai` is set without `OPENAI_API_KEY`, the
provider silently falls back to local keywords (with a `console.warn`) so
moderation is never bypassed.

## Safety / cost caps (operator floor)

These are **floors** — `DEMO_MODE=true` tightens them further but cannot
loosen past whatever you set here.

```bash
MAX_RUNS_PER_IP_PER_DAY=3
MAX_PARTICIPANTS_PER_RUN=6
MAX_ROUNDS_PER_RUN=6
MAX_OUTPUT_TOKENS_PER_CALL=400
MAX_ESTIMATED_COST_PER_RUN_USD=0.25
```

## Kill switches

```bash
GLOBAL_AI_KILL_SWITCH=true    # blocks every paid model call
DISABLE_TTS_GENERATION=true   # blocks audio
DISABLE_VIDEO_GENERATION=true # blocks video
```

Toggling a kill switch on Vercel takes effect on the next request — no
deploy required.

## Job tick token (optional)

```bash
JOBS_TICK_TOKEN=some-shared-secret    # /api/jobs/tick rejects without X-Jobs-Tick-Token
TICK_MAX_JOBS_PER_CALL=5
```

Useful when you want only Vercel Cron / an external worker to drain jobs
and don't want the run page to poll.

## Where the keys are read

| Var | Read at | Used by |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | request time | `openRouterGateway` |
| `VERCEL_AI_GATEWAY_API_KEY` | request time | `vercelGateway` |
| `ELEVENLABS_API_KEY` | TTS request time | `elevenLabsTTS` |
| `BLOB_READ_WRITE_TOKEN` | upload time | `vercelBlob` storage |
| `DATABASE_URL` | boot | Drizzle |
| `OPENAI_API_KEY` | per-moderation call | `openAiModerationProvider` |

Boot-time env validation lives in `src/lib/env.ts` (Zod). Optional keys are
`.optional()` so the app starts cleanly in mock mode without them.
