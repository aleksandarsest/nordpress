import "server-only";
import type { JSONContent } from "@tiptap/core";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  lt,
  lte,
  ne,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  media,
  type Post,
  type PostStatus,
  postStatusEnum,
  posts,
  postTerms,
  user,
} from "@/db/schema";
import { queueIndex } from "../ai/embeddings";
import { type Actor, canOnPost, hasCap } from "../capabilities";
import { htmlToDoc } from "../content";
import { parseInZone } from "../dates";
import { getSettings, type SiteSettings } from "../options";
import {
  deletePostPermanently,
  getPageTree,
  getPostForEdit,
  POSTS_TAG,
  PostError,
  type PostType,
  type SaveIntent,
  type SavePostInput,
  savePost,
  trashPost,
} from "../posts";
import { getPostTerms, TERMS_TAG } from "../terms";
import {
  boolParam,
  forbidden,
  idList,
  intParam,
  invalidate,
  pagination,
  type RestContext,
  RestError,
  type RestResult,
  rawText,
  requireCap,
  stringList,
} from "./core";
import {
  type Context,
  serializeMedia,
  serializePost,
  serializeTerm,
  serializeUser,
} from "./serialize";

const plural = (type: PostType) => (type === "page" ? "pages" : "posts");

const invalidId = () =>
  new RestError("rest_post_invalid_id", "Invalid post ID.", 404);

function contextOf(ctx: RestContext): Context {
  const c = ctx.query.get("context");
  return c === "edit" || c === "embed" ? c : "view";
}

const isLive = or(
  eq(posts.status, "publish"),
  and(eq(posts.status, "future"), lte(posts.publishedAt, sql`now()`)),
) as SQL;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function serializeMany(
  rows: Post[],
  settings: SiteSettings,
  context: Context,
  embed: boolean,
) {
  const [termsByPost, tree] = await Promise.all([
    getPostTerms(rows.map((r) => r.id)),
    rows.some((r) => r.type === "page") ? getPageTree() : Promise.resolve([]),
  ]);
  const items = rows.map((post) =>
    serializePost(
      post,
      {
        terms: termsByPost.get(post.id) ?? [],
        pagePath: tree.find((p) => p.id === post.id)?.path,
      },
      settings,
      context,
    ),
  );
  if (embed) await attachEmbeds(items, rows, termsByPost, settings);
  return items;
}

// A practical subset of `_embed`: author, featured media and terms.
async function attachEmbeds(
  items: Record<string, unknown>[],
  rows: Post[],
  termsByPost: Map<number, import("@/db/schema").Term[]>,
  settings: SiteSettings,
) {
  const authorIds = [
    ...new Set(rows.map((r) => r.authorId).filter((id): id is string => !!id)),
  ];
  const mediaIds = [
    ...new Set(
      rows.map((r) => r.featuredMediaId).filter((id): id is number => !!id),
    ),
  ];
  const [authors, featured] = await Promise.all([
    authorIds.length
      ? db.select().from(user).where(inArray(user.id, authorIds))
      : [],
    mediaIds.length
      ? db.select().from(media).where(inArray(media.id, mediaIds))
      : [],
  ]);
  rows.forEach((row, i) => {
    const author = authors.find((a) => a.id === row.authorId);
    const image = featured.find((m) => m.id === row.featuredMediaId);
    const terms = termsByPost.get(row.id) ?? [];
    items[i]._embedded = {
      ...(author && { author: [serializeUser(author, "embed")] }),
      ...(image && {
        "wp:featuredmedia": [serializeMedia(image, settings, "embed")],
      }),
      ...(row.type === "post" && {
        "wp:term": [
          terms
            .filter((t) => t.taxonomy === "category")
            .map((t) => serializeTerm(t, "embed")),
          terms
            .filter((t) => t.taxonomy === "post_tag")
            .map((t) => serializeTerm(t, "embed")),
        ],
      }),
    };
  });
}

const STATUSES = new Set<string>(postStatusEnum.enumValues);

