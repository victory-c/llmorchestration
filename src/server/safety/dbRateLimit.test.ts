import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupPglite, resetPgliteSchema, teardownPglite } from "@/server/db/pglite";
import {
  checkDailyRunLimitInDb,
  hashIp,
} from "@/server/safety/dbRateLimit";
import { getDb } from "@/server/db/client";
import { rateLimitEvents } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";

describe("dbRateLimit", () => {
  beforeAll(async () => {
    await setupPglite();
  });
  afterAll(async () => {
    await teardownPglite();
  });
  beforeEach(async () => {
    await resetPgliteSchema();
  });

  it("increments atomically and reports remaining correctly", async () => {
    const ip = "203.0.113.42";
    const limit = 3;

    const r1 = await checkDailyRunLimitInDb({ ip, limit });
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = await checkDailyRunLimitInDb({ ip, limit });
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = await checkDailyRunLimitInDb({ ip, limit });
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    const r4 = await checkDailyRunLimitInDb({ ip, limit });
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it("rolls back the counter when a call exceeds the cap", async () => {
    const ip = "198.51.100.7";
    const limit = 2;
    const now = new Date("2026-04-24T12:00:00Z");
    const day = now.toISOString().slice(0, 10);

    await checkDailyRunLimitInDb({ ip, limit, now });
    await checkDailyRunLimitInDb({ ip, limit, now });
    // Over-limit attempt.
    const blocked = await checkDailyRunLimitInDb({ ip, limit, now });
    expect(blocked.allowed).toBe(false);

    const db = getDb();
    const rows = await db
      .select({ count: rateLimitEvents.count })
      .from(rateLimitEvents)
      .where(
        and(
          eq(rateLimitEvents.ipHash, hashIp(ip)),
          eq(rateLimitEvents.day, day),
        ),
      );
    // After rollback the counter caps at `limit`.
    expect(rows[0]?.count).toBe(limit);

    // Further calls still return blocked without the counter growing.
    const blocked2 = await checkDailyRunLimitInDb({ ip, limit, now });
    expect(blocked2.allowed).toBe(false);
    const rows2 = await db
      .select({ count: rateLimitEvents.count })
      .from(rateLimitEvents)
      .where(
        and(
          eq(rateLimitEvents.ipHash, hashIp(ip)),
          eq(rateLimitEvents.day, day),
        ),
      );
    expect(rows2[0]?.count).toBe(limit);
  });

  it("tracks different IPs independently", async () => {
    const limit = 1;
    const a = await checkDailyRunLimitInDb({ ip: "10.0.0.1", limit });
    const b = await checkDailyRunLimitInDb({ ip: "10.0.0.2", limit });
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);

    const a2 = await checkDailyRunLimitInDb({ ip: "10.0.0.1", limit });
    expect(a2.allowed).toBe(false);
  });

  it("tracks different days independently", async () => {
    const ip = "10.0.0.99";
    const limit = 1;
    const d1 = new Date("2026-04-24T03:00:00Z");
    const d2 = new Date("2026-04-25T03:00:00Z");

    const r1 = await checkDailyRunLimitInDb({ ip, limit, now: d1 });
    expect(r1.allowed).toBe(true);
    const r2 = await checkDailyRunLimitInDb({ ip, limit, now: d1 });
    expect(r2.allowed).toBe(false);

    const r3 = await checkDailyRunLimitInDb({ ip, limit, now: d2 });
    expect(r3.allowed).toBe(true);
  });

  it("hashes the IP — the raw IP never hits the database", async () => {
    const ip = "192.0.2.55";
    await checkDailyRunLimitInDb({ ip, limit: 5 });
    const db = getDb();
    const rows = await db.select().from(rateLimitEvents);
    expect(rows.length).toBe(1);
    expect(rows[0]?.ipHash).not.toContain(ip);
    expect(rows[0]?.ipHash).toBe(hashIp(ip));
  });
});
