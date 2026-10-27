// Imports straight from a live WordPress site through its public REST API,
// no export file needed. Builds the same structure as a parsed WXR file so
// the rest of the importer is shared.
import type { Wxr, WxrComment, WxrItem, WxrTerm } from "./wxr";

// ---------------------------------------------------------------------------
// Mapping (pure, tested against fixture JSON)
// ---------------------------------------------------------------------------

type Rendered = { rendered?: string; protected?: boolean };

export type RestTerm = {
  id: number;
  name: string;
  slug: string;
  description?: string;
  parent?: number;
};
export type RestUser = { id: number; name: string; slug: string };
export type RestPost = {
  id: number;
  type: string;
  status?: string;
  slug: string;
  link: string;
  guid?: Rendered;
  date_gmt?: string | null;
  title?: Rendered;
  content?: Rendered;
  excerpt?: Rendered;
  author?: number;
  parent?: number;
  menu_order?: number;
  comment_status?: string;
  sticky?: boolean;
  featured_media?: number;
  categories?: number[];
  tags?: number[];
};
export type RestMedia = {
  id: number;
  source_url: string;
  slug: string;
  alt_text?: string;
  title?: Rendered;
  caption?: Rendered;
  date_gmt?: string | null;
  author?: number;
};
export type RestComment = {
  id: number;
  post: number;
  parent?: number;
  author?: number;
  author_name?: string;
  author_url?: string;
  date_gmt?: string;
  content?: Rendered;
};

export type LiveSite = {
  site: { name?: string; description?: string; url?: string; home?: string };
  categories: RestTerm[];
  tags: RestTerm[];
  users: RestUser[];
  posts: RestPost[];
  pages: RestPost[];
  media: RestMedia[];
  comments: RestComment[];
};

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

/** Titles and names come HTML-encoded from the API ("Don&#8217;t"). */
export function decodeEntities(text: string) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X"
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return NAMED[code.toLowerCase()] ?? match;
  });
}

const plain = (html = "") =>
  decodeEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();

const gmt = (value?: string | null) =>
  value ? new Date(`${value.replace(/Z$/, "")}Z`) : null;

export function liveToWxr(data: LiveSite): Wxr {
  const users = new Map(data.users.map((u) => [u.id, u]));
  const terms = (list: RestTerm[]): WxrTerm[] => {
    const slugs = new Map(list.map((t) => [t.id, t.slug]));
    return list.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: decodeEntities(t.name),
      description: t.description ?? "",
      parent: t.parent ? (slugs.get(t.parent) ?? "") : "",
    }));
  };
  const categories = terms(data.categories);
  const tags = terms(data.tags);
  const categorySlug = new Map(data.categories.map((c) => [c.id, c.slug]));
  const tagSlug = new Map(data.tags.map((t) => [t.id, t.slug]));

  const commentsByPost = new Map<number, WxrComment[]>();
  for (const c of data.comments) {
    const list = commentsByPost.get(c.post) ?? [];
    list.push({
      id: c.id,
      parentId: c.parent ?? 0,
      userId: c.author ?? 0,
      authorName: decodeEntities(c.author_name ?? ""),
      authorEmail: "",
      authorUrl: c.author_url ?? "",
      authorIp: "",
      dateGmt: gmt(c.date_gmt),
      content: c.content?.rendered ?? "",
      // Only approved comments are public
      approved: "1",
      type: "",
    });
    commentsByPost.set(c.post, list);
  }

  const item = (p: RestPost, type: "post" | "page"): WxrItem => ({
    id: p.id,
    type,
    status: "publish",
    title: decodeEntities(p.title?.rendered ?? ""),
    slug: decodeURIComponent(p.slug),
    guid: p.guid?.rendered ?? p.link,
    link: p.link,
    creator: users.get(p.author ?? 0)?.slug ?? "",
    content: p.content?.protected ? "" : (p.content?.rendered ?? ""),
    excerpt: p.excerpt?.protected ? "" : plain(p.excerpt?.rendered),
    dateGmt: gmt(p.date_gmt),
    parentId: p.parent ?? 0,
    menuOrder: p.menu_order ?? 0,
    commentStatus: p.comment_status === "closed" ? "closed" : "open",
    // Protected posts come without their content; they're imported private
    password: p.content?.protected ? "protected" : "",
    sticky: !!p.sticky,
    attachmentUrl: "",
    categories: (p.categories ?? []).flatMap(
      (id) => categorySlug.get(id) ?? [],
    ),
    tags: (p.tags ?? []).flatMap((id) => tagSlug.get(id) ?? []),
    navMenus: [],
    meta: p.featured_media ? { _thumbnail_id: String(p.featured_media) } : {},
    comments: commentsByPost.get(p.id) ?? [],
  });

  const attachments = data.media.map(
    (m): WxrItem => ({
      id: m.id,
      type: "attachment",
      status: "inherit",
      title: decodeEntities(m.title?.rendered ?? ""),
      slug: m.slug,
      guid: m.source_url,
      link: m.source_url,
      creator: users.get(m.author ?? 0)?.slug ?? "",
      content: "",
      excerpt: plain(m.caption?.rendered),
      dateGmt: gmt(m.date_gmt),
      parentId: 0,
      menuOrder: 0,
      commentStatus: "closed",
      password: "",
      sticky: false,
      attachmentUrl: m.source_url,
      categories: [],
      tags: [],
      navMenus: [],
      meta: m.alt_text ? { _wp_attachment_image_alt: m.alt_text } : {},
      comments: [],
    }),
  );

  const home = (data.site.home ?? data.site.url ?? "").replace(/\/$/, "");
  return {
    site: {
      title: decodeEntities(data.site.name ?? ""),
      link: home,
      description: decodeEntities(data.site.description ?? ""),
      baseSiteUrl: (data.site.url ?? home).replace(/\/$/, ""),
    },
    authors: data.users.map((u) => ({
      id: u.id,
      login: u.slug,
      // The public API doesn't reveal emails, so authors can't be matched
      email: "",
      displayName: decodeEntities(u.name),
    })),
    categories,
    tags,
    menus: [],
    items: [
      ...data.posts.map((p) => item(p, "post")),
      ...data.pages.map((p) => item(p, "page")),
      ...attachments,
    ],
  };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

