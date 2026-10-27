import "server-only";
import { randomBytes } from "node:crypto";
import type { JSONContent } from "@tiptap/core";
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  media,
  postPreviews,
  posts,
  type Term,
  terms,
  user,
} from "@/db/schema";
import { type Actor, canOnPost, hasCap } from "./capabilities";
import { renderContent } from "./content";
import type { PostType } from "./posts";
import { slugify } from "./slug";

const TTL_MS = 60 * 60 * 1000;

export type PreviewInput = {
  postId: number | null;
  type: PostType;
  title: string;
  content: JSONContent | null;
  excerpt: string;
  featuredMediaId: number | null;
  categoryIds: number[];
  tags: string[];
};

export class PreviewError extends Error {}

// Stores the editor's current (possibly unsaved) state for /preview/<token>.
// The live post is never touched.
export async function createPreview(actor: Actor, input: PreviewInput) {
  const plural = input.type === "page" ? "pages" : "posts";
  if (!hasCap(actor, `edit_${plural}`))
    throw new PreviewError("Sorry, you are not allowed to preview this.");
  if (input.postId) {
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, input.postId));
    if (!post || !canOnPost(actor, "edit", post)) {
      throw new PreviewError("Sorry, you are not allowed to preview this.");
    }
  }

  await db.delete(postPreviews).where(lt(postPreviews.expiresAt, sql`now()`));
  const token = randomBytes(24).toString("base64url");
  await db.insert(postPreviews).values({
    token,
    userId: actor.id,
    postId: input.postId,
    data: input as unknown as Record<string, unknown>,
    expiresAt: new Date(Date.now() + TTL_MS),
  });
  return token;
}

// Rebuilds the preview as the shape the theme renders. Only the person who
// created the preview can open it.
export async function loadPreview(token: string, viewerId: string) {
  const [row] = await db
    .select()
    .from(postPreviews)
    .where(
      and(
        eq(postPreviews.token, token),
        eq(postPreviews.userId, viewerId),
        gt(postPreviews.expiresAt, sql`now()`),
      ),
    );
  if (!row) return null;
  const input = row.data as unknown as PreviewInput;

  const [existing] = row.postId
    ? await db.select().from(posts).where(eq(posts.id, row.postId))
    : [];
  const authorId = existing?.authorId ?? viewerId;
  const [[author], featured, cats, tagRows] = await Promise.all([
    db
      .select({ name: user.name, bio: user.bio })
      .from(user)
      .where(eq(user.id, authorId)),
    input.featuredMediaId
      ? db
          .select({
            path: media.path,
            alt: media.alt,
            width: media.width,
            height: media.height,
          })
          .from(media)
          .where(eq(media.id, input.featuredMediaId))
      : Promise.resolve([]),
    input.categoryIds.length
      ? db
          .select()
          .from(terms)
          .where(
            and(
              eq(terms.taxonomy, "category"),
              inArray(terms.id, input.categoryIds),
            ),
          )
      : Promise.resolve([] as Term[]),
    input.tags.length
      ? db
          .select()
          .from(terms)
          .where(
            and(
              eq(terms.taxonomy, "post_tag"),
              inArray(terms.name, input.tags),
            ),
          )
      : Promise.resolve([] as Term[]),
  ]);

  // Tags typed in the editor may not exist yet; show them anyway
  const now = new Date();
  const knownTags = new Set(tagRows.map((t) => t.name.toLowerCase()));
  const newTags: Term[] = input.tags
    .filter((name) => !knownTags.has(name.toLowerCase()))
    .map((name, i) => ({
      id: -(i + 1),
      taxonomy: "post_tag",
      name,
      slug: slugify(name),
      description: "",
      parentId: null,
      meta: {},
      createdAt: now,
      updatedAt: now,
    }));

  const { html, text } = renderContent(input.content);
  return {
    id: existing?.id ?? 0,
    type: input.type,
    status: existing?.status ?? "draft",
    title: input.title,
    slug: existing?.slug ?? slugify(input.title),
    content: input.content,
    contentHtml: html,
    contentText: text,
    excerpt: input.excerpt,
    authorId,
    parentId: existing?.parentId ?? null,
    menuOrder: existing?.menuOrder ?? 0,
    featuredMediaId: input.featuredMediaId,
    commentStatus: existing?.commentStatus ?? "closed",
    password: null,
    sticky: existing?.sticky ?? false,
    template: existing?.template ?? null,
    meta: existing?.meta ?? {},
    trashedStatus: null,
    publishedAt: existing?.publishedAt ?? now,
    searchVector: "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    authorName: author?.name ?? null,
    authorBio: author?.bio ?? null,
    featuredPath: featured[0]?.path ?? null,
    featuredAlt: featured[0]?.alt ?? null,
    featuredWidth: featured[0]?.width ?? null,
    featuredHeight: featured[0]?.height ?? null,
    terms: [...cats, ...tagRows, ...newTags],
  };
}
