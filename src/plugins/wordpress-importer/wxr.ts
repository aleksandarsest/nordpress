// Parses a WordPress eXtended RSS (WXR) export into plain objects.
// Pure (no I/O), so it can be unit tested against fixture files.
import { XMLParser } from "fast-xml-parser";

export type WxrAuthor = {
  id: number;
  login: string;
  email: string;
  displayName: string;
};
export type WxrTerm = {
  id: number;
  slug: string;
  name: string;
  description: string;
  parent: string;
};
export type WxrComment = {
  id: number;
  parentId: number;
  userId: number;
  authorName: string;
  authorEmail: string;
  authorUrl: string;
  authorIp: string;
  dateGmt: Date | null;
  content: string;
  approved: string;
  type: string;
};
export type WxrItem = {
  id: number;
  type: string;
  status: string;
  title: string;
  slug: string;
  guid: string;
  link: string;
  creator: string;
  content: string;
  excerpt: string;
  dateGmt: Date | null;
  parentId: number;
  menuOrder: number;
  commentStatus: "open" | "closed";
  password: string;
  sticky: boolean;
  attachmentUrl: string;
  categories: string[];
  tags: string[];
  /** Slugs of the nav menus a nav_menu_item belongs to. */
  navMenus: string[];
  meta: Record<string, string>;
  comments: WxrComment[];
};
export type Wxr = {
  site: {
    title: string;
    link: string;
    description: string;
    baseSiteUrl: string;
  };
  authors: WxrAuthor[];
  categories: WxrTerm[];
  tags: WxrTerm[];
  /** Navigation menus (nav_menu terms); their items are nav_menu_item posts. */
  menus: WxrTerm[];
  items: WxrItem[];
};

const ARRAYS = new Set([
  "item",
  "wp:author",
  "wp:category",
  "wp:tag",
  "wp:term",
  "wp:postmeta",
  "wp:comment",
  "wp:commentmeta",
  "category",
]);

type Node = Record<string, unknown>;

// fast-xml-parser yields strings, numbers-as-strings, or { "#text" } nodes
function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return text((value as Node)["#text"]);
  return String(value);
}

const int = (value: unknown) => Number.parseInt(text(value), 10) || 0;

