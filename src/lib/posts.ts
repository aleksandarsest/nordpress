import "server-only";
import type { JSONContent } from "@tiptap/core";
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import {
  media,
  type Post,
  type PostStatus,
  postRevisions,
  posts,
  postTerms,
  terms,
  user,
} from "@/db/schema";
import { type AiSource, withAiSource } from "./ai-provenance";
import { type Actor, canOnPost, hasCap } from "./capabilities";
import { renderContent } from "./content";
import { getSettings } from "./options";
import { postPath } from "./permalinks";
import { doAction } from "./plugins";
import { siteUrl } from "./site-url";
import { slugify, uniqueSlug } from "./slug";
import { ensureTags, getPostTerms } from "./terms";

export const POST_TYPES = {
  post: { label: "Posts", singular: "Post", hierarchical: false },
  page: { label: "Pages", singular: "Page", hierarchical: true },
} as const;

export type PostType = keyof typeof POST_TYPES;

export function isPostType(value: string): value is PostType {
  return value in POST_TYPES;
}

export const POSTS_TAG = "posts";
const MAX_REVISIONS = 25;

// Published, or scheduled with a date that has already passed.
const isLive = or(
  eq(posts.status, "publish"),
  and(eq(posts.status, "future"), lte(posts.publishedAt, sql`now()`)),
) as SQL;

const {
  content: _content,
  searchVector: _sv,
  ...summaryColumns
} = getTableColumns(posts);

// ---------------------------------------------------------------------------
// Public reads (cached; invalidated through POSTS_TAG)
// ---------------------------------------------------------------------------

export type PostSummary = Awaited<
  ReturnType<typeof listPublished>
>["items"][number];

export type ListQuery = {
  page?: number;
  perPage: number;
  /** A translation language; without it, only default-language posts. */
  lang?: string;
  termId?: number;
  authorId?: string;
  search?: string;
  year?: number;
  month?: number;
};

export async function listPublished(query: ListQuery) {
  "use cache";
  cacheTag(POSTS_TAG);
  cacheLife("hours");

  const page = Math.max(1, query.page ?? 1);
  const where: SQL[] = [
    eq(posts.type, "post"),
    isLive,
    query.lang
      ? sql`${posts.meta}->>'lang' = ${query.lang}`
      : sql`${posts.meta}->>'lang' is null`,
  ];
  if (query.authorId) where.push(eq(posts.authorId, query.authorId));
  if (query.termId) {
    where.push(
      inArray(
        posts.id,
        db
          .select({ id: postTerms.postId })
          .from(postTerms)
          .where(eq(postTerms.termId, query.termId)),
      ),
    );
  }
  if (query.search) {
    where.push(
      sql`${posts.searchVector} @@ websearch_to_tsquery('english', ${query.search})`,
    );
  }
  if (query.year) {
    const from = new Date(Date.UTC(query.year, (query.month ?? 1) - 1, 1));
    const to = query.month
      ? new Date(Date.UTC(query.year, query.month, 1))
      : new Date(Date.UTC(query.year + 1, 0, 1));
    where.push(gte(posts.publishedAt, from), lt(posts.publishedAt, to));
  }

  const order = query.search
    ? [
        desc(
          sql`ts_rank(${posts.searchVector}, websearch_to_tsquery('english', ${query.search}))`,
        ),
      ]
    : [desc(posts.sticky), desc(posts.publishedAt)];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        ...summaryColumns,
        authorName: user.name,
        featuredPath: media.path,
        featuredWidth: media.width,
        featuredHeight: media.height,
        featuredAlt: media.alt,
      })
      .from(posts)
      .leftJoin(user, eq(user.id, posts.authorId))
      .leftJoin(media, eq(media.id, posts.featuredMediaId))
      .where(and(...where))
      .orderBy(...order)
      .limit(query.perPage)
      .offset((page - 1) * query.perPage),
    db
      .select({ total: count() })
      .from(posts)
      .where(and(...where)),
  ]);

  const termsByPost = await getPostTerms(rows.map((r) => r.id));
  return {
    items: rows.map((r) => ({ ...r, terms: termsByPost.get(r.id) ?? [] })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / query.perPage)),
  };
}

