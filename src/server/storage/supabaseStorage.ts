// Supabase Storage adapter. Kept as a thin stub in M5; install
// @supabase/supabase-js and implement before promoting STORAGE_PROVIDER=supabase
// in production. The factory surface is wired up so self-hosters have a clear
// migration target.

import { GatewayConfigError } from "@/server/gateways/errors";
import type { StorageProvider } from "@/server/storage/types";

export const supabaseStorage: StorageProvider = {
  async put() {
    throw new GatewayConfigError(
      "Supabase Storage adapter is not implemented yet. Install @supabase/supabase-js and finish src/server/storage/supabaseStorage.ts, or use STORAGE_PROVIDER=vercel-blob / local.",
    );
  },
  async delete() {
    throw new GatewayConfigError(
      "Supabase Storage adapter is not implemented yet.",
    );
  },
  async getUrl() {
    throw new GatewayConfigError(
      "Supabase Storage adapter is not implemented yet.",
    );
  },
};
