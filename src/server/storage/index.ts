import { getEnv } from "@/lib/env";
import { GatewayConfigError } from "@/server/gateways/errors";
import type {
  StorageProvider,
  StorageProviderName,
} from "@/server/storage/types";
import { localStorage } from "@/server/storage/localStorage";
import { vercelBlobStorage } from "@/server/storage/vercelBlob";
import { supabaseStorage } from "@/server/storage/supabaseStorage";

let override: StorageProvider | null = null;

// Picks the configured storage provider with the hosted-safety guard:
// STORAGE_PROVIDER=local is rejected when deployed on Vercel (filesystem is
// ephemeral and not shared across instances).
export function getStorage(): StorageProvider {
  if (override) return override;
  const env = getEnv();
  return resolveProvider(env.STORAGE_PROVIDER);
}

function resolveProvider(name: StorageProviderName): StorageProvider {
  switch (name) {
    case "local":
      if (process.env.VERCEL) {
        throw new GatewayConfigError(
          "STORAGE_PROVIDER=local is not allowed on Vercel. Use vercel-blob or supabase.",
        );
      }
      return localStorage;
    case "vercel-blob":
      return vercelBlobStorage;
    case "supabase":
      return supabaseStorage;
    case "s3":
    case "r2":
      throw new GatewayConfigError(
        `Storage provider "${name}" is not yet implemented. Use local, vercel-blob, or supabase.`,
      );
    default: {
      const _exhaustive: never = name;
      throw new GatewayConfigError(`Unknown storage provider: ${_exhaustive}`);
    }
  }
}

export function setStorageForTests(provider: StorageProvider | null): void {
  override = provider;
}