// WXR dates are "YYYY-MM-DD HH:MM:SS"; the *_gmt variants are UTC
function gmtDate(value: unknown): Date | null {
  const s = text(value).trim();
  if (!s || s.startsWith("0000")) return null;
  const d = new Date(`${s.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseWxr(xml: string): Wxr {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    // Entities in WXR are standard XML ones; content itself is CDATA
    processEntities: true,
    htmlEntities: true,
    isArray: (name) => ARRAYS.has(name),
  });
  const doc = parser.parse(xml) as Node;
  const channel = ((doc.rss as Node | undefined)?.channel ??
    null) as Node | null;
  if (!channel || !text(channel["wp:wxr_version"])) {
    throw new Error("This doesn't look like a WordPress export (WXR) file.");
  }

  const authors = ((channel["wp:author"] as Node[] | undefined) ?? []).map(
    (a) => ({
      id: int(a["wp:author_id"]),
      login: text(a["wp:author_login"]).trim(),
      email: text(a["wp:author_email"]).trim().toLowerCase(),
      displayName:
        text(a["wp:author_display_name"]).trim() ||
        text(a["wp:author_login"]).trim(),
    }),
  );

  const categories = ((channel["wp:category"] as Node[] | undefined) ?? []).map(
    (c) => ({
      id: int(c["wp:term_id"]),
      slug: text(c["wp:category_nicename"]).trim(),
      name: text(c["wp:cat_name"]).trim(),
      description: text(c["wp:category_description"]).trim(),
      parent: text(c["wp:category_parent"]).trim(),
    }),
  );

  const tags = ((channel["wp:tag"] as Node[] | undefined) ?? []).map((t) => ({
    id: int(t["wp:term_id"]),
    slug: text(t["wp:tag_slug"]).trim(),
    name: text(t["wp:tag_name"]).trim(),
    description: text(t["wp:tag_description"]).trim(),
    parent: "",
  }));

  // Newer exports also list categories and tags as generic <wp:term>
  // entries; nav menus only ever appear there
  const menus: WxrTerm[] = [];
  for (const t of (channel["wp:term"] as Node[] | undefined) ?? []) {
    const taxonomy = text(t["wp:term_taxonomy"]).trim();
    const term = {
      id: int(t["wp:term_id"]),
      slug: text(t["wp:term_slug"]).trim(),
      name: text(t["wp:term_name"]).trim(),
      description: text(t["wp:term_description"]).trim(),
      parent: text(t["wp:term_parent"]).trim(),
    };
    const list =
      taxonomy === "category"
        ? categories
        : taxonomy === "post_tag"
          ? tags
          : taxonomy === "nav_menu"
            ? menus
            : null;
    if (list && !list.some((x) => x.slug === term.slug)) list.push(term);
  }

  const items = ((channel.item as Node[] | undefined) ?? []).map(
    (item): WxrItem => {
      const cats = (item.category as Node[] | undefined) ?? [];
      const termsOf = (domain: string) =>
        cats
          .filter((c) => c["@_domain"] === domain)
          .map((c) => text(c["@_nicename"]).trim())
          .filter(Boolean);
      const meta: Record<string, string> = {};
      for (const m of (item["wp:postmeta"] as Node[] | undefined) ?? []) {
        meta[text(m["wp:meta_key"])] = text(m["wp:meta_value"]);
      }
      return {
        id: int(item["wp:post_id"]),
        type: text(item["wp:post_type"]).trim(),
        status: text(item["wp:status"]).trim(),
        title: text(item.title).trim(),
        slug: decodeURIComponent(text(item["wp:post_name"]).trim()),
        guid: text(item.guid).trim(),
        link: text(item.link).trim(),
        creator: text(item["dc:creator"]).trim(),
        content: text(item["content:encoded"]),
        excerpt: text(item["excerpt:encoded"]).trim(),
        dateGmt: gmtDate(item["wp:post_date_gmt"]),
        parentId: int(item["wp:post_parent"]),
        menuOrder: int(item["wp:menu_order"]),
        commentStatus:
          text(item["wp:comment_status"]).trim() === "closed"
            ? "closed"
            : "open",
        password: text(item["wp:post_password"]),
        sticky: text(item["wp:is_sticky"]).trim() === "1",
        attachmentUrl: text(item["wp:attachment_url"]).trim(),
        categories: termsOf("category"),
        tags: termsOf("post_tag"),
        navMenus: termsOf("nav_menu"),
        meta,
        comments: ((item["wp:comment"] as Node[] | undefined) ?? []).map(
          (c) => ({
            id: int(c["wp:comment_id"]),
            parentId: int(c["wp:comment_parent"]),
            userId: int(c["wp:comment_user_id"]),
            authorName: text(c["wp:comment_author"]).trim(),
            authorEmail: text(c["wp:comment_author_email"])
              .trim()
              .toLowerCase(),
            authorUrl: text(c["wp:comment_author_url"]).trim(),
            authorIp: text(c["wp:comment_author_IP"]).trim(),
            dateGmt: gmtDate(c["wp:comment_date_gmt"]),
            content: text(c["wp:comment_content"]),
            approved: text(c["wp:comment_approved"]).trim(),
            type: text(c["wp:comment_type"]).trim(),
          }),
        ),
      };
    },
  );

  return {
    site: {
      title: text(channel.title).trim(),
      link: text(channel.link).trim(),
      description: text(channel.description).trim(),
      baseSiteUrl: text(channel["wp:base_site_url"]).trim(),
    },
    authors,
    categories,
    tags,
    menus,
    items,
  };
}

export type WxrMenuItem = {
  wpId: number;
  /** wpId of the parent item, or 0. */
  parentWpId: number;
  label: string;
  newTab: boolean;
} & (
  | { kind: "custom"; url: string }
  | { kind: "post"; objectWpId: number }
  | { kind: "term"; taxonomy: "category" | "post_tag"; objectWpId: number }
);

export type WxrMenu = {
  slug: string;
  name: string;
  items: WxrMenuItem[];
  /** Items linking to things Nordpress doesn't have (archives, custom types). */
  skipped: number;
};

// Groups nav_menu_item posts into their menus, in menu order. Links to the
// old site become site-relative so they keep working after the move.
export function menusFromWxr(wxr: Wxr): WxrMenu[] {
  const base = wxr.site.baseSiteUrl.replace(/\/+$/, "");
  const relative = (url: string) => {
    if (!base || !url.startsWith(base)) return url;
    const rest = url.slice(base.length);
    if (rest && !/^[/?#]/.test(rest)) return url;
    return rest.replace(/^([^?#]*?)\/+(?=$|[?#])/, "$1") || "/";
  };

  return wxr.menus.map((menu) => {
    const entries = wxr.items
      .filter(
        (i) =>
          i.type === "nav_menu_item" &&
          i.status === "publish" &&
          i.navMenus.includes(menu.slug),
      )
      .sort((a, b) => a.menuOrder - b.menuOrder);
    let skipped = 0;
    const items = entries.flatMap((i): WxrMenuItem[] => {
      const m = i.meta;
      const common = {
        wpId: i.id,
        parentWpId: Number(m._menu_item_menu_item_parent) || 0,
        label: i.title,
        newTab: m._menu_item_target === "_blank",
      };
      const objectWpId = Number(m._menu_item_object_id) || 0;
      const object = m._menu_item_object;
      if (m._menu_item_type === "custom" && m._menu_item_url) {
        return [{ ...common, kind: "custom", url: relative(m._menu_item_url) }];
      }
      if (
        m._menu_item_type === "post_type" &&
        (object === "post" || object === "page") &&
        objectWpId
      ) {
        return [{ ...common, kind: "post", objectWpId }];
      }
      if (
        m._menu_item_type === "taxonomy" &&
        (object === "category" || object === "post_tag") &&
        objectWpId
      ) {
        return [{ ...common, kind: "term", taxonomy: object, objectWpId }];
      }
      skipped++;
      return [];
    });
    return { slug: menu.slug, name: menu.name, items, skipped };
  });
}

// Orders terms so every parent comes before its children.
export function parentsFirst(terms: WxrTerm[]): WxrTerm[] {
  const bySlug = new Map(terms.map((t) => [t.slug, t]));
  const out: WxrTerm[] = [];
  const seen = new Set<string>();
  const visit = (t: WxrTerm, path: Set<string>) => {
    if (seen.has(t.slug) || path.has(t.slug)) return;
    path.add(t.slug);
    const parent = t.parent ? bySlug.get(t.parent) : undefined;
    if (parent) visit(parent, path);
    seen.add(t.slug);
    out.push(t);
  };
  for (const t of terms) visit(t, new Set());
  return out;
}

// Converts WordPress block markup to plain HTML the editor can parse:
// drops block comments and turns [caption] shortcodes into figure captions.
export function cleanContent(html: string): string {
  return html
    .replace(/<!--\s*\/?wp:[\s\S]*?-->/g, "")
    .replace(
      /\[caption[^\]]*\]([\s\S]*?)\[\/caption\]/g,
      (_m, inner: string) => {
        const img = inner.match(/<img[^>]*>/)?.[0] ?? "";
        const caption = inner
          .replace(/<a[^>]*>\s*<img[^>]*>\s*<\/a>|<img[^>]*>/, "")
          .trim();
        return `${img}${caption ? `<p><em>${caption}</em></p>` : ""}`;
      },
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// WordPress separates paragraphs with blank lines in classic-editor content
// (wpautop); wrap such text in <p> so paragraphs survive.
export function autop(html: string): string {
  if (/<(p|div|h[1-6]|ul|ol|blockquote|figure|pre)[\s>]/i.test(html))
    return html;
  return html
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}
