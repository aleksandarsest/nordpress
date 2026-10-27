import "server-only";
import type { Comment, Media, Post, Term, User } from "@/db/schema";
import { makeExcerpt } from "../content";
import { mediaUrl } from "../media";
import type { SiteSettings } from "../options";
import { authorPath, postPath, termPath } from "../permalinks";
import { siteUrl } from "../site-url";
import { wpDates } from "./core";

export const API_BASE = "/wp-json/wp/v2";
const api = (path: string) => siteUrl(`${API_BASE}${path}`);

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export type Context = "view" | "edit" | "embed";

export type PostExtras = {
  terms: Term[];
  pagePath?: string;
};

export function serializePost(
  post: Post,
  extras: PostExtras,
  settings: SiteSettings,
  context: Context,
) {
  const base = post.type === "page" ? "pages" : "posts";
  const published = wpDates(
    post.publishedAt ?? post.createdAt,
    settings.timezone,
  );
  const modified = wpDates(post.updatedAt, settings.timezone);
  const excerptText = post.excerpt || makeExcerpt(post.contentText);
  const edit = context === "edit";

  const data: Record<string, unknown> = {
    id: post.id,
    date: published.local,
    date_gmt: published.gmt,
    guid: { rendered: siteUrl(`/?p=${post.id}`) },
    modified: modified.local,
    modified_gmt: modified.gmt,
    slug: post.slug,
    status: post.status,
    type: post.type,
    link: siteUrl(postPath(post, settings.permalinkStructure, extras.pagePath)),
    title: {
      rendered: escapeHtml(post.title),
      ...(edit && { raw: post.title }),
    },
    content: {
      rendered: post.contentHtml,
      protected: false,
      // `raw` is HTML here; `document` is the native editor document
      ...(edit && { raw: post.contentHtml, document: post.content }),
    },
    excerpt: {
      rendered: excerptText ? `<p>${escapeHtml(excerptText)}</p>\n` : "",
      protected: false,
      ...(edit && { raw: post.excerpt }),
    },
    author: post.authorId ?? 0,
    featured_media: post.featuredMediaId ?? 0,
    comment_status: post.commentStatus,
    ping_status: "closed",
    template: post.template ?? "",
    meta: post.meta,
  };

  if (post.type === "post") {
    data.sticky = post.sticky;
    data.format = "standard";
    data.categories = extras.terms
      .filter((t) => t.taxonomy === "category")
      .map((t) => t.id);
    data.tags = extras.terms
      .filter((t) => t.taxonomy === "post_tag")
      .map((t) => t.id);
  } else {
    data.parent = post.parentId ?? 0;
    data.menu_order = post.menuOrder;
  }

  if (context === "embed") {
    const {
      id,
      date,
      slug,
      type,
      link,
      title,
      excerpt,
      author,
      featured_media,
    } = data;
    return {
      id,
      date,
      slug,
      type,
      link,
      title,
      excerpt,
      author,
      featured_media,
    };
  }

  data._links = {
    self: [{ href: api(`/${base}/${post.id}`) }],
    collection: [{ href: api(`/${base}`) }],
    author: post.authorId
      ? [{ embeddable: true, href: api(`/users/${post.authorId}`) }]
      : [],
    replies: [{ embeddable: true, href: api(`/comments?post=${post.id}`) }],
    ...(post.featuredMediaId && {
      "wp:featuredmedia": [
        { embeddable: true, href: api(`/media/${post.featuredMediaId}`) },
      ],
    }),
    ...(post.type === "post" && {
      "wp:term": [
        {
          taxonomy: "category",
          embeddable: true,
          href: api(`/categories?post=${post.id}`),
        },
        {
          taxonomy: "post_tag",
          embeddable: true,
          href: api(`/tags?post=${post.id}`),
        },
      ],
    }),
  };
  return data;
}

