import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { localStorage } from "@/server/storage/localStorage";

const TEST_KEY = "__tests__/localStorage-it.bin";

describe("localStorage (dev-only)", () => {
  beforeAll(async () => {
    // Make sure we start with a clean slate.
    await localStorage.delete(TEST_KEY);
  });
  afterAll(async () => {
    await localStorage.delete(TEST_KEY);
  });

  it("writes bytes to public/media and returns a /media URL", async () => {
    const payload = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);
    const res = await localStorage.put(TEST_KEY, payload, "application/octet-stream");
    expect(res.sizeBytes).toBe(4);
    expect(res.url.startsWith("/media/")).toBe(true);

    const absPath = path.join(process.cwd(), "public", "media", TEST_KEY);
    const read = await fs.readFile(absPath);
    expect(read.length).toBe(4);
  });

  it("rejects keys containing .. (path traversal guard)", async () => {
    await expect(
      localStorage.put("../../etc/passwd", new Uint8Array([1]), "text/plain"),
    ).rejects.toThrow(/Invalid storage key/);
  });

  it("delete removes the file and is idempotent", async () => {
    const k = "__tests__/delete-me.bin";
    await localStorage.put(k, new Uint8Array([1, 2, 3]), "application/octet-stream");
    await localStorage.delete(k);
    await localStorage.delete(k); // should not throw
  });
});
