import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  checkRunOwnership,
  isAuthorizedRunToken,
  ownerCookieName,
  setRunOwnerToken,
} from "@/server/store/ownerAuth";
import { dbStore } from "@/server/store/dbStore";
import { createRunFromTemplate } from "@/server/engine/createRun";
import { findTemplate } from "@/server/scenarios/templates";
import { defaultMockParticipants } from "@/server/scenarios/mockParticipants";
import {
  setupPglite,
  teardownPglite,
  resetPgliteSchema,
} from "@/server/db/pglite";

function reqWithCookie(cookie: string): Request {
  return new Request("http://localhost/api/runs/x", {
    headers: { cookie },
  });
}

describe("ownerAuth (pglite)", () => {
  beforeAll(async () => {
    await setupPglite();
  });
  afterAll(async () => {
    await teardownPglite();
  });
  beforeEach(async () => {
    await resetPgliteSchema();
  });

  const planeCrash = findTemplate("plane-crash")!;

  async function newRun(): Promise<string> {
    const stored = await createRunFromTemplate(
      { template: planeCrash, participants: defaultMockParticipants.slice(0, 2) },
      dbStore,
    );
    return stored.state.runId;
  }

  it("treats an unowned run as accessible (backwards-compat)", async () => {
    const runId = await newRun();
    expect(await isAuthorizedRunToken(runId, undefined)).toBe(true);
    expect(await isAuthorizedRunToken(runId, "anything")).toBe(true);
  });

  it("denies access to an unknown run id", async () => {
    expect(await isAuthorizedRunToken("does-not-exist", "x")).toBe(false);
  });

  it("requires the matching owner token once a run is owned", async () => {
    const runId = await newRun();
    await setRunOwnerToken(runId, "secret-token");

    expect(await isAuthorizedRunToken(runId, "secret-token")).toBe(true);
    expect(await isAuthorizedRunToken(runId, "wrong-token")).toBe(false);
    expect(await isAuthorizedRunToken(runId, undefined)).toBe(false);
  });

  it("checkRunOwnership reads the owner cookie", async () => {
    const runId = await newRun();
    await setRunOwnerToken(runId, "cookie-secret");

    const good = reqWithCookie(`${ownerCookieName(runId)}=cookie-secret`);
    const bad = reqWithCookie(`${ownerCookieName(runId)}=nope`);
    const none = reqWithCookie("unrelated=1");

    expect(await checkRunOwnership(runId, good)).toBe(true);
    expect(await checkRunOwnership(runId, bad)).toBe(false);
    expect(await checkRunOwnership(runId, none)).toBe(false);
  });
});
