// pglite test harness. Spins up an in-memory Postgres-compatible database
// and wires it into the drizzle client used by the app. Call setupPglite()
// in a test beforeAll; call teardownPglite() in afterAll.

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/server/db/schema";
import { INITIAL_SCHEMA_SQL } from "@/server/db/initialSql";
import {
  setDbForTests,
  resetDbForTests,
  type Db,
} from "@/server/db/client";
import { dbStore } from "@/server/store/dbStore";
import { dbQueue } from "@/server/jobs/dbQueue";
import { dbAssets } from "@/server/media/dbAssets";
import { setRunStoreForTests } from "@/server/store";
import { setJobQueueForTests } from "@/server/jobs";
import { setMediaAssetsForTests } from "@/server/media";

let currentClient: PGlite | null = null;

export async function setupPglite(): Promise<Db> {
  const client = new PGlite();
  await client.exec(INITIAL_SCHEMA_SQL);
  const db = drizzle(client, { schema }) as unknown as Db;
  setDbForTests(db);
  setRunStoreForTests(dbStore);
  setJobQueueForTests(dbQueue);
  setMediaAssetsForTests(dbAssets);
  currentClient = client;
  return db;
}

export async function resetPgliteSchema(): Promise<void> {
  if (!currentClient) return;
  await currentClient.exec(`
    TRUNCATE TABLE rate_limit_events CASCADE;
    TRUNCATE TABLE jobs CASCADE;
    TRUNCATE TABLE usage_events CASCADE;
    TRUNCATE TABLE media_assets CASCADE;
    TRUNCATE TABLE state_snapshots CASCADE;
    TRUNCATE TABLE messages CASCADE;
    TRUNCATE TABLE participants CASCADE;
    TRUNCATE TABLE runs CASCADE;
    TRUNCATE TABLE scenarios CASCADE;
    TRUNCATE TABLE users CASCADE;
  `);
}

export async function teardownPglite(): Promise<void> {
  if (currentClient) {
    await currentClient.close();
    currentClient = null;
  }
  resetDbForTests();
  setRunStoreForTests(null);
  setJobQueueForTests(null);
  setMediaAssetsForTests(null);
}
