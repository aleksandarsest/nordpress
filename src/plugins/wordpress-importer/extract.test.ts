import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { crawlable, extractPage, sitemapUrls } from "./extract";

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "fixtures", name), "utf8");

describe("extractPage", () => {
  const home = extractPage(
    fixture("builder-home.html"),
    "https://pekara.example/",
  );

  it("reads the title without the site name, and the description", () => {
    expect(home.title).toBe("Home");
    expect(home.siteName).toBe("Pekara Sunce");
    expect(home.description).toBe("Sourdough bakery in Ljubljana.");
    expect(home.themeColor).toBe("#b5542d");
  });

  it("keeps the main content and drops menus, banners, scripts and footers", () => {
    expect(home.html).toContain("Two sisters bake every loaf by hand.");
    // The home page's slogan stays, as a heading the editor allows
    expect(home.html).toContain("<h2>Fresh sourdough every morning</h2>");
    expect(home.html).not.toMatch(
      /cookies|Privacy|<script|<style|Instagram|<nav/,
    );
  });

  it("finds real images, the widest version, and skips icons and pixels", () => {
    expect(home.images).toEqual([
      "https://pekara.example/images/bread.jpg",
      "https://pekara.example/images/shop-1600.jpg",
    ]);
    expect(home.html).toContain(
      'src="https://pekara.example/images/bread.jpg"',
    );
  });

  it("reads the menu and the logo", () => {
    expect(home.nav).toEqual([
      { label: "Home", url: "https://pekara.example/" },
      { label: "About us", url: "https://pekara.example/about-us" },
      { label: "Menu", url: "https://pekara.example/menu" },
    ]);
    expect(home.logo).toBe("https://pekara.example/assets/logo.png");
    expect(home.links).toContain("https://pekara.example/blog/why-sourdough");
    expect(home.links).not.toContain("https://pekara.example/cart");
  });

  it("recognizes a blog post and its date", () => {
    const post = extractPage(
      fixture("builder-post.html"),
      "https://pekara.example/blog/why-sourdough",
    );
    expect(post.isPost).toBe(true);
    expect(post.date?.toISOString()).toBe("2025-03-14T09:00:00.000Z");
    expect(post.title).toBe("Why sourdough");
    expect(post.html).toContain("<h2>The starter</h2>");
    expect(post.html).not.toMatch(/<h1|Share|Related/);
  });
});

describe("crawlable", () => {
  const base = new URL("https://www.pekara.example/");
  it("keeps same-site pages and normalizes them", () => {
    expect(crawlable("/about/?x=1#top", base)).toBe(
      "https://www.pekara.example/about",
    );
    expect(crawlable("https://pekara.example/menu/", base)).toBe(
      "https://www.pekara.example/menu",
    );
  });
  it("skips other sites, files and shop or account pages", () => {
    expect(crawlable("https://other.example/", base)).toBeNull();
    expect(crawlable("/menu.pdf", base)).toBeNull();
    expect(crawlable("/cart", base)).toBeNull();
    expect(crawlable("mailto:hi@x.example", base)).toBeNull();
    expect(crawlable("javascript:alert(1)", base)).toBeNull();
  });
});

describe("sitemapUrls", () => {
  it("lists page addresses", () => {
    expect(
      sitemapUrls(
        "<urlset><url><loc>https://x.example/a</loc></url><url><loc> https://x.example/b?a=1&amp;b=2 </loc></url></urlset>",
      ),
    ).toEqual(["https://x.example/a", "https://x.example/b?a=1&b=2"]);
  });
});

describe("toWxr", () => {
  it("turns crawled pages into pages, posts, media and a menu", async () => {
    const { toWxr } = await import("./crawl");
    const base = new URL("https://pekara.example/");
    const home = extractPage(
      fixture("builder-home.html"),
      "https://pekara.example/",
    );
    const post = extractPage(
      fixture("builder-post.html"),
      "https://pekara.example/blog/why-sourdough",
    );
    const about = {
      ...post,
      url: "https://pekara.example/about-us",
      isPost: false,
      title: "About us",
      html: "<p>Us.</p>",
      images: [],
    };
    const { wxr, homeItemId, logo, themeColor } = toWxr(
      base,
      [home, post, about],
      home,
    );

    const byType = (t: string) => wxr.items.filter((i) => i.type === t);
    expect(
      byType("page")
        .map((p) => p.slug)
        .sort(),
    ).toEqual(["about-us", "home"]);
    expect(byType("post")[0]).toMatchObject({
      slug: "why-sourdough",
      commentStatus: "open",
    });
    expect(byType("attachment")).toHaveLength(2);
    expect(homeItemId).toBe(wxr.items.find((i) => i.slug === "home")?.id);
    expect(logo).toBe("https://pekara.example/assets/logo.png");
    expect(themeColor).toBe("#b5542d");

    // Links to the old site's pages become paths on this site
    const homeItem = wxr.items.find((i) => i.slug === "home");
    expect(homeItem?.content).toContain('href="/blog/why-sourdough"');

    // The menu points at the imported pages; unknown ones stay as links
    const menu = byType("nav_menu_item");
    expect(menu.map((m) => m.title)).toEqual(["Home", "About us", "Menu"]);
    expect(menu[1].meta._menu_item_object_id).toBe(
      String(wxr.items.find((i) => i.slug === "about-us")?.id),
    );
    expect(menu[2].meta).toMatchObject({
      _menu_item_type: "custom",
      _menu_item_url: "/menu",
    });
  });
});
