import { put, del } from "@vercel/blob";
import { getEnv } from "@/lib/env";
import { GatewayConfigError } from "@/server/gateways/errors";
import type {
  StorageProvider,
  StoragePutResult,
} from "@/server/storage/types";

// Vercel Blob storage adapter. Uses BLOB_READ_WRITE_TOKEN in local dev; in
// Vercel deployments the token is auto-injected.
export const vercelBlobStorage: StorageProvider = {
  async put(
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<StoragePutResult> {
    const env = getEnv();
    if (!env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL) {
      throw new GatewayConfigError(
        "BLOB_READ_WRITE_TOKEN is not set. Configure it in .env.local, or deploy on Vercel with a Blob store attached.",
      );
    }
    // @vercel/blob's `put` accepts Node Buffer; wrap the Uint8Array so TS is happy.
    const result = await put(key, Buffer.from(bytes), {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      token: env.BLOB_READ_WRITE_TOKEN,
    });
    return {
      key,
      url: result.url,
      sizeBytes: bytes.byteLength,
    };
  },

  async delete(key: string): Promise<void> {
    const env = getEnv();
    await del(key, { token: env.BLOB_READ_WRITE_TOKEN });
  },

  async getUrl(_key: string): Promise<string> {
    // Vercel Blob public URLs live under a stable hostname tied to the store.
    // Callers typically persist the URL returned from put(); this helper is
    // only used for keys where we don't have the URL on hand (regenerate).
    throw new GatewayConfigError(
      "vercelBlobStorage.getUrl: not supported — persist the URL returned by put() and read it from the media_assets row.",
    );
  },
};
