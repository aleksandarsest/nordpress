// Small formatting helpers shared by themes.
import { makeExcerpt } from "../content";
import { formatInZone } from "../dates";
import type { SiteSettings } from "../options";
import { authorPath, postPath, termPath } from "../permalinks";
import type { PostSummary } from "../posts";

export function formatDate(date: Date | null, site: SiteSettings) {
  if (!date) return "";
  return formatInZone(date, site.timezone, site.dateFormat);
}

export function postUrl(
  post: Pick<PostSummary, "id" | "type" | "slug" | "publishedAt">,
  site: SiteSettings,
) {
  return postPath(post, site.permalinkStructure);
}

export function summaryOf(
  post: Pick<PostSummary, "excerpt" | "contentText">,
  words = 55,
) {
  return post.excerpt || makeExcerpt(post.contentText, words);
}

export { authorPath, termPath };
