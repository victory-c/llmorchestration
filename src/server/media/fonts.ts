/**
 * Font loader for Satori scene rendering.
 *
 * Strategy: lazy-fetch a public Inter TTF on first use, cache in module
 * scope. Network is only required once per process (typically the first
 * render-scene job after server start). Tests can swap in a stub via
 * `setFontProviderForTests` to avoid hitting the network.
 */

export type LoadedFont = {
  name: string;
  data: ArrayBuffer;
  weight: number;
  style: "normal" | "italic";
};

export interface FontProvider {
  loadDefault(): Promise<LoadedFont[]>;
}

const INTER_REGULAR_URL =
  "https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcvneQg7Ca725JhhKnNqk4j1ebLhAm8SrXTc2dRykrJgjsMbMA.ttf";
const INTER_BOLD_URL =
  "https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcvneQg7Ca725JhhKnNqk4j1ebLhAm8SrXTc2NRykrJgjsMbMA.ttf";

let cachedFonts: LoadedFont[] | null = null;
let activeProvider: FontProvider = {
  async loadDefault() {
    if (cachedFonts) return cachedFonts;
    const [regular, bold] = await Promise.all([
      fetchFont(INTER_REGULAR_URL),
      fetchFont(INTER_BOLD_URL),
    ]);
    cachedFonts = [
      { name: "Inter", data: regular, weight: 400, style: "normal" },
      { name: "Inter", data: bold, weight: 700, style: "normal" },
    ];
    return cachedFonts;
  },
};

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load font ${url}: ${res.status}`);
  return res.arrayBuffer();
}

export async function loadDefaultFonts(): Promise<LoadedFont[]> {
  return activeProvider.loadDefault();
}

/** Test hook: pass `null` to restore the real provider. */
export function setFontProviderForTests(provider: FontProvider | null) {
  if (!provider) {
    cachedFonts = null;
    activeProvider = {
      async loadDefault() {
        if (cachedFonts) return cachedFonts;
        const [regular, bold] = await Promise.all([
          fetchFont(INTER_REGULAR_URL),
          fetchFont(INTER_BOLD_URL),
        ]);
        cachedFonts = [
          { name: "Inter", data: regular, weight: 400, style: "normal" },
          { name: "Inter", data: bold, weight: 700, style: "normal" },
        ];
        return cachedFonts;
      },
    };
    return;
  }
  cachedFonts = null;
  activeProvider = provider;
}
