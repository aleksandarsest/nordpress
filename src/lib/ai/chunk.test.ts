import { describe, expect, it } from "vitest";
import { chunkPost, fuseRankings } from "./chunk";

describe("chunkPost", () => {
  it("keeps short posts in one passage, prefixed with the title", () => {
    expect(chunkPost("Hello", "First.\n\nSecond.")).toEqual([
      { index: 0, content: "Hello\n\nFirst.\n\nSecond." },
    ]);
  });

  it("splits on paragraph boundaries and overlaps one paragraph", () => {
    const para = (n: number) => `${"word ".repeat(40).trim()} ${n}.`;
    const text = [1, 2, 3, 4, 5].map(para).join("\n\n");
    const chunks = chunkPost("T", text, { maxChars: 500 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(500);
    // The last paragraph of one chunk opens the next
    const lastOfFirst = chunks[0].content.split("\n\n").at(-1);
    expect(chunks[1].content.split("\n\n")[1]).toBe(lastOfFirst);
  });

  it("splits a single huge paragraph by sentences", () => {
    const text = "This is a sentence. ".repeat(200);
    const chunks = chunkPost("", text, { maxChars: 300 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(300);
  });

  it("returns the title alone for an empty body, or nothing at all", () => {
    expect(chunkPost("Only a title", "")).toEqual([
      { index: 0, content: "Only a title" },
    ]);
    expect(chunkPost("", "  ")).toEqual([]);
  });
});

describe("fuseRankings", () => {
  it("favors items ranked well in several lists", () => {
    expect(
      fuseRankings([
        [1, 2, 3],
        [3, 1, 4],
      ]),
    ).toEqual([1, 3, 2, 4]);
  });
});