export async function listPosts(
  ctx: RestContext,
  type: PostType,
): Promise<RestResult> {
  const q = ctx.query;
  const context = contextOf(ctx);
  const { page, perPage, offset } = pagination(q);
  const settings = await getSettings();
  const where: SQL[] = [eq(posts.type, type)];

  const statuses = stringList(q.get("status")) ?? ["publish"];
  const wantsPrivate =
    context === "edit" || statuses.some((s) => s !== "publish");
  let viewer: Actor | null = null;
  if (wantsPrivate) {
    viewer = await requireCap(ctx, `edit_${plural(type)}`);
    // Without edit_others_*, a user only sees their own unpublished items
    if (
      !hasCap(viewer, `edit_others_${plural(type)}`) &&
      statuses.some((s) => s !== "publish")
    ) {
      where.push(
        or(eq(posts.status, "publish"), eq(posts.authorId, viewer.id)) as SQL,
      );
    }
  }
  if (statuses.includes("any")) {
    where.push(ne(posts.status, "trash"));
  } else {
    for (const s of statuses) {
      if (!STATUSES.has(s))
        throw new RestError(
          "rest_invalid_param",
          "Invalid parameter(s): status",
          400,
        );
    }
    const only = statuses as PostStatus[];
    where.push(
      only.includes("publish")
        ? (or(
            isLive,
            inArray(
              posts.status,
              only.filter((s) => s !== "publish"),
            ),
          ) as SQL)
        : inArray(posts.status, only),
    );
  }

  const search = q.get("search")?.trim();
  if (search)
    where.push(
      sql`${posts.searchVector} @@ websearch_to_tsquery('english', ${search})`,
    );
  const authors = stringList(q.get("author"));
  if (authors) where.push(inArray(posts.authorId, authors));
  const authorExclude = stringList(q.get("author_exclude"));
  if (authorExclude) where.push(notInArray(posts.authorId, authorExclude));
  const include = idList(q.get("include"), "include");
  if (include) where.push(inArray(posts.id, include.length ? include : [0]));
  const exclude = idList(q.get("exclude"), "exclude");
  if (exclude?.length) where.push(notInArray(posts.id, exclude));
  const slugs = stringList(q.get("slug"));
  if (slugs) where.push(inArray(posts.slug, slugs));
  const before = q.get("before");
  if (before)
    where.push(lt(posts.publishedAt, parseDate(before, settings, "before")));
  const after = q.get("after");
  if (after)
    where.push(gt(posts.publishedAt, parseDate(after, settings, "after")));

  if (type === "post") {
    for (const [param, negate] of [
      ["categories", false],
      ["tags", false],
      ["categories_exclude", true],
      ["tags_exclude", true],
    ] as const) {
      const ids = idList(q.get(param), param);
      if (!ids?.length) continue;
      const tagged = db
        .select({ id: postTerms.postId })
        .from(postTerms)
        .where(inArray(postTerms.termId, ids));
      where.push(
        negate ? notInArray(posts.id, tagged) : inArray(posts.id, tagged),
      );
    }
    const sticky = boolParam(q.get("sticky"));
    if (sticky !== undefined) where.push(eq(posts.sticky, sticky));
  } else {
    const parents = idList(q.get("parent"), "parent");
    if (parents) {
      where.push(
        parents.includes(0)
          ? (or(
              sql`${posts.parentId} is null`,
              inArray(posts.parentId, parents),
            ) as SQL)
          : inArray(posts.parentId, parents),
      );
    }
  }

  const direction = q.get("order") === "asc" ? asc : desc;
  const orderby = q.get("orderby") ?? (search ? "relevance" : "date");
  const order = {
    date: [direction(posts.publishedAt), direction(posts.id)],
    modified: [direction(posts.updatedAt)],
    id: [direction(posts.id)],
    title: [direction(posts.title)],
    slug: [direction(posts.slug)],
    menu_order: [direction(posts.menuOrder), asc(posts.title)],
    relevance: search
      ? [
          desc(
            sql`ts_rank(${posts.searchVector}, websearch_to_tsquery('english', ${search}))`,
          ),
        ]
      : [desc(posts.publishedAt)],
    include: include?.length
      ? [
          sql`array_position(${sql.raw(`ARRAY[${include.join(",")}]::bigint[]`)}, ${posts.id})`,
        ]
      : [desc(posts.publishedAt)],
  }[orderby];
  if (!order)
    throw new RestError(
      "rest_invalid_param",
      "Invalid parameter(s): orderby",
      400,
    );

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(posts)
      .where(and(...where))
      .orderBy(...order)
      .limit(perPage)
      .offset(offset),
    db
      .select({ total: count() })
      .from(posts)
      .where(and(...where)),
  ]);
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (page > pages && total > 0) {
    throw new RestError(
      "rest_post_invalid_page_number",
      "The page number requested is larger than the number of pages available.",
      400,
    );
  }

  return {
    data: await serializeMany(rows, settings, context, q.has("_embed")),
    total,
    pages,
  };
}