// Live posts as list summaries, in the order of `ids` (e.g. a search ranking).
export async function publishedSummaries(
  ids: number[],
): Promise<PostSummary[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      ...summaryColumns,
      authorName: user.name,
      featuredPath: media.path,
      featuredWidth: media.width,
      featuredHeight: media.height,
      featuredAlt: media.alt,
    })
    .from(posts)
    .leftJoin(user, eq(user.id, posts.authorId))
    .leftJoin(media, eq(media.id, posts.featuredMediaId))
    .where(and(inArray(posts.id, ids), isLive));
  const termsByPost = await getPostTerms(rows.map((r) => r.id));
  const byId = new Map(
    rows.map((r) => [r.id, { ...r, terms: termsByPost.get(r.id) ?? [] }]),
  );
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export const LIVE_POST_SQL = isLive;

export type PublishedLookup = { id: number } | { type: string; slug: string };

export async function getPublished(lookup: PublishedLookup) {
  "use cache";
  cacheTag(POSTS_TAG);
  cacheLife("hours");

  const match =
    "id" in lookup
      ? eq(posts.id, lookup.id)
      : and(eq(posts.type, lookup.type), eq(posts.slug, lookup.slug));

  const [row] = await db
    .select({
      post: posts,
      authorName: user.name,
      authorBio: user.bio,
      featuredPath: media.path,
      featuredWidth: media.width,
      featuredHeight: media.height,
      featuredAlt: media.alt,
    })
    .from(posts)
    .leftJoin(user, eq(user.id, posts.authorId))
    .leftJoin(media, eq(media.id, posts.featuredMediaId))
    .where(and(match, isLive));
  if (!row) return null;

  const termsByPost = await getPostTerms([row.post.id]);
  return {
    ...row.post,
    authorName: row.authorName,
    authorBio: row.authorBio,
    featuredPath: row.featuredPath,
    featuredAlt: row.featuredAlt,
    featuredWidth: row.featuredWidth,
    featuredHeight: row.featuredHeight,
    terms: termsByPost.get(row.post.id) ?? [],
  };
}

export type PageNode = {
  id: number;
  title: string;
  slug: string;
  parentId: number | null;
  menuOrder: number;
  path: string;
  /** Set for translated pages. */
  lang: string | null;
};

// Every published page with its full slug path, for menus and routing.
export async function getPageTree(): Promise<PageNode[]> {
  "use cache";
  cacheTag(POSTS_TAG);
  cacheLife("hours");

  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      parentId: posts.parentId,
      menuOrder: posts.menuOrder,
      lang: sql<string | null>`${posts.meta}->>'lang'`,
    })
    .from(posts)
    .where(and(eq(posts.type, "page"), isLive))
    .orderBy(asc(posts.menuOrder), asc(posts.title));

  const byId = new Map(rows.map((r) => [r.id, r]));
  const pathOf = (id: number, seen = new Set<number>()): string => {
    const node = byId.get(id);
    if (!node || seen.has(id)) return "";
    seen.add(id);
    const parent = node.parentId ? pathOf(node.parentId, seen) : "";
    return parent ? `${parent}/${node.slug}` : node.slug;
  };
  return rows.map((r) => ({ ...r, path: pathOf(r.id) }));
}

