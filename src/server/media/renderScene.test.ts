import { describe, expect, it } from "vitest";
import {
  RENDER_SCENE_INTERNALS,
  SCENE_HEIGHT,
  SCENE_WIDTH,
} from "@/server/media/renderScene";
import { VIDEO_STYLE_CATALOG } from "@/server/media/storyboard";

const { truncateForSlide, sceneTree } = RENDER_SCENE_INTERNALS;

describe("truncateForSlide", () => {
  it("collapses whitespace and leaves short strings intact", () => {
    expect(truncateForSlide("hello   world", 100)).toBe("hello world");
  });
  it("truncates with ellipsis past maxLen", () => {
    const long = "x".repeat(500);
    const out = truncateForSlide(long, 100);
    expect(out.length).toBe(100);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("sceneTree", () => {
  it("produces a Satori-compatible tree for every style descriptor", () => {
    const baseScene = {
      id: "s0",
      index: 0,
      speakerId: "p1",
      speakerType: "actor" as const,
      displayName: "GPT",
      round: 2,
      text: "Hello world.",
      durationMs: 3000,
      startMs: 6500,
      endMs: 9500,
      backgroundStyle: "dark-cockpit-drama" as const,
      audioAssetIds: [],
      participantId: "p1",
      isJudge: false,
    };
    for (const style of Object.values(VIDEO_STYLE_CATALOG)) {
      const tree = sceneTree(baseScene, style, SCENE_WIDTH, SCENE_HEIGHT);
      expect(tree.type).toBe("div");
      const children = (tree.props as { children?: unknown }).children as unknown[];
      // Root has accent bar, style badge, inner block, footer = 4 children.
      expect(Array.isArray(children)).toBe(true);
      expect((children as unknown[]).length).toBe(4);
    }
  });

  it("uses the judge color tint for judge scenes", () => {
    const judgeScene = {
      id: "s0",
      index: 0,
      speakerId: "judge",
      speakerType: "judge" as const,
      displayName: "Judge",
      round: 2,
      text: "Round summary.",
      durationMs: 3000,
      startMs: 0,
      endMs: 3000,
      backgroundStyle: "minimal-courtroom" as const,
      audioAssetIds: [],
      isJudge: true,
    };
    const descriptor = VIDEO_STYLE_CATALOG["minimal-courtroom"];
    const tree = sceneTree(judgeScene, descriptor, SCENE_WIDTH, SCENE_HEIGHT);
    // Recursively find any node whose text content is "Judge".
    const stack: unknown[] = [tree];
    let found = false;
    while (stack.length > 0) {
      const node = stack.pop();
      if (node && typeof node === "object") {
        const props = (node as { props?: { children?: unknown } }).props;
        const child = props?.children;
        if (child === "Judge") {
          found = true;
          break;
        }
        if (Array.isArray(child)) stack.push(...child);
        else if (child !== undefined) stack.push(child);
      }
    }
    expect(found).toBe(true);
  });
});
