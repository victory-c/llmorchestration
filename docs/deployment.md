# Deployment

Two supported paths:

1. **Hosted Vercel demo** — locked down by `DEMO_MODE=true` with tight caps.
2. **Self-host** — bring your own keys, run locally or on any Node host.

## Hosted Vercel demo

### 1. Supabase

1. Create a Supabase project.
2. In project settings → database, copy the **pooled** connection string to `DATABASE_URL` and the **direct** connection to `DIRECT_URL`.
3. Run migrations from your dev machine:
   ```bash
   pnpm drizzle-kit push
   ```
   (Migrations run against `DIRECT_URL`.)

### 2. Vercel project

Connect the repo and set these environment variables on the project (Production + Preview):

| Var | Value |
| --- | --- |
| `DEMO_MODE` | `true` |
| `DATABASE_URL` | Supabase pooled URL |
| `MODEL_GATEWAY_PROVIDER` | `vercel-ai-gateway` (or `openrouter`) |
| `VERCEL_AI_GATEWAY_API_KEY` | optional on Vercel (OIDC is auto-wired) |
| `OPENROUTER_API_KEY` | required only if `MODEL_GATEWAY_PROVIDER=openrouter` |
| `STORAGE_PROVIDER` | `vercel-blob` (once M5 ships) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token |
| `MAX_RUNS_PER_IP_PER_DAY` | `3` (hosted demo default) |
| `GLOBAL_AI_KILL_SWITCH` | `false`; flip to `true` to stop all paid calls instantly |

When `DEMO_MODE=true`, hosted caps tighten further (`src/lib/constants.ts`):

- ≤ 3 participants per run
- ≤ 3 rounds per run
- ≤ 300 output tokens per model call
- ≤ $0.25 estimated cost per run

These tighten the env values — they can never loosen past the operator env floor.

### 3. Job tick drainer

- **Hobby plan:** the run page polls `/api/jobs/tick` every 2s while a run is `queued|running`. No Vercel Cron assumed.
- **Pro plan (optional):** add a Vercel Cron hitting `POST /api/jobs/tick` with header `X-Jobs-Tick-Token: $JOBS_TICK_TOKEN`. Set `JOBS_TICK_TOKEN` on the project to enforce the header.
- `TICK_MAX_JOBS_PER_CALL` caps how many jobs drain per call (default 5).
- The endpoint is rate-limited per IP when `DEMO_MODE=true`.

## Audio (M5)

- `TTS_PROVIDER=mock` — free, returns a silent clip. Use in CI / local dev / preview deploys where a real TTS key is overkill.
- `TTS_PROVIDER=elevenlabs` — requires `ELEVENLABS_API_KEY`. Pricing is per-character; long messages are chunked automatically (see `src/server/tts/chunk.ts`).
- `DISABLE_TTS_GENERATION=true` — hard-disables audio generation regardless of provider.
- `STORAGE_PROVIDER=local` — writes clips to `./public/media/` (dev-only; rejected on Vercel).
- `STORAGE_PROVIDER=vercel-blob` — hosted-demo default; `BLOB_READ_WRITE_TOKEN` is auto-injected on Vercel.
- `STORAGE_PROVIDER=supabase|s3|r2` — scaffolded; adapters throw a helpful config error until you plug them in.

Audio clips land in `media_assets` with `type='audio-clip'`. The run viewer's AudioPanel polls `/api/runs/:id/media` and allows per-clip regenerate via `/api/media/:id/regenerate` — a single failed clip never fails the whole run.

## Self-host

Clone, `cp .env.example .env.local`, fill in keys for the gateway / provider you want to use, and run:

```bash
pnpm install
pnpm dev
```

With `MODEL_GATEWAY_PROVIDER=mock` and no `DATABASE_URL`, the app runs end-to-end in memory with zero keys — useful to evaluate the project before wiring Supabase/Vercel.

## Kill switch

Flip `GLOBAL_AI_KILL_SWITCH=true` on the hosting project to immediately stop every paid gateway call. Queued jobs stay queued; drained counts go to zero. Flip it back to resume.
