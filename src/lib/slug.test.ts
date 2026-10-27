import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("lowercases, strips accents and joins words with dashes", () => {
    expect(slugify("Héllo, Wörld! It’s Here")).toBe("hello-world-its-here");
  });

  it("returns an empty string when nothing usable remains", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("uniqueSlug", () => {
  it("appends a counter until the slug is free", async () => {
    const taken = new Set(["hello", "hello-2"]);
    expect(await uniqueSlug("Hello", async (s) => taken.has(s))).toBe(
      "hello-3",
    );
  });

  it("falls back to 'untitled'", async () => {
    expect(await uniqueSlug("", async () => false)).toBe("untitled");
  });
});
