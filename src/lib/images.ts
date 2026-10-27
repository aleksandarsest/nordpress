import "server-only";
import { inArray } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getImageProps } from "next/image";
import { db } from "@/db";
import { media } from "@/db/schema";
import { POSTS_TAG } from "./posts";

// The theme's content column is 48rem wide
export const CONTENT_SIZES = "(min-width: 800px) 768px, 100vw";

async function dimensions(paths: string[]) {
  "use cache";
  cacheTag(POSTS_TAG);
  cacheLife("days");
  const rows = await db
    .select({ path: media.path, width: media.width, height: media.height })
    .from(media)
    .where(inArray(media.path, paths));
  return Object.fromEntries(rows.map((r) => [r.path, r]));
}

const escapeAttr = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

// Gives uploaded images in post HTML a responsive srcset served by the image
// optimizer, plus lazy loading. Other images just get lazy loading.
export async function responsiveContent(html: string): Promise<string> {
  const uploads = [
    ...html.matchAll(/<img\b[^>]*?\ssrc="\/uploads\/([^"?]+)"/g),
  ].map((m) => m[1]);
  const dims = uploads.length ? await dimensions([...new Set(uploads)]) : {};

  return html.replace(/<img\b([^>]*?)\/?>/g, (tag, attrs: string) => {
    const src = attrs.match(/\ssrc="([^"]*)"/)?.[1] ?? "";
    const alt = attrs.match(/\salt="([^"]*)"/)?.[1] ?? "";
    const known = src.startsWith("/uploads/")
      ? dims[src.slice("/uploads/".length)]
      : undefined;
    if (!known?.width || !known.height) {
      return /\sloading=/.test(attrs)
        ? tag
        : `<img${attrs} loading="lazy" decoding="async">`;
    }
    const { props } = getImageProps({
      src,
      alt: "",
      width: known.width,
      height: known.height,
      sizes: CONTENT_SIZES,
    });
    return `<img src="${escapeAttr(props.src)}" srcset="${escapeAttr(props.srcSet ?? "")}" sizes="${CONTENT_SIZES}" width="${known.width}" height="${known.height}" alt="${alt}" loading="lazy" decoding="async">`;
  });
}
