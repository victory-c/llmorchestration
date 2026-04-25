// WARNING: This storage provider writes to ./public/media/ on the local
// filesystem. It is **dev-only** and is not safe in serverless production
// (ephemeral filesystem, no cross-instance sharing). The factory refuses to
// return this provider when process.env.VERCEL is set. See also the boot-time
// guard in src/lib/env.ts.

import fs from "node:fs/promises";
import path from "node:path";
import type {
  StorageProvider,
  StoragePutResult,
} from "@/server/storage/types";

function publicRoot(): string {
  return path.join(process.cwd(), "public", "media");
}

function resolveKey(key: string): string {
  // Prevent path traversal — keys must not include ".." segments.
  if (key.includes("..")) {
    throw new Error(`Invalid storage key (contains ..): ${key}`);
  }
  return path.join(publicRoot(), key);
}

async function ensureDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export const localStorage: StorageProvider = {
  async put(
    key: string,
    bytes: Uint8Array,
    _contentType: string,
  ): Promise<StoragePutResult> {
    const filePath = resolveKey(key);
    await ensureDir(filePath);
    await fs.writeFile(filePath, bytes);
    return {
      key,
      // Served by Next.js static middleware at /media/<key>.
      url: `/media/${key.replace(/^\/+/, "")}`,
      sizeBytes: bytes.byteLength,
    };
  },

  async delete(key: string): Promise<void> {
    const filePath = resolveKey(key);
    await fs.rm(filePath, { force: true });
  },

  async getUrl(key: string): Promise<string> {
    return `/media/${key.replace(/^\/+/, "")}`;
  },
};
