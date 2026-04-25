# Video pipeline

The arena ships three ways to produce a storyboard video. Pick the one that
matches your hosting environment.

## 1. Local / self-hosted MP4 (primary path)

Runs entirely inside the Next.js Node process. No external services.

```bash
pnpm dev
# in the run viewer, click "Generate audio" → "Generate video"
```

Pipeline:

1. `buildStoryboard` (`src/server/media/storyboard.ts`) turns a completed run
   into an ordered `Scene[]`. Scene durations come from the matching
   audio-clip `media_assets` rows; if a message has no audio, a reading-speed
   estimate (≥ 2.5s) is used instead.
2. `renderScenePng` (`src/server/media/renderScene.tsx`) produces a 1280×720
   PNG per scene via Satori → Resvg. No headless browser, no native deps
   beyond Resvg's bundled binary.
3. `renderVideo` (`src/server/media/renderVideo.ts`) drives a precompiled
   ffmpeg (`@ffmpeg-installer/ffmpeg`) to:
   - encode each scene as a still-frame MP4 at 30fps with its audio track,
   - concat-demux the per-scene MP4s into one file,
   - burn in `captions.srt` (rendered via `renderSrt` from
     `src/server/media/subtitles.ts`).
4. The MP4 is uploaded to the configured `StorageProvider` and persisted as a
   `media_assets` row of type `video-final`.

Memory + disk: ~30-50 MB per minute of output. The temp directory is cleaned
up after each render.

## 2. Hosted Vercel render (capped, opt-in)

Same code path, but the API route refuses any storyboard whose
`totalDurationMs > 90_000` so a single render never holds a serverless
function past its `maxDuration` limit. `DISABLE_VIDEO_GENERATION=true` turns
the feature off entirely.

For runs over the cap, the API returns HTTP 413 with the storyboard JSON in
the body so the UI can offer "Download storyboard JSON" as a fallback.

The hosted demo is **best-effort, experimental** — short runs only. Keep
`DISABLE_VIDEO_GENERATION=true` unless you have explicitly tuned `vercel.json`
for the route and confirmed your Pro plan limits.

## 3. External worker (recommended for long runs)

For transcripts longer than ~90s, push the render off Vercel:

```ts
// pseudo-code for an external worker (Railway / Render / Fly / Inngest)
import { buildStoryboard, renderVideo, getStorage, getMediaAssets } from "...";

async function workerTick() {
  // 1. Pull storyboard JSON from /api/runs/:id/storyboard
  const sb = await fetch(`${ARENA_URL}/api/runs/${runId}/storyboard?style=${style}`).then(r => r.json());

  // 2. Pull audio assets (the URLs are publicly readable from Vercel Blob)
  // 3. Render the video locally
  // 4. POST the resulting MP4 back to the arena (or write directly to the
  //    same Vercel Blob bucket) and update media_assets via SQL.
}
```

Pre-built integrations are intentionally **not** shipped — pick the queue
that fits your stack:

- **Inngest** — durable serverless queue, easy retries.
- **Trigger.dev** — similar; nicer UI for long jobs.
- **QStash** (Upstash) — minimal HTTP-based queue.
- **Railway / Render / Fly worker** — long-lived VM, no per-job caps.
- **Supabase Edge Functions** — low-friction if you already host Postgres
  there. 150s soft cap; ok for short videos.

The arena exposes:

- `GET /api/runs/:id/storyboard` — pure storyboard JSON, no auth required
  beyond the run being readable.
- `GET /api/runs/:id/media` — all media_assets for the run (audio + video).
- `POST /api/runs/:id/video` — enqueue a `generate-video` job for the
  in-process pipeline. The external worker path bypasses this entirely and
  writes its own `video-final` row.

## Environment

| Var | Default | Purpose |
| --- | --- | --- |
| `DISABLE_VIDEO_GENERATION` | `false` | Hard-disable video generation regardless of plan. |
| `STORAGE_PROVIDER` | `local` | Where rendered MP4s land. `local` is dev-only; use `vercel-blob` (or `supabase`/`s3`/`r2` when those adapters are wired) in production. |
| `BLOB_READ_WRITE_TOKEN` | — | Required for `vercel-blob` when running locally; auto-injected on Vercel. |
| `VERCEL` | (set by Vercel) | When set, the API rejects renders > 90s up-front. |

## Subtitles

`renderSrt({ scenes, withSpeaker: true })` emits an SRT file with up to two
wrapped 42-char lines per cue, prefixed with the speaker's display name on
the first cue of each scene. Long scenes are split into multiple cues
weighted by character count so subtitles flow naturally.

`renderVtt` produces the WebVTT variant for `<track>` overlays in the
browser if you ever want to render captions client-side instead of burning
them into the MP4.

## Failure isolation

A single failed scene render aborts the whole video — scenes share a temp
directory and the concat demuxer expects every file to exist. If you need
per-scene resilience (e.g. for very long batches), drive the render scene
by scene and combine on the client. The audio pipeline already handles
per-clip failure isolation via `Promise.allSettled` in `generateAudio.ts`.
