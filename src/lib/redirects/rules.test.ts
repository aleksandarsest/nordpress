import { describe, expect, it } from "vitest";
import {
  createsLoop,
  matchRedirect,
  normalizeSource,
  normalizeTarget,
  parseRedirectCsv,
  pathWords,
} from "./rules";

const rule = (source: string, target: string) => ({
  source,
  target,
  status: 301,
});

describe("normalizing", () => {
  it("cleans what people type", () => {
    expect(normalizeSource("old-post/")).toBe("/old-post");
    expect(normalizeSource("/A//b/?x=1#top")).toBe("/A/b");
    expect(
      normalizeSource("https://example.com/old?y", "https://example.com"),
    ).toBe("/old");
    expect(normalizeSource("/")).toBe("/");
    expect(normalizeSource("/blog/*")).toBe("/blog/*");
  });

  it("refuses rules that would break the site", () => {
    expect(() =>
      normalizeSource("https://other.com/x", "https://example.com"),
    ).toThrow();
    expect(() => normalizeSource("/*")).toThrow();
    expect(() => normalizeSource("/a/*/b")).toThrow();
    expect(() => normalizeSource("/admin/posts")).toThrow();
    expect(() => normalizeSource("/wp-json")).toThrow();
    expect(() => normalizeTarget("javascript:alert(1)")).toThrow();
    expect(() => normalizeTarget("//evil.com")).toThrow();
  });

  it("keeps targets as paths or URLs", () => {
    expect(normalizeTarget("new-post/")).toBe("/new-post");
    expect(normalizeTarget("https://other.com/x")).toBe("https://other.com/x");
  });
});

describe("matchRedirect", () => {
  const rules = [
    rule("/old", "/new"),
    rule("/blog/*", "/news/*"),
    rule("/blog/2019/*", "/archive"),
    rule("/shop-old/*", "https://shop.example.com/"),
  ];

  it("prefers exact matches, then the longest wildcard", () => {
    expect(matchRedirect(rules, "/old")?.to).toBe("/new");
    expect(matchRedirect(rules, "/blog/hello")?.to).toBe("/news/hello");
    expect(matchRedirect(rules, "/blog")?.to).toBe("/news");
    expect(matchRedirect(rules, "/blog/2019/x")?.to).toBe("/archive");
    expect(matchRedirect(rules, "/shop-old/a")?.to).toBe(
      "https://shop.example.com/",
    );
    expect(matchRedirect(rules, "/other")).toBeNull();
    expect(matchRedirect(rules, "/blogger")).toBeNull();
  });

  it("spots loops", () => {
    expect(createsLoop([rule("/a", "/b")], "/b", "/a")).toBe(true);
    expect(createsLoop([rule("/a", "/b")], "/c", "/a")).toBe(false);
    expect(createsLoop([], "/a", "/a")).toBe(true);
  });
});

describe("parseRedirectCsv", () => {
  it("reads Redirection plugin exports", () => {
    const { rows, invalid } = parseRedirectCsv(
      'source,target,regex,code\n"/old-one","/new-one",0,301\n/temp,/later,0,302\nbroken\n',
    );
    expect(rows).toEqual([
      { source: "/old-one", target: "/new-one", status: 301 },
      { source: "/temp", target: "/later", status: 302 },
    ]);
    expect(invalid).toEqual(["broken"]);
  });
});

describe("pathWords", () => {
  it("keeps the meaningful words", () => {
    expect(pathWords("/2019/05/better-coffee-at-home.html")).toEqual([
      "better",
      "coffee",
      "home",
    ]);
  });
});