export async function getAuthor(id: string) {
  "use cache";
  cacheTag(POSTS_TAG);
  cacheLife("hours");

  const [row] = await db
    .select({ id: user.id, name: user.name, bio: user.bio, image: user.image })
    .from(user)
    .where(eq(user.id, id));
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Admin reads (per request, never cached)
// ---------------------------------------------------------------------------

export type AdminListQuery = {
  type: PostType;
  status?: PostStatus | "all";
  search?: string;
  page?: number;
  perPage?: number;
  authorId?: string;
};

export async function adminListPosts(q: AdminListQuery) {
  const perPage = q.perPage ?? 20;
  const page = Math.max(1, q.page ?? 1);
  const where: SQL[] = [eq(posts.type, q.type)];
  if (!q.status || q.status === "all") where.push(ne(posts.status, "trash"));
  else where.push(eq(posts.status, q.status));
  if (q.search) where.push(ilike(posts.title, `%${q.search}%`));
  if (q.authorId) where.push(eq(posts.authorId, q.authorId));

  const [rows, [{ total }], statusCounts] = await Promise.all([
    db
      .select({ ...summaryColumns, authorName: user.name })
      .from(posts)
      .leftJoin(user, eq(user.id, posts.authorId))
      .where(and(...where))
      .orderBy(desc(posts.updatedAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db
      .select({ total: count() })
      .from(posts)
      .where(and(...where)),
    db
      .select({ status: posts.status, n: count() })
      .from(posts)
      .where(eq(posts.type, q.type))
      .groupBy(posts.status),
  ]);

  const termsByPost = await getPostTerms(rows.map((r) => r.id));
  const counts = Object.fromEntries(statusCounts.map((c) => [c.status, c.n]));
  return {
    items: rows.map((r) => ({ ...r, terms: termsByPost.get(r.id) ?? [] })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    counts: counts as Partial<Record<PostStatus, number>>,
  };
}

export async function getPostForEdit(id: number) {
  const [post] = await db.select().from(posts).where(eq(posts.id, id));
  if (!post) return null;
  const [termRows, revisions] = await Promise.all([
    db
      .select({ id: terms.id, taxonomy: terms.taxonomy, name: terms.name })
      .from(postTerms)
      .innerJoin(terms, eq(terms.id, postTerms.termId))
      .where(eq(postTerms.postId, id)),
    db
      .select({
        id: postRevisions.id,
        createdAt: postRevisions.createdAt,
        authorName: user.name,
      })
      .from(postRevisions)
      .leftJoin(user, eq(user.id, postRevisions.authorId))
      .where(eq(postRevisions.postId, id))
      .orderBy(desc(postRevisions.createdAt)),
  ]);
  return {
    post,
    categoryIds: termRows
      .filter((t) => t.taxonomy === "category")
      .map((t) => t.id),
    tags: termRows.filter((t) => t.taxonomy === "post_tag").map((t) => t.name),
    revisions,
  };
}

export async function listParentCandidates(type: PostType, excludeId?: number) {
  return db
    .select({ id: posts.id, title: posts.title, parentId: posts.parentId })
    .from(posts)
    .where(
      and(
        eq(posts.type, type),
        ne(posts.status, "trash"),
        excludeId ? ne(posts.id, excludeId) : undefined,
      ),
    )
    .orderBy(asc(posts.title));
}

export async function dashboardStats() {
  const rows = await db
    .select({ type: posts.type, status: posts.status, n: count() })
    .from(posts)
    .groupBy(posts.type, posts.status);
  const get = (type: string, status: PostStatus) =>
    rows.find((r) => r.type === type && r.status === status)?.n ?? 0;
  return {
    posts: get("post", "publish"),
    pages: get("page", "publish"),
    drafts: get("post", "draft") + get("page", "draft"),
    pending: get("post", "pending") + get("page", "pending"),
  };
}

export async function recentDrafts(authorId: string, limit = 5) {
  return db
    .select({ id: posts.id, title: posts.title, updatedAt: posts.updatedAt })
    .from(posts)
    .where(and(eq(posts.status, "draft"), eq(posts.authorId, authorId)))
    .orderBy(desc(posts.updatedAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export type SaveIntent = "draft" | "pending" | "publish" | "private";

export type SavePostInput = {
  id?: number;
  type: PostType;
  intent: SaveIntent;
  title: string;
  slug?: string;
  content: JSONContent | null;
  excerpt?: string;
  publishedAt?: Date | null;
  parentId?: number | null;
  menuOrder?: number;
  featuredMediaId?: number | null;
  commentStatus?: "open" | "closed";
  sticky?: boolean;
  categoryIds?: number[];
  /** Tag names; missing tags are created. */
  tags?: string[];
  /** Existing tag ids (the REST API's shape). */
  tagIds?: number[];
  /** Owner of a new post; defaults to the actor. Needs edit_others_* to differ. */
  authorId?: string;
  /** Where the save came from; lets plugins ignore bulk imports. */
  source?: "app" | "import";
  /** Set when AI wrote some of this content (see src/lib/ai-provenance.ts). */
  aiSource?: AiSource;
  /** Only members (and staff) see the full content; left as is when omitted. */
  membersOnly?: boolean;
};

export class PostError extends Error {}

async function freeSlug(type: string, base: string, excludeId?: number) {
  return uniqueSlug(base, async (slug) => {
    const [hit] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.type, type), eq(posts.slug, slug)));
    return !!hit && hit.id !== excludeId;
  });
}

function resolveStatus(
  actor: Actor,
  input: SavePostInput,
  existing: Post | undefined,
): { status: PostStatus; publishedAt: Date | null } {
  const ref = {
    type: input.type,
    status: existing?.status ?? "draft",
    authorId: existing?.authorId ?? actor.id,
  };
  const canPublish = canOnPost(actor, "publish", ref);
  let intent = input.intent;
  if ((intent === "publish" || intent === "private") && !canPublish) {
    intent = "pending";
  }

  if (intent === "publish") {
    const at = input.publishedAt ?? existing?.publishedAt ?? new Date();
    return { status: at > new Date() ? "future" : "publish", publishedAt: at };
  }
  if (intent === "private") {
    return {
      status: "private",
      publishedAt: input.publishedAt ?? existing?.publishedAt ?? new Date(),
    };
  }
  // Drafts and pending posts only keep a date if one was set explicitly
  return { status: intent, publishedAt: input.publishedAt ?? null };
}

// Drops ids that don't exist or belong to the wrong taxonomy.
async function existingTermIds(categoryIds: number[], tagIds: number[]) {
  const wanted = [...new Set([...categoryIds, ...tagIds])];
  if (wanted.length === 0) return [];
  const rows = await db
    .select({ id: terms.id, taxonomy: terms.taxonomy })
    .from(terms)
    .where(inArray(terms.id, wanted));
  return rows
    .filter((t) =>
      t.taxonomy === "category"
        ? categoryIds.includes(t.id)
        : tagIds.includes(t.id),
    )
    .map((t) => t.id);
}

export async function savePost(actor: Actor, input: SavePostInput) {
  const plural = input.type === "page" ? "pages" : "posts";
  if (!hasCap(actor, `edit_${plural}`)) {
    throw new PostError("Sorry, you are not allowed to edit this content.");
  }

  const existing = input.id
    ? (await db.select().from(posts).where(eq(posts.id, input.id)))[0]
    : undefined;
  if (input.id && !existing) throw new PostError("This item no longer exists.");
  if (existing && !canOnPost(actor, "edit", existing)) {
    throw new PostError("Sorry, you are not allowed to edit this item.");
  }
  if (existing?.status === "trash") {
    throw new PostError("Restore this item from the trash before editing it.");
  }

  if (
    input.authorId &&
    input.authorId !== actor.id &&
    !hasCap(actor, `edit_others_${plural}`)
  ) {
    throw new PostError(
      "Sorry, you are not allowed to create content as another user.",
    );
  }
  const { status, publishedAt } = resolveStatus(actor, input, existing);
  const { html, text } = renderContent(input.content);
  const title = input.title.trim();
  const wantedSlug = input.slug ? slugify(input.slug) : "";
  const slug =
    wantedSlug && wantedSlug === existing?.slug
      ? wantedSlug
      : await freeSlug(
          input.type,
          wantedSlug || title || "untitled",
          existing?.id,
        );

  if (input.parentId && existing && input.parentId === existing.id) {
    throw new PostError("A page cannot be its own parent.");
  }

  const values = {
    type: input.type,
    title,
    slug,
    status,
    publishedAt,
    content: input.content,
    contentHtml: html,
    contentText: text,
    excerpt: input.excerpt?.trim() ?? "",
    parentId: POST_TYPES[input.type].hierarchical
      ? (input.parentId ?? null)
      : null,
    menuOrder: input.menuOrder ?? 0,
    featuredMediaId: input.featuredMediaId ?? null,
    commentStatus: input.commentStatus ?? "open",
    sticky:
      input.type === "post" && hasCap(actor, "edit_others_posts")
        ? !!input.sticky
        : (existing?.sticky ?? false),
    ...((input.aiSource || input.membersOnly !== undefined) && {
      meta: {
        ...(input.aiSource
          ? withAiSource(existing?.meta, input.aiSource)
          : (existing?.meta ?? {})),
        ...(input.membersOnly !== undefined && {
          membersOnly: input.membersOnly,
        }),
      },
    }),
  };

  const saved = await db.transaction(async (tx) => {
    let saved: Post;
    if (existing) {
      const changed =
        existing.title !== values.title ||
        JSON.stringify(existing.content) !== JSON.stringify(values.content) ||
        existing.excerpt !== values.excerpt;
      if (changed) {
        await tx.insert(postRevisions).values({
          postId: existing.id,
          authorId: actor.id,
          title: existing.title,
          content: existing.content,
          excerpt: existing.excerpt,
        });
        // Keep only the most recent revisions
        await tx.execute(sql`
          delete from ${postRevisions}
          where ${postRevisions.postId} = ${existing.id}
            and ${postRevisions.id} not in (
              select id from ${postRevisions}
              where ${postRevisions.postId} = ${existing.id}
              order by ${postRevisions.createdAt} desc
              limit ${MAX_REVISIONS}
            )`);
      }
      [saved] = await tx
        .update(posts)
        .set(values)
        .where(eq(posts.id, existing.id))
        .returning();
    } else {
      [saved] = await tx
        .insert(posts)
        .values({ ...values, authorId: input.authorId ?? actor.id })
        .returning();
    }

    if (input.type === "post") {
      const named = input.tags ? await ensureTags(input.tags) : [];
      const termIds = await existingTermIds(input.categoryIds ?? [], [
        ...named,
        ...(input.tagIds ?? []),
      ]);
      await tx.delete(postTerms).where(eq(postTerms.postId, saved.id));
      if (termIds.length) {
        await tx
          .insert(postTerms)
          .values(termIds.map((termId) => ({ postId: saved.id, termId })));
      }
    }
    return saved;
  });

  const settings = await getSettings();
  const pagePath =
    saved.type === "page"
      ? (await getPageTree()).find((p) => p.id === saved.id)?.path
      : undefined;
  await doAction("post.saved", {
    post: saved,
    previousStatus: existing?.status ?? null,
    url: siteUrl(postPath(saved, settings.permalinkStructure, pagePath)),
    actorId: actor.id,
    source: input.source ?? "app",
  });
  return saved;
}

async function loadForAction(actor: Actor, id: number, action: "delete") {
  const [post] = await db.select().from(posts).where(eq(posts.id, id));
  if (!post) throw new PostError("This item no longer exists.");
  if (
    !canOnPost(
      actor,
      action,
      post.status === "trash"
        ? { ...post, status: post.trashedStatus ?? "draft" }
        : post,
    )
  ) {
    throw new PostError("Sorry, you are not allowed to delete this item.");
  }
  return post;
}

export async function trashPost(actor: Actor, id: number) {
  const post = await loadForAction(actor, id, "delete");
  if (post.status === "trash") return post;
  await db
    .update(posts)
    .set({ status: "trash", trashedStatus: post.status })
    .where(eq(posts.id, id));
  await doAction("post.trashed", post);
  return post;
}

export async function restorePost(actor: Actor, id: number) {
  const post = await loadForAction(actor, id, "delete");
  if (post.status !== "trash") return post;
  // WordPress restores to draft so nothing goes live unexpectedly
  await db
    .update(posts)
    .set({ status: "draft", trashedStatus: null })
    .where(eq(posts.id, id));
  return post;
}

export async function deletePostPermanently(actor: Actor, id: number) {
  const post = await loadForAction(actor, id, "delete");
  await db.transaction(async (tx) => {
    await tx
      .update(posts)
      .set({ parentId: post.parentId })
      .where(eq(posts.parentId, id));
    await tx.delete(posts).where(eq(posts.id, id));
  });
  await doAction("post.deleted", post);
  return post;
}

export async function restoreRevision(actor: Actor, revisionId: number) {
  const [rev] = await db
    .select()
    .from(postRevisions)
    .where(eq(postRevisions.id, revisionId));
  if (!rev) throw new PostError("Revision not found.");
  const data = await getPostForEdit(rev.postId);
  if (!data) throw new PostError("This item no longer exists.");
  const { post } = data;
  return savePost(actor, {
    id: post.id,
    type: post.type as PostType,
    intent: post.status === "future" ? "publish" : (post.status as SaveIntent),
    title: rev.title,
    slug: post.slug,
    content: rev.content,
    excerpt: rev.excerpt,
    publishedAt: post.publishedAt,
    parentId: post.parentId,
    menuOrder: post.menuOrder,
    featuredMediaId: post.featuredMediaId,
    commentStatus: post.commentStatus,
    sticky: post.sticky,
    categoryIds: data.categoryIds,
    tags: data.tags,
  });
}
