import "server-only";
import { slugify } from "@/lib/slug";
import { type ExtractedPage, extractPage, sitemapUrls } from "./extract";
import type { Wxr, WxrItem } from "./wxr";

// Copies a website that isn't WordPress: finds its pages (sitemap, menu,
// links), reads each one, and turns the result into the same shape as a
// WordPress export, so the importer handles media, pages, posts and menus
// the same way for both.

export class CrawlError extends Error {}

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 5;

type Guard = (url: string) => Promise<unknown>;

/** Fetches a page, checking every redirect hop with the network guard. */
async function fetchText(
  url: string,
  guard: Guard,
  accept = "text/html",
): Promise<{ url: string; text: string } | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await guard(current);
    const res = await fetch(current, {
      headers: { Accept: accept, "User-Agent": "Nordpress importer" },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      current = new URL(location, current).toString();
      continue;
    }
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (accept === "text/html" && !type.includes("html")) return null;
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) return null;
    const text = await res.text();
    return text.length > MAX_BYTES ? null : { url: current, text };
  }
  return null;
}

/** Whether a page is served by WordPress, so its REST API can do better. */
export function looksLikeWordPress(html: string) {
  return /wp-content\/|api\.w\.org|<meta name="generator" content="WordPress/i.test(
    html,
  );
}

async function sitemapPages(base: URL, guard: Guard) {
  const found = new Set<string>();
  const queue = [
    `${base.origin}/sitemap.xml`,
    `${base.origin}/sitemap_index.xml`,
  ];
  const robots = await fetchText(
    `${base.origin}/robots.txt`,
    guard,
    "text/plain",
  ).catch(() => null);
  for (const m of robots?.text.matchAll(/^sitemap:\s*(\S+)/gim) ?? [])
    queue.unshift(m[1]);
  const seen = new Set<string>();
  // Sitemap indexes list more sitemaps; follow a few levels
  while (queue.length && seen.size < 10) {
    const url = queue.shift() as string;
    if (seen.has(url)) continue;
    seen.add(url);
    const res = await fetchText(url, guard, "application/xml").catch(
      () => null,
    );
    if (!res || !/<(urlset|sitemapindex)/i.test(res.text)) continue;
    for (const loc of sitemapUrls(res.text)) {
      if (/<sitemapindex/i.test(res.text)) queue.push(loc);
      else found.add(loc);
    }
  }
  return [...found];
}

export type CrawlResult = {
  wxr: Wxr;
  /** The export item that is the old home page. */
  homeItemId: number | null;
  logo: string | null;
  themeColor: string | null;
  /** The old home page's description, for the tagline. */
  description: string;
};

export async function crawlSite(
  siteUrl: string,
  guard: Guard,
  onProgress: (message: string) => void,
  max = 40,
): Promise<CrawlResult> {
  let base: URL;
  try {
    base = new URL(siteUrl.includes("://") ? siteUrl : `https://${siteUrl}`);
  } catch {
    throw new CrawlError("That isn't a web address.");
  }
  onProgress("Reading the home page");
  const first = await fetchText(base.toString(), guard);
  if (!first) throw new CrawlError("The site didn't answer with a web page.");
  // Redirects (http → https, bare → www) decide the real address
  base = new URL(first.url);
  const home = extractPage(first.text, first.url);

  onProgress("Looking for pages");
  const sitemap = await sitemapPages(base, guard);
  const queue = [
    ...home.nav.map((n) => n.url),
    ...sitemap.map((u) => u.replace(/\/+$/, "")),
    ...home.links,
  ];
  const pages = new Map<string, ExtractedPage>([
    [home.url.replace(/\/+$/, ""), home],
  ]);
  const visited = new Set(pages.keys());
  while (queue.length && pages.size < max) {
    const url = queue.shift() as string;
    const key = url.replace(/\/+$/, "");
    if (visited.has(key)) continue;
    visited.add(key);
    try {
      const res = await fetchText(url, guard);
      if (!res) continue;
      const page = extractPage(res.text, res.url);
      if (!page.html.replace(/<[^>]+>/g, "").trim() && page.images.length === 0)
        continue;
      pages.set(key, page);
      onProgress(`Read ${pages.size} pages`);
      // Pages linked from pages, when the sitemap didn't list everything
      queue.push(
        ...page.links.filter((l) => !visited.has(l.replace(/\/+$/, ""))),
      );
    } catch {
      // A page that can't be read is left out
    }
  }

  return toWxr(base, [...pages.values()], home);
}

