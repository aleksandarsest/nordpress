import type { PermalinkStructure } from "./options";

export type LinkablePost = {
  id: number;
  type: string;
  slug: string;
  publishedAt: Date | null;
};

const pad = (n: number) => String(n).padStart(2, "0");

// `pagePath` is the slash-joined slug chain for hierarchical pages,
// e.g. "about/team".
export function postPath(
  post: LinkablePost,
  structure: PermalinkStructure,
  pagePath?: string,
): string {
  if (structure === "plain") {
    return post.type === "page" ? `/?page_id=${post.id}` : `/?p=${post.id}`;
  }
  if (post.type === "page") return `/${pagePath ?? post.slug}`;
  if (post.type !== "post") return `/${post.type}/${post.slug}`;

  switch (structure) {
    case "dated": {
      const d = post.publishedAt ?? new Date();
      return `/${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${post.slug}`;
    }
    case "archive":
      return `/archives/${post.id}`;
    default:
      return `/${post.slug}`;
  }
}

export type Route =
  | { kind: "home"; page: number }
  | { kind: "single"; id: number }
  | { kind: "page-by-id"; id: number }
  | { kind: "slug"; slugs: string[] }
  | { kind: "dated"; year: number; month: number; slug: string }
  | { kind: "date-archive"; year: number; month?: number; page: number }
  | {
      kind: "term";
      taxonomy: "category" | "post_tag";
      slug: string;
      page: number;
    }
  | { kind: "author"; id: string; page: number }
  | { kind: "search"; query: string; page: number }
  | { kind: "type-single"; type: string; slug: string }
  | { kind: "not-found" };

const isInt = (s: string | undefined) => !!s && /^\d+$/.test(s);

// Turns a public URL into the content it should display, mirroring the
// WordPress rewrite rules for the supported permalink structures.
export function resolveRoute(
  segments: string[],
  query: { p?: string; page_id?: string; s?: string },
): Route {
  let parts = segments.filter(Boolean).map(decodeURIComponent);

  let page = 1;
  const pageAt = parts.length - 2;
  if (parts[pageAt] === "page" && isInt(parts[pageAt + 1])) {
    page = Math.max(1, Number(parts[pageAt + 1]));
    parts = parts.slice(0, pageAt);
  }

  if (query.s !== undefined && parts.length === 0) {
    return { kind: "search", query: query.s.trim(), page };
  }
  if (parts.length === 0) {
    if (isInt(query.p)) return { kind: "single", id: Number(query.p) };
    if (isInt(query.page_id))
      return { kind: "page-by-id", id: Number(query.page_id) };
    return { kind: "home", page };
  }

  const [first, second, third] = parts;

  if (
    (first === "category" || first === "tag") &&
    second &&
    parts.length >= 2
  ) {
    // Nested categories ("category/parent/child") resolve by the last slug
    return {
      kind: "term",
      taxonomy: first === "tag" ? "post_tag" : "category",
      slug: parts[parts.length - 1],
      page,
    };
  }
  if (first === "author" && second && parts.length === 2) {
    return { kind: "author", id: second, page };
  }
  if (first === "search" && second !== undefined && parts.length === 2) {
    return { kind: "search", query: second, page };
  }
  if (first === "archives" && isInt(second) && parts.length === 2) {
    return { kind: "single", id: Number(second) };
  }
  if (/^\d{4}$/.test(first)) {
    const year = Number(first);
    if (parts.length === 1) return { kind: "date-archive", year, page };
    if (/^\d{2}$/.test(second) && parts.length === 2) {
      return { kind: "date-archive", year, month: Number(second), page };
    }
    if (/^\d{2}$/.test(second) && third && parts.length === 3) {
      return { kind: "dated", year, month: Number(second), slug: third };
    }
    return { kind: "not-found" };
  }
  if (page > 1) return { kind: "not-found" };
  return { kind: "slug", slugs: parts };
}

export function termPath(taxonomy: string, slug: string) {
  return `/${taxonomy === "post_tag" ? "tag" : "category"}/${slug}`;
}

export function authorPath(id: string) {
  return `/author/${id}`;
}
