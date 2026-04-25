/* eslint-disable @typescript-eslint/no-explicit-any */
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import {
  type Scene,
  type VideoStyle,
  VIDEO_STYLE_CATALOG,
} from "@/server/media/storyboard";
import { loadDefaultFonts } from "@/server/media/fonts";

export const SCENE_WIDTH = 1280;
export const SCENE_HEIGHT = 720;

type RenderInput = {
  scene: Scene;
  /** override style (otherwise scene.backgroundStyle) */
  style?: VideoStyle;
  /** override dimensions (defaults to 1280x720) */
  width?: number;
  height?: number;
};

/**
 * Render a single scene to an SVG string via Satori. Pure JS, no headless
 * browser, no native deps beyond Resvg's bundled wasm/native build.
 */
export async function renderSceneSvg(input: RenderInput): Promise<string> {
  const styleId = input.style ?? input.scene.backgroundStyle;
  const descriptor = VIDEO_STYLE_CATALOG[styleId];
  const fonts = await loadDefaultFonts();
  const width = input.width ?? SCENE_WIDTH;
  const height = input.height ?? SCENE_HEIGHT;

  const tree = sceneTree(input.scene, descriptor, width, height);
  const svg = await satori(tree as any, {
    width,
    height,
    fonts: fonts.map((f) => ({
      name: f.name,
      data: f.data,
      weight: f.weight as 400 | 700,
      style: f.style,
    })),
  });
  return svg;
}

/**
 * Render a scene to a PNG byte array. Caller is responsible for writing it to
 * disk / storage. Returns raw PNG bytes (no base64).
 */
export async function renderScenePng(input: RenderInput): Promise<Uint8Array> {
  const svg = await renderSceneSvg(input);
  const resvg = new Resvg(svg, {
    background: "rgba(0,0,0,1)",
    fitTo: {
      mode: "width",
      value: input.width ?? SCENE_WIDTH,
    },
  });
  const png = resvg.render().asPng();
  return new Uint8Array(png);
}

/**
 * Build a Satori-compatible JSX-ish tree without using JSX (so this file does
 * not require a JSX-aware loader to be testable). Each style descriptor maps
 * to the same layout but with different visual tokens — this keeps the five
 * styles uniform for now and easy to specialize later.
 */
function sceneTree(
  scene: Scene,
  descriptor: { bgGradient: [string, string]; accent: string; textColor: string; mutedColor: string; label: string },
  width: number,
  height: number,
) {
  const speakerLabel = scene.isJudge ? "Judge" : scene.displayName;
  const text = truncateForSlide(scene.text, 360);

  const accentBar = el(
    "div",
    {
      style: {
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 12,
        background: descriptor.accent,
      },
    },
  );

  const styleBadge = el(
    "div",
    {
      style: {
        position: "absolute",
        top: 28,
        right: 40,
        fontSize: 18,
        textTransform: "uppercase",
        letterSpacing: 4,
        color: descriptor.mutedColor,
        fontWeight: 700,
      },
    },
    descriptor.label,
  );

  const roundBadge = el(
    "div",
    {
      style: {
        fontSize: 22,
        color: descriptor.mutedColor,
        textTransform: "uppercase",
        letterSpacing: 3,
        fontWeight: 700,
      },
    },
    `Round ${scene.round}`,
  );

  const speakerName = el(
    "div",
    {
      style: {
        fontSize: scene.isJudge ? 56 : 64,
        fontWeight: 700,
        color: scene.isJudge ? descriptor.accent : descriptor.textColor,
        marginTop: 8,
        marginBottom: 32,
        lineHeight: 1.05,
      },
    },
    speakerLabel,
  );

  const body = el(
    "div",
    {
      style: {
        fontSize: 36,
        lineHeight: 1.32,
        color: descriptor.textColor,
        fontWeight: 400,
        maxWidth: width - 220,
        whiteSpace: "pre-wrap",
        display: "flex",
      },
    },
    text,
  );

  const footer = el(
    "div",
    {
      style: {
        position: "absolute",
        left: 80,
        right: 40,
        bottom: 32,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: 18,
        color: descriptor.mutedColor,
        textTransform: "uppercase",
        letterSpacing: 3,
        fontWeight: 700,
      },
    },
    el("div", {}, "LLM Scenario Arena"),
    el("div", {}, formatTimestamp(scene.startMs)),
  );

  const inner = el(
    "div",
    {
      style: {
        position: "absolute",
        left: 80,
        right: 80,
        top: 96,
        bottom: 110,
        display: "flex",
        flexDirection: "column",
      },
    },
    roundBadge,
    speakerName,
    body,
  );

  return el(
    "div",
    {
      style: {
        position: "relative",
        width,
        height,
        display: "flex",
        background: `linear-gradient(135deg, ${descriptor.bgGradient[0]} 0%, ${descriptor.bgGradient[1]} 100%)`,
        fontFamily: "Inter",
      },
    },
    accentBar,
    styleBadge,
    inner,
    footer,
  );
}

function el(type: string, props: Record<string, unknown>, ...children: unknown[]) {
  // Satori expects a React-flavored tree shape: { type, props: { children, ...rest } }
  const flatChildren = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  return {
    type,
    key: null,
    props: {
      ...props,
      children:
        flatChildren.length === 0
          ? undefined
          : flatChildren.length === 1
            ? flatChildren[0]
            : flatChildren,
    },
  };
}

function truncateForSlide(text: string, maxLen: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLen) return collapsed;
  return collapsed.slice(0, maxLen - 1).trimEnd() + "…";
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const RENDER_SCENE_INTERNALS = { truncateForSlide, sceneTree };