export function serializeTerm(
  term: Term & { count?: number },
  context: Context,
) {
  const rest = term.taxonomy === "post_tag" ? "tags" : "categories";
  const data: Record<string, unknown> = {
    id: term.id,
    count: term.count ?? 0,
    description: term.description,
    link: siteUrl(termPath(term.taxonomy, term.slug)),
    name: term.name,
    slug: term.slug,
    taxonomy: term.taxonomy,
    ...(term.taxonomy === "category" && { parent: term.parentId ?? 0 }),
    meta: term.meta,
  };
  if (context === "embed") {
    const { id, link, name, slug, taxonomy } = data;
    return { id, link, name, slug, taxonomy };
  }
  data._links = {
    self: [{ href: api(`/${rest}/${term.id}`) }],
    collection: [{ href: api(`/${rest}`) }],
  };
  return data;
}

export function serializeUser(
  user: Pick<
    User,
    "id" | "name" | "email" | "role" | "bio" | "website" | "createdAt"
  >,
  context: Context,
) {
  const data: Record<string, unknown> = {
    id: user.id,
    name: user.name,
    url: user.website ?? "",
    description: user.bio ?? "",
    link: siteUrl(authorPath(user.id)),
    slug: user.id,
    avatar_urls: {},
  };
  if (context === "edit") {
    Object.assign(data, {
      email: user.email,
      roles: [user.role],
      registered_date: user.createdAt.toISOString(),
    });
  }
  if (context !== "embed") {
    data._links = {
      self: [{ href: api(`/users/${user.id}`) }],
      collection: [{ href: api("/users") }],
    };
  }
  return data;
}

export function serializeMedia(
  item: Media,
  settings: SiteSettings,
  context: Context,
) {
  const dates = wpDates(item.createdAt, settings.timezone);
  const url = siteUrl(mediaUrl(item.path));
  const isImage = item.mimeType.startsWith("image/");
  const data: Record<string, unknown> = {
    id: item.id,
    date: dates.local,
    date_gmt: dates.gmt,
    slug: item.path
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/, ""),
    status: "inherit",
    type: "attachment",
    link: url,
    title: {
      rendered: escapeHtml(item.title),
      ...(context === "edit" && { raw: item.title }),
    },
    author: item.uploaderId ?? 0,
    caption: {
      rendered: item.caption ? `<p>${escapeHtml(item.caption)}</p>\n` : "",
    },
    alt_text: item.alt,
    media_type: isImage ? "image" : "file",
    mime_type: item.mimeType,
    media_details: {
      filesize: item.size,
      ...(isImage && { width: item.width, height: item.height }),
      sizes: {},
    },
    source_url: url,
  };
  if (context !== "embed") {
    data._links = {
      self: [{ href: api(`/media/${item.id}`) }],
      collection: [{ href: api("/media") }],
    };
  }
  return data;
}

export function serializeComment(
  comment: Comment,
  settings: SiteSettings,
  postLink: string,
  context: Context,
) {
  const dates = wpDates(comment.createdAt, settings.timezone);
  const statusName = {
    approved: "approved",
    pending: "hold",
    spam: "spam",
    trash: "trash",
  }[comment.status];
  const html = comment.content
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br />\n")}</p>`)
    .join("\n");
  const data: Record<string, unknown> = {
    id: comment.id,
    post: comment.postId,
    parent: comment.parentId ?? 0,
    author: comment.userId ?? 0,
    author_name: comment.authorName,
    author_url: comment.authorUrl,
    date: dates.local,
    date_gmt: dates.gmt,
    content: {
      rendered: `${html}\n`,
      ...(context === "edit" && { raw: comment.content }),
    },
    link: `${postLink}#comment-${comment.id}`,
    status: statusName,
    type: "comment",
    author_avatar_urls: {},
    meta: [],
  };
  if (context === "edit") {
    Object.assign(data, {
      author_email: comment.authorEmail,
      author_ip: comment.ipAddress ?? "",
      author_user_agent: comment.userAgent ?? "",
    });
  }
  data._links = {
    self: [{ href: api(`/comments/${comment.id}`) }],
    collection: [{ href: api("/comments") }],
    up: [{ embeddable: true, href: api(`/posts/${comment.postId}`) }],
  };
  return data;
}