/** Turns crawled pages into an export the importer understands. Pure. */
export function toWxr(
  base: URL,
  pages: ExtractedPage[],
  home: ExtractedPage,
): CrawlResult {
  let nextId = 1;
  const items: WxrItem[] = [];
  const item = (fields: Partial<WxrItem>): WxrItem => ({
    id: nextId++,
    type: "page",
    status: "publish",
    title: "",
    slug: "",
    guid: "",
    link: "",
    creator: "",
    content: "",
    excerpt: "",
    dateGmt: null,
    parentId: 0,
    menuOrder: 0,
    commentStatus: "closed",
    password: "",
    sticky: false,
    attachmentUrl: "",
    categories: [],
    tags: [],
    navMenus: [],
    meta: {},
    comments: [],
    ...fields,
  });

  const pathOf = (url: string) =>
    new URL(url).pathname.replace(/\/+$/, "") || "/";
  // Links to the old site's pages become site paths; redirects map old
  // paths to the new ones after the import
  const localize = (html: string) =>
    html.replace(/href="(https?:\/\/[^"]+)"/g, (m, url: string) => {
      try {
        const u = new URL(url.replace(/&amp;/g, "&"));
        return u.hostname.replace(/^www\./, "") ===
          base.hostname.replace(/^www\./, "")
          ? `href="${u.pathname.replace(/\/+$/, "") || "/"}${u.hash}"`
          : m;
      } catch {
        return m;
      }
    });

  const byPath = new Map<string, WxrItem>();
  const homePath = pathOf(home.url);
  // Shallow paths first, so a parent page exists before its children
  const ordered = [...pages].sort(
    (a, b) => pathOf(a.url).split("/").length - pathOf(b.url).split("/").length,
  );
  for (const page of ordered) {
    const path = pathOf(page.url);
    const isHome = path === homePath;
    const segments = path.split("/").filter(Boolean);
    const post = page.isPost && !isHome;
    const parent =
      !post && segments.length > 1
        ? byPath.get(`/${segments.slice(0, -1).join("/")}`)
        : undefined;
    const entry = item({
      type: post ? "post" : "page",
      title: page.title || (isHome ? "Home" : (segments.at(-1) ?? "Page")),
      slug: isHome ? "home" : slugify(segments.at(-1) ?? page.title),
      guid: page.url,
      link: page.url,
      content: localize(page.html),
      excerpt: page.description,
      dateGmt: page.date,
      parentId: parent?.id ?? 0,
      commentStatus: post ? "open" : "closed",
    });
    items.push(entry);
    byPath.set(path, entry);
  }

  // Every image once, as a media item the importer downloads
  const images = [...new Set(pages.flatMap((p) => p.images))];
  for (const src of images)
    items.push(
      item({
        type: "attachment",
        title: decodeURIComponent(
          src.split("?")[0].split("/").pop() ?? "image",
        ).replace(/\.[a-z0-9]+$/i, ""),
        attachmentUrl: src,
        guid: src,
      }),
    );

  // The old menu, pointing at the imported pages
  const menus = home.nav.length
    ? [
        {
          id: 1,
          slug: "main-menu",
          name: "Main menu",
          description: "",
          parent: "",
        },
      ]
    : [];
  home.nav.forEach((link, i) => {
    const target = byPath.get(pathOf(link.url));
    items.push(
      item({
        type: "nav_menu_item",
        title: link.label,
        menuOrder: i,
        navMenus: ["main-menu"],
        meta: target
          ? {
              _menu_item_type: "post_type",
              _menu_item_object: target.type,
              _menu_item_object_id: String(target.id),
              _menu_item_menu_item_parent: "0",
            }
          : {
              _menu_item_type: "custom",
              _menu_item_url: pathOf(link.url),
              _menu_item_menu_item_parent: "0",
            },
      }),
    );
  });

  return {
    wxr: {
      site: {
        title: home.siteName ?? home.title,
        link: base.origin,
        description: home.description,
        baseSiteUrl: base.origin,
      },
      authors: [],
      categories: [],
      tags: [],
      menus,
      items,
    },
    homeItemId: byPath.get(homePath)?.id ?? null,
    logo: home.logo,
    themeColor: home.themeColor,
    description: home.description,
  };
}
