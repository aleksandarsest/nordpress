import { describe, expect, it } from "vitest";
import { decodeEntities, type LiveSite, liveToWxr } from "./live";

const site: LiveSite = {
  site: {
    name: "Old &amp; Gold",
    description: "Notes",
    url: "https://old.example.com",
    home: "https://old.example.com/",
  },
  categories: [
    { id: 2, name: "Travel", slug: "travel" },
    { id: 3, name: "Guides", slug: "guides", parent: 2 },
  ],
  tags: [{ id: 5, name: "Italy", slug: "italy" }],
  users: [{ id: 1, name: "Jane Doe", slug: "jane" }],
  posts: [
    {
      id: 10,
      type: "post",
      slug: "rome-in-three-days",
      link: "https://old.example.com/rome-in-three-days/",
      guid: { rendered: "https://old.example.com/?p=10" },
      date_gmt: "2024-05-01T09:30:00",
      title: { rendered: "Rome &#8211; Don&#8217;t rush" },
      content: { rendered: "<p>Day one.</p>" },
      excerpt: { rendered: "<p>Three days &hellip;</p>\n" },
      author: 1,
      comment_status: "open",
      sticky: true,
      featured_media: 20,
      categories: [3],
      tags: [5],
    },
    {
      id: 11,
      type: "post",
      slug: "secret",
      link: "https://old.example.com/secret/",
      title: { rendered: "Secret" },
      content: { rendered: "", protected: true },
      excerpt: { rendered: "", protected: true },
    },
  ],
  pages: [
    {
      id: 2,
      type: "page",
      slug: "about",
      link: "https://old.example.com/about/",
      title: { rendered: "About" },
      content: { rendered: "<p>Hi</p>" },
      menu_order: 3,
      comment_status: "closed",
    },
  ],
  media: [
    {
      id: 20,
      slug: "colosseum",
      source_url: "https://old.example.com/wp-content/uploads/colosseum.jpg",
      alt_text: "The Colosseum at dusk",
      title: { rendered: "colosseum" },
      caption: { rendered: "<p>Rome, 2024</p>" },
    },
  ],
  comments: [
    {
      id: 1,
      post: 10,
      author_name: "Ana",
      content: { rendered: "<p>Lovely</p>" },
      date_gmt: "2024-05-02T10:00:00",
    },
    {
      id: 2,
      post: 10,
      parent: 1,
      author_name: "Jane",
      author: 1,
      content: { rendered: "<p>Thanks!</p>" },
    },
  ],
};

describe("decodeEntities", () => {
  it("decodes numeric and named entities", () => {
    expect(decodeEntities("Don&#8217;t &amp; &#x2014; &hellip; &bogus;")).toBe(
      "Don’t & — … &bogus;",
    );
  });
});

describe("liveToWxr", () => {
  const wxr = liveToWxr(site);

  it("maps the site, terms and authors", () => {
    expect(wxr.site).toEqual({
      title: "Old & Gold",
      link: "https://old.example.com",
      description: "Notes",
      baseSiteUrl: "https://old.example.com",
    });
    expect(wxr.categories.map((c) => [c.slug, c.parent])).toEqual([
      ["travel", ""],
      ["guides", "travel"],
    ]);
    expect(wxr.authors).toEqual([
      { id: 1, login: "jane", email: "", displayName: "Jane Doe" },
    ]);
  });

  it("maps posts with terms, featured image and threaded comments", () => {
    const post = wxr.items.find((i) => i.id === 10);
    expect(post).toMatchObject({
      type: "post",
      title: "Rome – Don’t rush",
      excerpt: "Three days …",
      creator: "jane",
      sticky: true,
      categories: ["guides"],
      tags: ["italy"],
      meta: { _thumbnail_id: "20" },
      dateGmt: new Date("2024-05-01T09:30:00Z"),
    });
    expect(post?.comments.map((c) => [c.id, c.parentId, c.approved])).toEqual([
      [1, 0, "1"],
      [2, 1, "1"],
    ]);
  });

  it("imports protected posts as private, without content", () => {
    const secret = wxr.items.find((i) => i.id === 11);
    expect(secret).toMatchObject({ content: "", password: "protected" });
  });

  it("maps pages and media", () => {
    expect(wxr.items.find((i) => i.id === 2)).toMatchObject({
      type: "page",
      menuOrder: 3,
      commentStatus: "closed",
    });
    expect(wxr.items.find((i) => i.id === 20)).toMatchObject({
      type: "attachment",
      attachmentUrl: "https://old.example.com/wp-content/uploads/colosseum.jpg",
      excerpt: "Rome, 2024",
      meta: { _wp_attachment_image_alt: "The Colosseum at dusk" },
    });
  });
});
