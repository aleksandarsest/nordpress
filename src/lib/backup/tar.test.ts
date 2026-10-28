import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readAll, readTar, TAR_END, tarHeader, tarPadding } from "./tar";

const text = (s: string) => new TextEncoder().encode(s);

function archive(files: [string, Uint8Array][]) {
  const parts: Uint8Array[] = [];
  for (const [name, bytes] of files) {
    parts.push(tarHeader(name, bytes.length), bytes, tarPadding(bytes.length));
  }
  parts.push(TAR_END);
  return parts;
}

// Feeds the archive in awkward chunk sizes, like a network stream would
async function* chunked(parts: Uint8Array[], size = 333) {
  const all = Buffer.concat(parts);
  for (let i = 0; i < all.length; i += size) yield all.subarray(i, i + size);
}

const longName = `uploads/${"a".repeat(90)}/${"b".repeat(60)}/photo.jpg`;
const files: [string, Uint8Array][] = [
  ["backup.json", text('{"format":1}')],
  ["db/posts.0001.ndjson", text('{"id":1}\n{"id":2}\n')],
  ["empty.txt", new Uint8Array(0)],
  [longName, new Uint8Array(1500).fill(7)],
];

describe("tar", () => {
  it("reads back what it writes, across chunk boundaries", async () => {
    const seen: [string, Uint8Array][] = [];
    for await (const entry of readTar(chunked(archive(files)))) {
      seen.push([entry.name, await readAll(entry.body)]);
    }
    expect(seen.map(([n]) => n)).toEqual(files.map(([n]) => n));
    for (const [i, [, bytes]] of seen.entries())
      expect(Buffer.from(bytes).equals(Buffer.from(files[i][1]))).toBe(true);
  });

  it("skips entries the reader doesn't read", async () => {
    const names: string[] = [];
    for await (const entry of readTar(chunked(archive(files), 100)))
      names.push(entry.name);
    expect(names).toHaveLength(4);
  });

  it("rejects files that aren't archives", async () => {
    const junk = [new Uint8Array(1024).fill(65)];
    await expect(async () => {
      for await (const _ of readTar(chunked(junk))) {
        // read nothing
      }
    }).rejects.toThrow(/valid backup/);
  });

  it("writes archives the system tar can read", () => {
    const probe = spawnSync("tar", ["--version"]);
    if (probe.status !== 0) return;
    const dir = mkdtempSync(path.join(tmpdir(), "nordpress-tar-"));
    try {
      const file = path.join(dir, "test.tar");
      writeFileSync(file, Buffer.concat(archive(files)));
      const list = spawnSync("tar", ["-tf", file], { encoding: "utf8" });
      expect(list.stdout.trim().split("\n")).toEqual(files.map(([n]) => n));
      const out = path.join(dir, "out");
      spawnSync("mkdir", [out]);
      spawnSync("tar", ["-xf", file, "-C", out]);
      expect(readFileSync(path.join(out, "db/posts.0001.ndjson"), "utf8")).toBe(
        '{"id":1}\n{"id":2}\n',
      );
      expect(readFileSync(path.join(out, longName)).length).toBe(1500);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
