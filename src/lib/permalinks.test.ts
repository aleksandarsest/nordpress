import { describe, expect, it } from "vitest";
import { postPath, resolveRoute } from "./permalinks";

const post = {
  id: 42,
  type: "post",
  slug: "hello-world",
  publishedAt: new Date("2026-03-05T12:00:00Z"),
};

describe("postPath", () => {
  it("builds each permalink structure", () => {
    expect(postPath(post, "postname")).toBe("/hello-world");
    expect(postPath(post, "dated")).toBe("/2026/03/hello-world");
    expect(postPath(post, "archive")).toBe("/archives/42");
    expect(postPath(post, "plain")).toBe("/?p=42");
  });

  it("uses the full hierarchy for pages", () => {
    const page = { ...post, type: "page", slug: "team" };
    expect(postPath(page, "dated", "about/team")).toBe("/about/team");
  });
});

describe("resolveRoute", () => {
  it("resolves the front page and pagination", () => {
    expect(resolveRoute([], {})).toEqual({ kind: "home", page: 1 });
    expect(resolveRoute(["page", "3"], {})).toEqual({ kind: "home", page: 3 });
  });

  it("resolves query-string permalinks", () => {
    expect(resolveRoute([], { p: "42" })).toEqual({ kind: "single", id: 42 });
    expect(resolveRoute([], { s: " ai " })).toEqual({
      kind: "search",
      query: "ai",
      page: 1,
    });
  });

  it("resolves taxonomy archives, including nested categories", () => {
    expect(resolveRoute(["tag", "news", "page", "2"], {})).toEqual({
      kind: "term",
      taxonomy: "post_tag",
      slug: "news",
      page: 2,
    });
    expect(resolveRoute(["category", "parent", "child"], {})).toMatchObject({
      taxonomy: "category",
      slug: "child",
    });
  });

  it("resolves dated permalinks and date archives", () => {
    expect(resolveRoute(["2026", "03", "hello-world"], {})).toEqual({
      kind: "dated",
      year: 2026,
      month: 3,
      slug: "hello-world",
    });
    expect(resolveRoute(["2026"], {})).toEqual({
      kind: "date-archive",
      year: 2026,
      page: 1,
    });
  });

  it("treats anything else as a slug path", () => {
    expect(resolveRoute(["about", "team"], {})).toEqual({
      kind: "slug",
      slugs: ["about", "team"],
    });
  });
});