const PER_PAGE = 100;
const MAX_PAGES = 50;

export class LiveImportError extends Error {}

export async function fetchLiveSite(
  siteUrl: string,
  guard: (url: string) => Promise<unknown>,
  onProgress: (message: string) => void,
): Promise<LiveSite> {
  let base: URL;
  try {
    base = new URL(
      siteUrl.trim().includes("://")
        ? siteUrl.trim()
        : `https://${siteUrl.trim()}`,
    );
  } catch {
    throw new LiveImportError("That isn't a web address.");
  }
  const root = `${base.origin}${base.pathname.replace(/\/$/, "")}/wp-json`;

  async function get<T>(path: string): Promise<{ data: T; pages: number }> {
    const url = `${root}${path}`;
    await guard(url);
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Nordpress importer",
      },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok)
      throw new LiveImportError(
        res.status === 404
          ? "That site doesn't offer the WordPress REST API (or it's turned off)."
          : `The site answered ${res.status} for ${path}.`,
      );
    return {
      data: (await res.json()) as T,
      pages: Number(res.headers.get("x-wp-totalpages") ?? 1) || 1,
    };
  }

  async function all<T>(path: string, label: string): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const { data, pages } = await get<T[]>(
        `${path}${sep}per_page=${PER_PAGE}&page=${page}`,
      );
      out.push(...data);
      onProgress(`Read ${out.length} ${label}`);
      if (page >= pages) break;
    }
    return out;
  }

  const { data: site } = await get<LiveSite["site"]>("/");
  if (!site || typeof site !== "object")
    throw new LiveImportError("That doesn't look like a WordPress site.");
  return {
    site,
    categories: await all<RestTerm>("/wp/v2/categories", "categories"),
    tags: await all<RestTerm>("/wp/v2/tags", "tags"),
    users: await all<RestUser>("/wp/v2/users", "authors").catch(() => []),
    posts: await all<RestPost>("/wp/v2/posts", "posts"),
    pages: await all<RestPost>("/wp/v2/pages", "pages"),
    media: await all<RestMedia>("/wp/v2/media", "media items"),
    comments: await all<RestComment>("/wp/v2/comments", "comments").catch(
      () => [],
    ),
  };
}
