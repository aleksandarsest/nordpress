import { describe, expect, it } from "vitest";
import { cleanSeo, postMetadata, seoOf } from "./seo";

const base = {
  title: "Better coffee",
  description: "How to brew it.",
  url: "https://example.com/better-coffee",
  type: "post" as const,
  seo: {},
  image: null,
  publishedAt: new Date("2026-10-01T10:00:00Z"),
  modifiedAt: new Date("2026-10-02T10:00:00Z"),
  author: "Ana",
  siteName: "Example",
};

describe("seoOf and cleanSeo", () => {
  it("reads only valid fields", () => {
    expect(seoOf(null)).toEqual({});
    expect(
      seoOf({
        seo: { title: "  T ", description: "", imageId: -1, noindex: "yes" },
      }),
    ).toEqual({ title: "T" });
  });

  it("cleans input, dropping empty values", () => {
    expect(
      cleanSeo({
        title: "A\n  title",
        description: "",
        imageId: 4,
        noindex: false,
      }),
    ).toEqual({ title: "A title", imageId: 4 });
  });
});

describe("postMetadata", () => {
  it("falls back to the post's title and excerpt", () => {
    const m = postMetadata(base);
    expect(m.title).toBe("Better coffee");
    expect(m.description).toBe("How to brew it.");
    expect(m.robots).toBeUndefined();
    expect(m.openGraph).toMatchObject({
      type: "article",
      publishedTime: "2026-10-01T10:00:00.000Z",
      authors: ["Ana"],
    });
    expect(m.twitter).toMatchObject({ card: "summary" });
  });

  it("uses SEO fields, the image and noindex", () => {
    const m = postMetadata({
      ...base,
      seo: {
        title: "Brew better coffee at home",
        description: "Short.",
        noindex: true,
      },
      image: {
        url: "https://example.com/uploads/a.jpg",
        width: 1200,
        height: 630,
      },
    });
    expect(m.title).toEqual({ absolute: "Brew better coffee at home" });
    expect(m.description).toBe("Short.");
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.openGraph).toMatchObject({
      title: "Brew better coffee at home",
      images: [
        { url: "https://example.com/uploads/a.jpg", width: 1200, height: 630 },
      ],
    });
    expect(m.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("describes pages as websites", () => {
    expect(postMetadata({ ...base, type: "page" }).openGraph).toMatchObject({
      type: "website",
    });
  });
});
