// WARNING: Dev-only in-memory MediaAssetRepository. Lost on process restart
// and not shared across serverless instances. Used when DATABASE_URL is unset.

import type {
  CreateMediaAssetInput,
  MediaAsset,
  MediaAssetRepository,
  MediaAssetType,
  UpdateMediaAssetInput,
} from "@/server/media/types";

declare global {
  // eslint-disable-next-line no-var
  var __arenaMediaAssets: Map<string, MediaAsset> | undefined;
}

function table(): Map<string, MediaAsset> {
  if (!globalThis.__arenaMediaAssets)
    globalThis.__arenaMediaAssets = new Map();
  return globalThis.__arenaMediaAssets;
}

export const memoryAssets: MediaAssetRepository = {
  async create(input: CreateMediaAssetInput): Promise<MediaAsset> {
    const asset: MediaAsset = { ...input, createdAt: new Date().toISOString() };
    table().set(asset.id, asset);
    return asset;
  },
  async update(id: string, patch: UpdateMediaAssetInput): Promise<MediaAsset> {
    const existing = table().get(id);
    if (!existing) throw new Error(`Media asset not found: ${id}`);
    const updated: MediaAsset = { ...existing, ...patch };
    table().set(id, updated);
    return updated;
  },
  async findById(id: string): Promise<MediaAsset | null> {
    return table().get(id) ?? null;
  },
  async listForRun(
    runId: string,
    type?: MediaAssetType,
  ): Promise<MediaAsset[]> {
    const out: MediaAsset[] = [];
    for (const a of table().values()) {
      if (a.runId !== runId) continue;
      if (type && a.type !== type) continue;
      out.push(a);
    }
    return out.sort((a, b) => {
      if (a.messageId !== b.messageId) {
        return (a.messageId ?? "").localeCompare(b.messageId ?? "");
      }
      return a.sequenceIndex - b.sequenceIndex;
    });
  },
  async listForMessage(messageId: string): Promise<MediaAsset[]> {
    const out: MediaAsset[] = [];
    for (const a of table().values()) {
      if (a.messageId === messageId) out.push(a);
    }
    return out.sort((a, b) => a.sequenceIndex - b.sequenceIndex);
  },
  async deleteForRun(runId: string): Promise<number> {
    let n = 0;
    for (const [id, a] of table().entries()) {
      if (a.runId === runId) {
        table().delete(id);
        n++;
      }
    }
    return n;
  },
};

export function resetMemoryAssetsForTests(): void {
  globalThis.__arenaMediaAssets = new Map();
}