function parseDate(value: string, settings: SiteSettings, name: string) {
  const date = parseInZone(value, settings.timezone);
  if (!date)
    throw new RestError(
      "rest_invalid_param",
      `Invalid parameter(s): ${name}`,
      400,
    );
  return date;
}

async function loadPost(ctx: RestContext, type: PostType) {
  const id = intParam(ctx.params.id, "id");
  const [post] = id
    ? await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, id), eq(posts.type, type)))
    : [];
  if (!post) throw invalidId();
  return post;
}

async function readable(ctx: RestContext, post: Post) {
  const live =
    post.status === "publish" ||
    (post.status === "future" &&
      post.publishedAt &&
      post.publishedAt <= new Date());
  if (live && contextOf(ctx) !== "edit") return;
  const viewer = await ctx.viewer();
  if (!viewer || !canOnPost(viewer, "edit", post)) {
    // Hide the existence of unpublished content from people who can't edit it
    if (!live) throw invalidId();
    throw forbidden("Sorry, you are not allowed to edit this post.");
  }
}

export async function getPostRoute(
  ctx: RestContext,
  type: PostType,
): Promise<RestResult> {
  const post = await loadPost(ctx, type);
  await readable(ctx, post);
  const settings = await getSettings();
  const [item] = await serializeMany(
    [post],
    settings,
    contextOf(ctx),
    ctx.query.has("_embed"),
  );
  return { data: item };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

const WRITE_STATUSES: Record<string, SaveIntent> = {
  publish: "publish",
  future: "publish",
  draft: "draft",
  pending: "pending",
  private: "private",
};

async function inputFromBody(
  body: Record<string, unknown>,
  type: PostType,
  settings: SiteSettings,
  existing: Awaited<ReturnType<typeof getPostForEdit>>,
): Promise<SavePostInput> {
  const prev = existing?.post;
  const statusRaw = body.status !== undefined ? String(body.status) : undefined;
  if (statusRaw !== undefined && !(statusRaw in WRITE_STATUSES)) {
    throw new RestError(
      "rest_invalid_param",
      "Invalid parameter(s): status",
      400,
    );
  }
  const intent: SaveIntent = statusRaw
    ? WRITE_STATUSES[statusRaw]
    : prev
      ? prev.status === "future"
        ? "publish"
        : (prev.status as SaveIntent)
      : "draft";

  let content: JSONContent | null | undefined;
  if (body.document && typeof body.document === "object")
    content = body.document as JSONContent;
  else if (body.content !== undefined)
    content = htmlToDoc(rawText(body.content) ?? "");

  let publishedAt: Date | null | undefined;
  if (body.date_gmt)
    publishedAt = parseDate(
      `${String(body.date_gmt).replace(/Z$/i, "")}Z`,
      settings,
      "date_gmt",
    );
  else if (body.date)
    publishedAt = parseDate(String(body.date), settings, "date");
  else if (body.date === null) publishedAt = null;

  const ids = (key: string) => idList(body[key], key);
  const commentStatus =
    body.comment_status !== undefined ? String(body.comment_status) : undefined;
  if (commentStatus && commentStatus !== "open" && commentStatus !== "closed") {
    throw new RestError(
      "rest_invalid_param",
      "Invalid parameter(s): comment_status",
      400,
    );
  }

  return {
    id: prev?.id,
    type,
    intent,
    title: rawText(body.title) ?? prev?.title ?? "",
    slug: body.slug !== undefined ? String(body.slug) : prev?.slug,
    content: content !== undefined ? content : (prev?.content ?? null),
    excerpt: rawText(body.excerpt) ?? prev?.excerpt ?? "",
    publishedAt:
      publishedAt !== undefined ? publishedAt : (prev?.publishedAt ?? null),
    parentId:
      body.parent !== undefined
        ? intParam(body.parent, "parent") || null
        : (prev?.parentId ?? null),
    menuOrder: intParam(body.menu_order, "menu_order") ?? prev?.menuOrder ?? 0,
    featuredMediaId:
      body.featured_media !== undefined
        ? intParam(body.featured_media, "featured_media") || null
        : (prev?.featuredMediaId ?? null),
    commentStatus:
      (commentStatus as "open" | "closed" | undefined) ??
      prev?.commentStatus ??
      settings.defaultCommentStatus,
    sticky: boolParam(body.sticky) ?? prev?.sticky ?? false,
    categoryIds:
      ids("categories") ??
      existing?.categoryIds ??
      (type === "post" && settings.defaultCategory
        ? [settings.defaultCategory]
        : []),
    tagIds: ids("tags") ?? undefined,
    tags: ids("tags") ? undefined : existing?.tags,
  };
}

export async function createPost(
  ctx: RestContext,
  type: PostType,
): Promise<RestResult> {
  if (ctx.params.id) {
    throw new RestError(
      "rest_post_exists",
      "Cannot create existing post.",
      400,
    );
  }
  const viewer = await requireCap(ctx, `edit_${plural(type)}`);
  const settings = await getSettings();
  const input = await inputFromBody(await ctx.body(), type, settings, null);
  const saved = await wrap(() => savePost(viewer, input));
  invalidate(POSTS_TAG, TERMS_TAG);
  queueIndex(saved.id);
  const [item] = await serializeMany([saved], settings, "edit", false);
  return { data: item, status: 201 };
}

export async function updatePost(
  ctx: RestContext,
  type: PostType,
): Promise<RestResult> {
  const post = await loadPost(ctx, type);
  const viewer = await requireCap(ctx, `edit_${plural(type)}`);
  if (!canOnPost(viewer, "edit", post))
    throw forbidden("Sorry, you are not allowed to edit this post.");
  const settings = await getSettings();
  const body = await ctx.body();

  if (body.status === "trash") {
    await wrap(() => trashPost(viewer, post.id));
  } else {
    const existing = await getPostForEdit(post.id);
    const input = await inputFromBody(body, type, settings, existing);
    await wrap(() => savePost(viewer, input));
  }
  invalidate(POSTS_TAG, TERMS_TAG);
  queueIndex(post.id);
  const [fresh] = await db.select().from(posts).where(eq(posts.id, post.id));
  const [item] = await serializeMany([fresh], settings, "edit", false);
  return { data: item };
}

export async function deletePostRoute(
  ctx: RestContext,
  type: PostType,
): Promise<RestResult> {
  const post = await loadPost(ctx, type);
  const viewer = await requireCap(ctx, `delete_${plural(type)}`);
  const settings = await getSettings();
  const force =
    boolParam(ctx.query.get("force")) ??
    boolParam((await ctx.body()).force) ??
    false;

  if (force) {
    const [previous] = await serializeMany([post], settings, "edit", false);
    await wrap(() => deletePostPermanently(viewer, post.id));
    invalidate(POSTS_TAG, TERMS_TAG);
    queueIndex(post.id);
    return { data: { deleted: true, previous } };
  }
  if (post.status === "trash") {
    throw new RestError(
      "rest_already_trashed",
      "The post has already been deleted.",
      410,
    );
  }
  await wrap(() => trashPost(viewer, post.id));
  invalidate(POSTS_TAG, TERMS_TAG);
  queueIndex(post.id);
  const [fresh] = await db.select().from(posts).where(eq(posts.id, post.id));
  const [item] = await serializeMany([fresh], settings, "edit", false);
  return { data: item };
}

// Turns domain errors into REST errors.
async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof PostError) {
      const denied = /not allowed/i.test(error.message);
      throw new RestError(
        denied ? "rest_cannot_edit" : "rest_invalid_param",
        error.message,
        denied ? 403 : 400,
      );
    }
    throw error;
  }
}
