import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalStorage, safeKey } from "./storage";

describe("safeKey", () => {
  it("accepts plain relative keys", () => {
    expect(safeKey("2026/10/photo-1a2b.jpg")).toBe("2026/10/photo-1a2b.jpg");
    expect(safeKey(["2026", "10", "a.png"])).toBe("2026/10/a.png");
  });

  it("refuses traversal, absolute paths and odd characters", () => {
    for (const bad of [
      "../etc/passwd",
      "2026/../../x",
      "/abs.png",
      "a//b.png",
      ".env",
      "a/b c.png",
      "",
      "a\\b.png",
    ]) {
      expect(safeKey(bad), bad).toBeNull();
    }
  });
});

describe("LocalStorage", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nordpress-storage-"));
  const store = new LocalStorage(dir);
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("round-trips, streams and removes files", async () => {
    await store.put(
      "2026/10/a.txt",
      new TextEncoder().encode("hello"),
      "text/plain",
    );
    expect(
      new TextDecoder().decode(
        (await store.read("2026/10/a.txt")) ?? undefined,
      ),
    ).toBe("hello");
    const got = await store.get("2026/10/a.txt");
    expect(got?.size).toBe(5);
    expect(await new Response(got?.body).text()).toBe("hello");
    await store.remove("2026/10/a.txt");
    expect(await store.get("2026/10/a.txt")).toBeNull();
  });

  it("refuses to write outside its root", async () => {
    await expect(
      store.put("../escape.txt", new Uint8Array(), "text/plain"),
    ).rejects.toThrow(/Invalid storage key/);
  });
});
