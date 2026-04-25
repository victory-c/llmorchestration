import { hasDatabaseUrl } from "@/server/db/client";
import { dbAssets } from "@/server/media/dbAssets";
import { memoryAssets } from "@/server/media/memoryAssets";
import type { MediaAssetRepository } from "@/server/media/types";

let override: MediaAssetRepository | null = null;

export function getMediaAssets(): MediaAssetRepository {
  if (override) return override;
  return hasDatabaseUrl() ? dbAssets : memoryAssets;
}

export function setMediaAssetsForTests(
  provider: MediaAssetRepository | null,
): void {
  override = provider;
}
