/**
 * Local MP4 composer.
 *
 * Pipeline:
 *   1. Render each Scene to a PNG via Satori + Resvg.
 *   2. For each scene, write the PNG + the (decoded) MP3 audio to a temp dir.
 *   3. ffmpeg builds a per-scene MP4 by stretching the still frame across the
 *      scene's duration, with the matching audio (or silent track if absent).
 *   4. concat-demuxer stitches the per-scene MP4s into the final video.
 *   5. Burn-in subtitles via the SRT we already wrote to the temp dir.
 *
 * This path is the **primary supported video render** per PRD §15. It assumes a
 * local Node host with ffmpeg available — `@ffmpeg-installer/ffmpeg` ships a
 * precompiled binary so no system install is required.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import type { Storyboard, Scene } from "@/server/media/storyboard";
import type { MediaAsset } from "@/server/media/types";
import { renderScenePng, SCENE_HEIGHT, SCENE_WIDTH } from "@/server/media/renderScene";
import { renderSrt } from "@/server/media/subtitles";

export type RenderVideoInput = {
  storyboard: Storyboard;
  /** Map of asset id → fetchable url (or local /public path) */
  audioAssetsById: Record<string, MediaAsset>;
  /** absolute output path; caller picks where it lands */
  outputPath: string;
  /** override the default ffmpeg binary path */
  ffmpegPath?: string;
  /** progress callback, fires once per scene */
  onProgress?: (info: { sceneIndex: number; totalScenes: number; phase: "render" | "encode" | "concat" | "subtitle" }) => void;
};

export type RenderVideoResult = {
  outputPath: string;
  durationMs: number;
  sceneCount: number;
  sizeBytes: number;
};

const FFMPEG_BIN = ffmpegInstaller.path;

export async function renderVideo(input: RenderVideoInput): Promise<RenderVideoResult> {
  const { storyboard } = input;
  if (storyboard.scenes.length === 0) {
    throw new Error("renderVideo: storyboard has no scenes");
  }

  const ffmpeg = input.ffmpegPath ?? FFMPEG_BIN;
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "arena-video-"));
  try {
    const sceneFiles: string[] = [];

    for (let i = 0; i < storyboard.scenes.length; i++) {
      const scene = storyboard.scenes[i];
      input.onProgress?.({ sceneIndex: i, totalScenes: storyboard.scenes.length, phase: "render" });

      // 1. Scene PNG
      const pngBytes = await renderScenePng({ scene });
      const pngPath = path.join(tmpRoot, `scene-${i}.png`);
      await fs.writeFile(pngPath, Buffer.from(pngBytes));

      // 2. Resolve audio for this scene (concat if multiple chunks).
      const audioPath = await resolveSceneAudio(scene, input.audioAssetsById, tmpRoot, i, ffmpeg);

      // 3. Per-scene MP4
      input.onProgress?.({ sceneIndex: i, totalScenes: storyboard.scenes.length, phase: "encode" });
      const sceneMp4 = path.join(tmpRoot, `scene-${i}.mp4`);
      await encodeSceneClip({
        ffmpeg,
        pngPath,
        audioPath,
        durationMs: scene.durationMs,
        outPath: sceneMp4,
      });
      sceneFiles.push(sceneMp4);
    }

    // 4. Concat
    input.onProgress?.({ sceneIndex: storyboard.scenes.length, totalScenes: storyboard.scenes.length, phase: "concat" });
    const concatList = path.join(tmpRoot, "concat.txt");
    await fs.writeFile(
      concatList,
      sceneFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"),
    );
    const concatMp4 = path.join(tmpRoot, "concat.mp4");
    await runFfmpeg(ffmpeg, [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatList,
      "-c",
      "copy",
      concatMp4,
    ]);

    // 5. Subtitles burn-in
    input.onProgress?.({ sceneIndex: storyboard.scenes.length, totalScenes: storyboard.scenes.length, phase: "subtitle" });
    const srtPath = path.join(tmpRoot, "captions.srt");
    await fs.writeFile(srtPath, renderSrt({ scenes: storyboard.scenes }));

    await fs.mkdir(path.dirname(input.outputPath), { recursive: true });

    // ffmpeg's subtitles filter wants forward slashes + escaped colons.
    const srtFilterPath = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    await runFfmpeg(ffmpeg, [
      "-y",
      "-i",
      concatMp4,
      "-vf",
      `subtitles='${srtFilterPath}':force_style='FontName=Inter,Fontsize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H66000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=48'`,
      "-c:a",
      "copy",
      input.outputPath,
    ]);

    const stat = await fs.stat(input.outputPath);
    return {
      outputPath: input.outputPath,
      durationMs: storyboard.totalDurationMs,
      sceneCount: storyboard.scenes.length,
      sizeBytes: stat.size,
    };
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function resolveSceneAudio(
  scene: Scene,
  assetsById: Record<string, MediaAsset>,
  tmpRoot: string,
  sceneIndex: number,
  ffmpeg: string,
): Promise<string | undefined> {
  if (scene.audioAssetIds.length === 0) return undefined;
  const clipPaths: string[] = [];
  for (let i = 0; i < scene.audioAssetIds.length; i++) {
    const id = scene.audioAssetIds[i];
    const asset = assetsById[id];
    if (!asset?.url) continue;
    const dest = path.join(tmpRoot, `audio-${sceneIndex}-${i}.mp3`);
    await fetchToFile(asset.url, dest);
    clipPaths.push(dest);
  }
  if (clipPaths.length === 0) return undefined;
  if (clipPaths.length === 1) return clipPaths[0];

  // Concat audio chunks for the same message into a single stream.
  const concatList = path.join(tmpRoot, `audio-${sceneIndex}-concat.txt`);
  await fs.writeFile(
    concatList,
    clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
  );
  const merged = path.join(tmpRoot, `audio-${sceneIndex}.mp3`);
  await runFfmpeg(ffmpeg, [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatList,
    "-c",
    "copy",
    merged,
  ]);
  return merged;
}

async function fetchToFile(urlOrPath: string, dest: string): Promise<void> {
  // Local /media/* URL → resolve to ./public
  if (urlOrPath.startsWith("/media/")) {
    const local = path.join(process.cwd(), "public", urlOrPath.replace(/^\//, ""));
    await fs.copyFile(local, dest);
    return;
  }
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    const res = await fetch(urlOrPath);
    if (!res.ok) throw new Error(`fetch ${urlOrPath} failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(dest, buf);
    return;
  }
  // Treat as local path
  await fs.copyFile(urlOrPath, dest);
}

async function encodeSceneClip(opts: {
  ffmpeg: string;
  pngPath: string;
  audioPath?: string;
  durationMs: number;
  outPath: string;
}): Promise<void> {
  const seconds = (opts.durationMs / 1000).toFixed(3);
  const args: string[] = ["-y", "-loop", "1", "-i", opts.pngPath];
  if (opts.audioPath) {
    args.push("-i", opts.audioPath);
  } else {
    args.push("-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=44100`);
  }
  args.push(
    "-t",
    seconds,
    "-vf",
    `scale=${SCENE_WIDTH}:${SCENE_HEIGHT}:force_original_aspect_ratio=decrease,pad=${SCENE_WIDTH}:${SCENE_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-tune",
    "stillimage",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-shortest",
    opts.outPath,
  );
  await runFfmpeg(opts.ffmpeg, args);
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      // ffmpeg stderr is verbose by design; only retain the last 4kb.
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}\n${stderr}`));
    });
  });
}

export const VIDEO_RENDER_INTERNALS = { runFfmpeg, FFMPEG_BIN };
