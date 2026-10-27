import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { autop, cleanContent, parentsFirst, parseWxr } from "./wxr";

const xml = readFileSync(
  new URL("./fixtures/sample.xml", import.meta.url),
  "utf8",
);

describe("parseWxr", () => {
  const wxr = parseWxr(xml);

  it("reads site info and authors", () => {
    expect(wxr.site).toMatchObject({
      title: "Old Blog",
      description: "Thoughts & notes",
      baseSiteUrl: "https://old.example.com",
    });
    expect(wxr.authors).toEqual([
      {
        id: 1,
        login: "jane",
        email: "jane@example.com",
        displayName: "Jane Doe",
      },
      { id: 2, login: "bob", email: "bob@example.com", displayName: "Bob" },
    ]);
  });

  it("reads categories, tags and generic terms", () => {
    expect(wxr.categories.map((c) => [c.slug, c.parent])).toEqual([
      ["guides", "travel"],
      ["travel", ""],
    ]);
    expect(wxr.tags.map((t) => t.slug)).toEqual(["italy", "food"]);
  });

  it("reads posts with terms, meta, dates and comments", () => {
    const post = wxr.items.find((i) => i.id === 10);
    expect(post).toMatchObject({
      type: "post",
      status: "publish",
      slug: "rome-in-three-days",
      creator: "jane",
      excerpt: "A quick itinerary.",
      sticky: true,
      categories: ["guides"],
      tags: ["italy", "food"],
      meta: { _thumbnail_id: "20" },
    });
    expect(post?.dateGmt?.toISOString()).toBe("2024-05-01T09:30:00.000Z");
    expect(post?.comments.map((c) => [c.id, c.parentId, c.approved])).toEqual([
      [100, 0, "1"],
      [101, 100, "1"],
      [102, 0, "spam"],
    ]);
  });

  it("reads attachments and other item types", () => {
    const att = wxr.items.find((i) => i.type === "attachment");
    expect(att).toMatchObject({
      id: 20,
      attachmentUrl:
        "https://old.example.com/wp-content/uploads/2024/05/colosseum.jpg",
    });
    expect(att?.meta._wp_attachment_image_alt).toBe("The Colosseum at sunrise");
    expect(wxr.items.some((i) => i.type === "nav_menu_item")).toBe(true);
  });

  it("rejects files that aren't WXR", () => {
    expect(() =>
      parseWxr("<rss><channel><title>x</title></channel></rss>"),
    ).toThrow(/WordPress export/);
  });
});

describe("helpers", () => {
  it("orders parent categories first", () => {
    const terms = parentsFirst(parseWxr(xml).categories);
    expect(terms.map((t) => t.slug)).toEqual(["travel", "guides"]);
  });

  it("strips block comments and keeps the markup", () => {
    expect(
      cleanContent("<!-- wp:paragraph -->\n<p>Hi</p>\n<!-- /wp:paragraph -->"),
    ).toBe("<p>Hi</p>");
    expect(
      cleanContent('[caption id="1"]<img src="a.jpg"> A cat[/caption]'),
    ).toBe('<img src="a.jpg"><p><em>A cat</em></p>');
  });

  it("adds paragraphs to classic-editor text only", () => {
    expect(autop("One\n\nTwo\nlines")).toBe("<p>One</p>\n<p>Two<br>lines</p>");
    expect(autop("<p>Already</p>")).toBe("<p>Already</p>");
  });
});
