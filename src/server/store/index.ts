import type { RunRepository } from "@/server/store/types";
import { memoryStore } from "@/server/store/memoryStore";
import { dbStore } from "@/server/store/dbStore";
import { hasDatabaseUrl } from "@/server/db/client";

let override: RunRepository | null = null;

export function getRunStore(): RunRepository {
  if (override) return override;
  return hasDatabaseUrl() ? dbStore : memoryStore;
}

export function setRunStoreForTests(store: RunRepository | null) {
  override = store;
}
