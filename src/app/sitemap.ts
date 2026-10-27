import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/options";
import { postPath, termPath } from "@/lib/permalinks";
import { getPageTree, listPublished } from "@/lib/posts";
import { listShopProducts } from "@/lib/shop";
import { siteUrl } from "@/lib/site-url";
import { listTerms } from "@/lib/terms";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [settings, pages, posts, categories, tags, shop] = await Promise.all([
    getSettings(),
    getPageTree(),
    listPublished({ perPage: 5000 }),
    listTerms("category"),
    listTerms("post_tag"),
    listShopProducts(),
  ]);
  const translated = settings.languages.length
    ? await Promise.all(
        settings.languages.map((lang) =>
          listPublished({ perPage: 5000, lang }),
        ),
      )
    : [];
  if (!settings.blogPublic) return [];

  return [
    { url: siteUrl("/") },
    ...pages
      .filter((p) => p.id !== settings.pageOnFront)
      .map((p) => ({ url: siteUrl(`/${p.path}`) })),
    ...posts.items.map((p) => ({
      url: siteUrl(postPath(p, settings.permalinkStructure)),
      lastModified: p.updatedAt,
    })),
    ...[...categories, ...tags]
      .filter((t) => t.count > 0)
      .map((t) => ({ url: siteUrl(termPath(t.taxonomy, t.slug)) })),
    ...translated.flatMap((list) =>
      list.items.map((p) => ({
        url: siteUrl(postPath(p, settings.permalinkStructure)),
        lastModified: p.updatedAt,
      })),
    ),
    ...(shop.length ? [{ url: siteUrl("/shop") }] : []),
    ...shop.map((p) => ({
      url: siteUrl(`/shop/${p.slug}`),
      lastModified: p.updatedAt,
    })),
  ];
}
