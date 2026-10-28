import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { media, posts, suggestions } from "@/db/schema";

// Work an outside agent can do with its own model: the same gaps the daily
// Inbox checks look for, listed even when the site has no AI key.

const VISION_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function postsMissingExcerpts(limit: number) {
  return db
    .select({ id: posts.id, title: posts.title })
    .from(posts)
    .where(
      and(
        eq(posts.type, "post"),
        eq(posts.status, "publish"),
        eq(posts.excerpt, ""),
        sql`length(${posts.contentText}) > 600`,
      ),
    )
    .orderBy(desc(posts.publishedAt))
    .limit(limit);
}

export async function imagesMissingAltText(limit: number) {
  return db
    .select()
    .from(media)
    .where(and(eq(media.alt, ""), inArray(media.mimeType, VISION_TYPES)))
    .orderBy(desc(media.createdAt))
    .limit(limit);
}

export async function openSuggestions(limit: number) {
  return db
    .select()
    .from(suggestions)
    .where(eq(suggestions.status, "pending"))
    .orderBy(desc(suggestions.createdAt))
    .limit(limit);
}

export async function getOpenSuggestion(id: number) {
  const [row] = await db
    .select()
    .from(suggestions)
    .where(and(eq(suggestions.id, id), eq(suggestions.status, "pending")));
  return row ?? null;
}

export async function resolveSuggestion(
  id: number,
  status: "applied" | "dismissed",
  userId: string,
) {
  await db
    .update(suggestions)
    .set({ status, resolvedBy: userId, resolvedAt: new Date() })
    .where(eq(suggestions.id, id));
}
