/**
 * Orchestrator that turns a completed run into a final-video media_assets row.
 *
 * Flow:
 *   1. Build storyboard from run + audio assets.
 *   2. Run the local ffmpeg pipeline (renderVideo).
 *   3. Upload the MP4 to the configured StorageProvider and persist a
 *      `video-final` MediaAsset row.
 *
 * Hosted-Vercel constraints (per PRD §15.2 + plan §M6E):
 *   - DISABLE_VIDEO_GENERATION=true → throw a typed error so the caller can
 *     surface a clear UI message.
 *   - Hosted Vercel only attempts render when storyboard duration ≤ ~90s.
 *   - Anything longer routes to either self-hosted render or external worker.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { nanoid } from "nanoid";

import { getEnv } from "@/lib/env";
import { GatewayConfigError } from "@/server/gateways/errors";
import type { MediaAssetRepository, MediaAsset } from "@/server/media/types";
import type { StorageProvider } from "@/server/storage/types";
import {
  buildStoryboard,
  type Storyboard,
  type VideoStyle,
} from "@/server/media/storyboard";
import { renderVideo } from "@/server/media/renderVideo";
import type {
  RunState,
  Scenario,
  TranscriptMessage,
} from "@/server/engine/types";

export const HOSTED_VIDEO_MAX_MS = 90_000;

export type GenerateVideoDeps = {
  storage: StorageProvider;
  assets: MediaAssetRepository;
  /** When true, skip the hosted duration cap (set by self-hosted runners). */
  unrestricted?: boolean;
};

export type GenerateVideoSummary = {
  runId: string;
  asset: MediaAsset;
  storyboard: Storyboard;
};

export async function generateVideoForRun(input: {
  runId: string;
  scenario: Scenario;
  state: RunState;
  messages: TranscriptMessage[];
  styleOverride?: VideoStyle;
  deps: GenerateVideoDeps;
}): Promise<GenerateVideoSummary> {
  const env = getEnv();
  if (env.DISABLE_VIDEO_GENERATION) {
    throw new GatewayConfigError(
      "Video generation is disabled (DISABLE_VIDEO_GENERATION=true).",
    );
  }

  // Load all audio assets for the run so the storyboard can pick durations.
  const audioAssets = await input.deps.assets.listForRun(input.runId, "audio-clip");
  const audioAssetsById: Record<string, MediaAsset> = {};
  for (const a of audioAssets) audioAssetsById[a.id] = a;

  const storyboard = buildStoryboard({
    runId: input.runId,
    state: input.state,
    messages: input.messages,
    audioAssets,
    scenarioCategory: input.scenario.category,
    styleOverride: input.styleOverride,
  });

  // Hosted-only guardrail: bail out for long runs unless the caller explicitly
  // marks the environment as unrestricted (e.g. self-hosted Node host).
  const isHostedVercel = !!process.env.VERCEL;
  if (isHostedVercel && !input.deps.unrestricted) {
    if (storyboard.totalDurationMs > HOSTED_VIDEO_MAX_MS) {
      throw new GatewayConfigError(
        `Hosted video render only supports runs ≤ ${HOSTED_VIDEO_MAX_MS / 1000}s. ` +
          `This run is ${(storyboard.totalDurationMs / 1000).toFixed(1)}s. ` +
          `Use the storyboard JSON export and render via a self-hosted worker.`,
      );
    }
  }

  // Reserve a media_assets row up front so the UI can show "processing".
  const storageKey = `runs/${input.runId}/video/final-${nanoid(6)}.mp4`;
  const asset = await input.deps.assets.create({
    id: nanoid(),
    runId: input.runId,
    type: "video-final",
    storageKey,
    status: "processing",
    sequenceIndex: 0,
  });

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "arena-video-out-"));
  const outputPath = path.join(tmpRoot, "final.mp4");
  try {
    const result = await renderVideo({
      storyboard,
      audioAssetsById,
      outputPath,
    });
    const bytes = await fs.readFile(result.outputPath);
    const put = await input.deps.storage.put(
      storageKey,
      new Uint8Array(bytes),
      "video/mp4",
    );
    const updated = await input.deps.assets.update(asset.id, {
      status: "ready",
      url: put.url,
      contentType: "video/mp4",
      sizeBytes: put.sizeBytes,
      durationMs: storyboard.totalDurationMs,
      failedReason: undefined,
    });
    return { runId: input.runId, asset: updated, storyboard };
  } catch (err) {
    await input.deps.assets.update(asset.id, {
      status: "failed",
      failedReason: (err as Error).message ?? String(err),
    });
    throw err;
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}
