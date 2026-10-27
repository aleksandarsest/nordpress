import { describe, expect, it, vi } from "vitest";

vi.mock("../session", () => ({ getViewer: async () => null }));
vi.mock("../app-passwords", () => ({ authenticateBasic: async () => null }));

const {
  idList,
  intParam,
  pagination,
  pickFields,
  rawText,
  RestError,
  toResponse,
  wpDates,
} = await import("./core");

describe("parameter parsing", () => {
  it("parses id lists from strings and arrays", () => {
    expect(idList("1, 2,3", "include")).toEqual([1, 2, 3]);
    expect(idList(["4", 5], "include")).toEqual([4, 5]);
    expect(idList(undefined, "include")).toBeUndefined();
    expect(() => idList("1,x", "include")).toThrow(RestError);
  });

  it("validates integers", () => {
    expect(intParam("7", "page")).toBe(7);
    expect(intParam("", "page", 1)).toBe(1);
    expect(() => intParam("1.5", "page")).toThrow("Invalid parameter(s): page");
  });

  it("bounds per_page like WordPress", () => {
    expect(pagination(new URLSearchParams("page=2&per_page=5"))).toEqual({
      page: 2,
      perPage: 5,
      offset: 5,
    });
    expect(() => pagination(new URLSearchParams("per_page=101"))).toThrow(
      RestError,
    );
  });

  it("accepts both plain text and { raw } objects", () => {
    expect(rawText("Hi")).toBe("Hi");
    expect(rawText({ raw: "Hi" })).toBe("Hi");
    expect(rawText(undefined)).toBeUndefined();
  });
});

describe("responses", () => {
  it("filters top-level fields with _fields", () => {
    expect(
      pickFields([{ id: 1, title: "a", slug: "b" }], "id,title.rendered"),
    ).toEqual([{ id: 1, title: "a" }]);
  });

  it("adds WordPress pagination headers and links", () => {
    const res = toResponse(
      { data: [], total: 25, pages: 3 },
      new Request("http://x.test/wp-json/wp/v2/posts?page=2"),
    );
    expect(res.headers.get("X-WP-Total")).toBe("25");
    expect(res.headers.get("X-WP-TotalPages")).toBe("3");
    expect(res.headers.get("Link")).toContain('page=1>; rel="prev"');
    expect(res.headers.get("Link")).toContain('page=3>; rel="next"');
  });

  it("formats dates as local and GMT without offsets", () => {
    expect(
      wpDates(new Date("2026-07-01T10:00:00Z"), "Europe/Belgrade"),
    ).toEqual({
      local: "2026-07-01T12:00:00",
      gmt: "2026-07-01T10:00:00",
    });
  });
});
