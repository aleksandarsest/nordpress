import type { Metadata } from "next";

// Per-post search and social settings, stored in posts.meta.seo, and the
// page metadata built from them. Pure.

export type SeoMeta = {
  /** Replaces the title in search results and link previews. */
  title?: string;
  /** Replaces the excerpt in search results and link previews. */
  description?: string;
  /** A media item for link previews, instead of the featured image. */
  imageId?: number;
  /** Keep this page out of search engines, the sitemap and llms.txt. */
  noindex?: boolean;
};

// Lengths search engines show before cutting text off
export const SEO_TITLE_LIMIT = 60;
export const SEO_DESCRIPTION_LIMIT = 155;

export function seoOf(meta: unknown): SeoMeta {
  const raw = (meta as { seo?: Record<string, unknown> } | null)?.seo;
  if (!raw || typeof raw !== "object") return {};
  const seo: SeoMeta = {};
  if (typeof raw.title === "string" && raw.title.trim())
    seo.title = raw.title.trim();
  if (typeof raw.description === "string" && raw.description.trim())
    seo.description = raw.description.trim();
  if (typeof raw.imageId === "number" && raw.imageId > 0)
    seo.imageId = raw.imageId;
  if (raw.noindex === true) seo.noindex = true;
  return seo;
}

/** Cleans what the editor, the REST API or an agent sends. */
export function cleanSeo(input: {
  title?: string | null;
  description?: string | null;
  imageId?: number | null;
  noindex?: boolean | null;
}): SeoMeta {
  return seoOf({
    seo: {
      title: (input.title ?? "").replace(/\s+/g, " ").slice(0, 200),
      description: (input.description ?? "").replace(/\s+/g, " ").slice(0, 400),
      imageId: input.imageId ?? undefined,
      noindex: input.noindex === true,
    },
  });
}

export type SocialImage = {
  url: string;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
};

/** Metadata for a single post or page: search snippet, link previews, robots. */
export function postMetadata(p: {
  title: string;
  description: string;
  url: string;
  type: "post" | "page";
  seo: SeoMeta;
  image: SocialImage | null;
  publishedAt: Date | null;
  modifiedAt: Date;
  author?: string | null;
  siteName: string;
}): Metadata {
  const title = p.seo.title ?? p.title;
  const description = p.seo.description ?? p.description;
  const images = p.image
    ? [
        {
          url: p.image.url,
          ...(p.image.width && { width: p.image.width }),
          ...(p.image.height && { height: p.image.height }),
          ...(p.image.alt && { alt: p.image.alt }),
        },
      ]
    : undefined;
  return {
    // An SEO title is used as written, without the site name appended
    title: p.seo.title ? { absolute: p.seo.title } : p.title,
    description,
    alternates: { canonical: p.url },
    ...(p.seo.noindex && { robots: { index: false, follow: true } }),
    openGraph: {
      title,
      description,
      url: p.url,
      siteName: p.siteName,
      ...(images && { images }),
      ...(p.type === "post"
        ? {
            type: "article",
            ...(p.publishedAt && {
              publishedTime: p.publishedAt.toISOString(),
            }),
            modifiedTime: p.modifiedAt.toISOString(),
            ...(p.author && { authors: [p.author] }),
          }
        : { type: "website" }),
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      description,
      ...(images && { images: images.map((i) => i.url) }),
    },
  };
}
