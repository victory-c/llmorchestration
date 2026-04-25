import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/server/db/schema";
import { getEnv } from "@/lib/env";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  // eslint-disable-next-line no-var
  var __arenaDb: { db: Db; sql: ReturnType<typeof postgres> } | undefined;
}

export function hasDatabaseUrl(): boolean {
  if (globalThis.__arenaDb) return true;
  return Boolean(getEnv().DATABASE_URL);
}

export function getDb(): Db {
  if (globalThis.__arenaDb) return globalThis.__arenaDb.db;
  const env = getEnv();
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Either configure it or run in memory-only mode.",
    );
  }
  const sql = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
    prepare: false,
  });
  const db = drizzle(sql, { schema });
  globalThis.__arenaDb = { db, sql };
  return db;
}

export async function closeDb(): Promise<void> {
  if (!globalThis.__arenaDb) return;
  await globalThis.__arenaDb.sql.end({ timeout: 5 });
  globalThis.__arenaDb = undefined;
}

// Allow tests and pglite to inject a driver-agnostic DB
export function setDbForTests(db: Db): void {
  globalThis.__arenaDb = {
    db,
    sql: {
      end: async () => {},
    } as unknown as ReturnType<typeof postgres>,
  };
}

export function resetDbForTests(): void {
  globalThis.__arenaDb = undefined;
}
