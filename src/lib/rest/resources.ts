import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  like,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { type CommentStatus, comments, media, posts, user } from "@/db/schema";
import { queueAutoAltText } from "../ai/alt-text";
import { hasCap } from "../capabilities";
import {
  COMMENTS_TAG,
  CommentError,
  type ModerationAction,
  moderateComment,
  submitComment,
  updateComment,
} from "../comments";
import {
  deleteMedia,
  getMedia,
  storeUpload,
  UploadError,
  updateMedia,
} from "../media";
import {
  getSettings,
  PERMALINK_STRUCTURES,
  SETTINGS_TAG,
  type SiteSettings,
  saveSettings,
} from "../options";
import { postPath } from "../permalinks";
import { getPageTree, POSTS_TAG } from "../posts";
import { siteUrl } from "../site-url";
import {
  createTerm,
  deleteTerm,
  getPostTerms,
  getTerm,
  listTerms,
  type Taxonomy,
  TERMS_TAG,
  updateTerm,
} from "../terms";
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
  serializeComment,
  serializeMedia,
  serializeTerm,
  serializeUser,
} from "./serialize";

const contextOf = (ctx: RestContext) => {
  const c = ctx.query.get("context");
  return c === "edit" || c === "embed" ? c : "view";
};

function page<T>(items: T[], ctx: RestContext, defaultPerPage = 10) {
  const { page: p, perPage, offset } = pagination(ctx.query, defaultPerPage);
  const total = items.length;
  return {
    slice: items.slice(offset, offset + perPage),
    total,
    pages: Math.max(1, Math.ceil(total / perPage)),
    page: p,
  };
}

function sortBy<T>(
  items: T[],
  key: (item: T) => string | number,
  order: string | null,
) {
  const dir = order === "desc" ? -1 : 1;
  return [...items].sort((a, b) =>
    key(a) > key(b) ? dir : key(a) < key(b) ? -dir : 0,
  );
}

// ---------------------------------------------------------------------------
// Categories & tags
// ---------------------------------------------------------------------------

export async function listTermsRoute(
  ctx: RestContext,
  taxonomy: Taxonomy,
): Promise<RestResult> {
  const q = ctx.query;
  let items = await listTerms(taxonomy);

  const postId = intParam(q.get("post"), "post");
  if (postId) {
    const ids = new Set(
      (await getPostTerms([postId])).get(postId)?.map((t) => t.id),
    );
    items = items.filter((t) => ids.has(t.id));
  }
  const search = q.get("search")?.toLowerCase();
  if (search)
    items = items.filter(
      (t) => t.name.toLowerCase().includes(search) || t.slug.includes(search),
    );
  const include = idList(q.get("include"), "include");
  if (include) items = items.filter((t) => include.includes(t.id));
  const exclude = idList(q.get("exclude"), "exclude");
  if (exclude) items = items.filter((t) => !exclude.includes(t.id));
  const slugs = stringList(q.get("slug"));
  if (slugs) items = items.filter((t) => slugs.includes(t.slug));
  const parent = intParam(q.get("parent"), "parent");
  if (parent !== undefined)
    items = items.filter((t) => (t.parentId ?? 0) === parent);
  if (boolParam(q.get("hide_empty"))) items = items.filter((t) => t.count > 0);

  const orderby = q.get("orderby") ?? "name";
  const key = {
    name: (t: (typeof items)[number]) => t.name.toLowerCase(),
    id: (t: (typeof items)[number]) => t.id,
    slug: (t: (typeof items)[number]) => t.slug,
    count: (t: (typeof items)[number]) => t.count,
  }[orderby];
  if (!key)
    throw new RestError(
      "rest_invalid_param",
      "Invalid parameter(s): orderby",
      400,
    );
  const result = page(sortBy(items, key, q.get("order")), ctx);
  return {
    data: result.slice.map((t) => serializeTerm(t, contextOf(ctx))),
    total: result.total,
    pages: result.pages,
  };
}

async function loadTerm(ctx: RestContext, taxonomy: Taxonomy) {
  const term = await getTerm(intParam(ctx.params.id, "id") ?? 0);
  if (!term || term.taxonomy !== taxonomy)
    throw new RestError("rest_term_invalid", "Term does not exist.", 404);
  return term;
}

export async function getTermRoute(
  ctx: RestContext,
  taxonomy: Taxonomy,
): Promise<RestResult> {
  const term = await loadTerm(ctx, taxonomy);
  const withCount =
    (await listTerms(taxonomy)).find((t) => t.id === term.id) ?? term;
  return { data: serializeTerm(withCount, contextOf(ctx)) };
}

function termInput(body: Record<string, unknown>) {
  return {
    name: rawText(body.name) ?? "",
    slug: body.slug !== undefined ? String(body.slug) : undefined,
    description:
      body.description !== undefined ? String(body.description) : undefined,
    parentId:
      body.parent !== undefined
        ? intParam(body.parent, "parent") || null
        : undefined,
  };
}

export async function createTermRoute(
  ctx: RestContext,
  taxonomy: Taxonomy,
): Promise<RestResult> {
  await requireCap(ctx, "manage_categories");
  const input = termInput(await ctx.body());
  if (!input.name.trim())
    throw new RestError(
      "rest_missing_callback_param",
      "Missing parameter(s): name",
      400,
    );
  const term = await createTerm(taxonomy, input);
  invalidate(TERMS_TAG);
  return { data: serializeTerm(term, "edit"), status: 201 };
}

export async function updateTermRoute(
  ctx: RestContext,
  taxonomy: Taxonomy,
): Promise<RestResult> {
  await requireCap(ctx, "manage_categories");
  const term = await loadTerm(ctx, taxonomy);
  const body = await ctx.body();
  const input = termInput(body);
  const updated = await updateTerm(term.id, {
    name: input.name || term.name,
    slug: input.slug,
    description: input.description ?? term.description,
    parentId: input.parentId !== undefined ? input.parentId : term.parentId,
  });
  invalidate(TERMS_TAG, POSTS_TAG);
  return { data: serializeTerm(updated, "edit") };
}

export async function deleteTermRoute(
  ctx: RestContext,
  taxonomy: Taxonomy,
): Promise<RestResult> {
  await requireCap(ctx, "manage_categories");
  const term = await loadTerm(ctx, taxonomy);
  if (
    !(boolParam(ctx.query.get("force")) ?? boolParam((await ctx.body()).force))
  ) {
    throw new RestError(
      "rest_trash_not_supported",
      "Terms do not support trashing. Set 'force=true' to delete.",
      501,
    );
  }
  const settings = await getSettings();
  try {
    await deleteTerm(term.id, settings.defaultCategory);
  } catch (error) {
    throw new RestError("rest_cannot_delete", (error as Error).message, 403);
  }
  invalidate(TERMS_TAG, POSTS_TAG);
  return { data: { deleted: true, previous: serializeTerm(term, "edit") } };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const hasPublished = sql`exists (select 1 from ${posts} where ${posts.authorId} = ${user.id} and ${posts.status} = 'publish')`;

export async function listUsersRoute(ctx: RestContext): Promise<RestResult> {
  const q = ctx.query;
  const viewer = await ctx.viewer();
  const privileged = !!viewer && hasCap(viewer, "list_users");
  const context = contextOf(ctx);
  if (context === "edit" && !privileged)
    throw forbidden("Sorry, you are not allowed to list users.");
  const { perPage, offset } = pagination(q);

  const where: SQL[] = [];
  // Like WordPress, anonymous visitors only see people who have published
  if (!privileged || boolParam(q.get("has_published_posts")))
    where.push(hasPublished);
  const search = q.get("search")?.trim();
  if (search)
    where.push(
      or(
        ilike(user.name, `%${search}%`),
        privileged ? ilike(user.email, `%${search}%`) : sql`false`,
      ) as SQL,
    );
  const include = stringList(q.get("include"));
  if (include) where.push(inArray(user.id, include));
  const roles = stringList(q.get("roles"));
  if (roles) {
    if (!privileged)
      throw forbidden("Sorry, you are not allowed to filter users by role.");
    where.push(
      inArray(user.role, roles as (typeof user.role.enumValues)[number][]),
    );
  }

  const order = q.get("order") === "desc" ? desc : asc;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(user)
      .where(and(...where))
      .orderBy(q.get("orderby") === "id" ? order(user.id) : order(user.name))
      .limit(perPage)
      .offset(offset),
    db
      .select({ total: count() })
      .from(user)
      .where(and(...where)),
  ]);
  return {
    data: rows.map((u) =>
      serializeUser(u, privileged && context === "edit" ? "edit" : "view"),
    ),
    total,
    pages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getUserRoute(ctx: RestContext): Promise<RestResult> {
  const viewer = await ctx.viewer();
  const id = ctx.params.id === "me" ? viewer?.id : ctx.params.id;
  if (ctx.params.id === "me" && !viewer)
    throw new RestError(
      "rest_not_logged_in",
      "You are not currently logged in.",
      401,
    );
  const [row] = id ? await db.select().from(user).where(eq(user.id, id)) : [];
  if (!row)
    throw new RestError("rest_user_invalid_id", "Invalid user ID.", 404);

  const self = viewer?.id === row.id;
  const privileged = self || (!!viewer && hasCap(viewer, "list_users"));
  if (!privileged) {
    const [published] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.authorId, row.id), eq(posts.status, "publish")))
      .limit(1);
    if (!published)
      throw new RestError(
        "rest_user_cannot_view",
        "Sorry, you are not allowed to view this user.",
        401,
      );
  }
  const wantsEdit = contextOf(ctx) === "edit" || ctx.params.id === "me";
  return {
    data: serializeUser(row, privileged && wantsEdit ? "edit" : "view"),
  };
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export async function listMediaRoute(ctx: RestContext): Promise<RestResult> {
  const q = ctx.query;
  const { perPage, offset } = pagination(q);
  const where: SQL[] = [];
  const search = q.get("search")?.trim();
  if (search)
    where.push(
      or(
        ilike(media.title, `%${search}%`),
        ilike(media.filename, `%${search}%`),
      ) as SQL,
    );
  const type = q.get("media_type");
  if (type === "image") where.push(like(media.mimeType, "image/%"));
  else if (type === "video" || type === "audio")
    where.push(like(media.mimeType, `${type}/%`));
  else if (type === "application")
    where.push(like(media.mimeType, "application/%"));
  const mime = q.get("mime_type");
  if (mime) where.push(eq(media.mimeType, mime));
  const authors = stringList(q.get("author"));
  if (authors) where.push(inArray(media.uploaderId, authors));
  const include = idList(q.get("include"), "include");
  if (include) where.push(inArray(media.id, include.length ? include : [0]));

  const settings = await getSettings();
  const order = q.get("order") === "asc" ? asc : desc;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(media)
      .where(and(...where))
      .orderBy(order(media.createdAt), order(media.id))
      .limit(perPage)
      .offset(offset),
    db
      .select({ total: count() })
      .from(media)
      .where(and(...where)),
  ]);
  return {
    data: rows.map((m) => serializeMedia(m, settings, contextOf(ctx))),
    total,
    pages: Math.max(1, Math.ceil(total / perPage)),
  };
}

async function loadMedia(ctx: RestContext) {
  const item = await getMedia(intParam(ctx.params.id, "id") ?? 0);
  if (!item)
    throw new RestError("rest_post_invalid_id", "Invalid post ID.", 404);
  return item;
}

export async function getMediaRoute(ctx: RestContext): Promise<RestResult> {
  const item = await loadMedia(ctx);
  return { data: serializeMedia(item, await getSettings(), contextOf(ctx)) };
}

// Accepts multipart uploads (field "file") or a raw body with a
// Content-Disposition filename, the two forms WordPress supports.
export async function createMediaRoute(ctx: RestContext): Promise<RestResult> {
  const viewer = await requireCap(ctx, "upload_files");
  const request = ctx.request;
  const type = request.headers.get("content-type") ?? "";
  let file: File | null = null;
  let fields: Record<string, unknown> = {};

  if (type.includes("multipart/form-data")) {
    const form = await request.formData();
    const value = form.get("file");
    if (value instanceof File) file = value;
    fields = Object.fromEntries(
      [...form.entries()].filter(([k]) => k !== "file"),
    );
  } else {
    const disposition = request.headers.get("content-disposition") ?? "";
    const name = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1];
    if (!name)
      throw new RestError(
        "rest_upload_no_content_disposition",
        "No Content-Disposition supplied.",
        400,
      );
    file = new File([await request.arrayBuffer()], decodeURIComponent(name), {
      type: type.split(";")[0].trim(),
    });
  }
  if (!file || file.size === 0)
    throw new RestError("rest_upload_no_data", "No data supplied.", 400);

  let item: Awaited<ReturnType<typeof storeUpload>>;
  try {
    item = await storeUpload(file, viewer.id);
  } catch (error) {
    if (error instanceof UploadError)
      throw new RestError("rest_upload_unknown_error", error.message, 400);
    throw error;
  }
  if (fields.title || fields.alt_text || fields.caption) {
    item = await updateMedia(item.id, {
      title: rawText(fields.title) ?? item.title,
      alt: String(fields.alt_text ?? item.alt),
      caption: rawText(fields.caption) ?? item.caption,
    });
  }
  if (!item.alt) await queueAutoAltText([item], viewer.id);
  return {
    data: serializeMedia(item, await getSettings(), "edit"),
    status: 201,
  };
}

async function assertOwnsMedia(ctx: RestContext, uploaderId: string | null) {
  const viewer = await requireCap(ctx, "upload_files");
  if (uploaderId !== viewer.id && !hasCap(viewer, "edit_others_posts")) {
    throw forbidden("Sorry, you are not allowed to edit this item.");
  }
}

export async function updateMediaRoute(ctx: RestContext): Promise<RestResult> {
  const item = await loadMedia(ctx);
  await assertOwnsMedia(ctx, item.uploaderId);
  const body = await ctx.body();
  const updated = await updateMedia(item.id, {
    title: rawText(body.title) ?? item.title,
    alt: body.alt_text !== undefined ? String(body.alt_text) : item.alt,
    caption: rawText(body.caption) ?? item.caption,
  });
  invalidate(POSTS_TAG);
  return { data: serializeMedia(updated, await getSettings(), "edit") };
}

export async function deleteMediaRoute(ctx: RestContext): Promise<RestResult> {
  const item = await loadMedia(ctx);
  await assertOwnsMedia(ctx, item.uploaderId);
  if (
    !(boolParam(ctx.query.get("force")) ?? boolParam((await ctx.body()).force))
  ) {
    throw new RestError(
      "rest_trash_not_supported",
      "The post does not support trashing. Set 'force=true' to delete.",
      501,
    );
  }
  const previous = serializeMedia(item, await getSettings(), "edit");
  await deleteMedia(item.id);
  invalidate(POSTS_TAG);
  return { data: { deleted: true, previous } };
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

const STATUS_IN: Record<string, CommentStatus> = {
  approved: "approved",
  approve: "approved",
  "1": "approved",
  hold: "pending",
  "0": "pending",
  spam: "spam",
  trash: "trash",
};

async function postLinks(postIds: number[], settings: SiteSettings) {
  if (postIds.length === 0) return new Map<number, string>();
  const [rows, tree] = await Promise.all([
    db
      .select({
        id: posts.id,
        type: posts.type,
        slug: posts.slug,
        publishedAt: posts.publishedAt,
      })
      .from(posts)
      .where(inArray(posts.id, postIds)),
    getPageTree(),
  ]);
  return new Map(
    rows.map((p) => [
      p.id,
      siteUrl(
        postPath(
          p,
          settings.permalinkStructure,
          tree.find((t) => t.id === p.id)?.path,
        ),
      ),
    ]),
  );
}

export async function listCommentsRoute(ctx: RestContext): Promise<RestResult> {
  const q = ctx.query;
  const { perPage, offset } = pagination(q);
  const viewer = await ctx.viewer();
  const moderator = !!viewer && hasCap(viewer, "moderate_comments");
  const context = contextOf(ctx);
  if (context === "edit" && !moderator)
    throw forbidden("Sorry, you are not allowed to edit comments.");

  const where: SQL[] = [];
  const status = q.get("status") ?? "approved";
  if (status !== "approved" && status !== "approve" && !moderator) {
    throw forbidden("Query parameter not permitted: status");
  }
  if (status !== "all") {
    const mapped = STATUS_IN[status];
    if (!mapped)
      throw new RestError(
        "rest_invalid_param",
        "Invalid parameter(s): status",
        400,
      );
    where.push(eq(comments.status, mapped));
  }
  if (!moderator) {
    // Only comments on published content are public
    where.push(
      inArray(
        comments.postId,
        db
          .select({ id: posts.id })
          .from(posts)
          .where(eq(posts.status, "publish")),
      ),
    );
  }
  const postIds = idList(q.get("post"), "post");
  if (postIds) where.push(inArray(comments.postId, postIds));
  const parents = idList(q.get("parent"), "parent");
  if (parents) {
    where.push(
      parents.includes(0)
        ? (or(
            sql`${comments.parentId} is null`,
            inArray(comments.parentId, parents),
          ) as SQL)
        : inArray(comments.parentId, parents),
    );
  }
  const search = q.get("search")?.trim();
  if (search) where.push(ilike(comments.content, `%${search}%`));

  const order = q.get("order") === "asc" ? asc : desc;
  const settings = await getSettings();
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(comments)
      .where(and(...where))
      .orderBy(order(comments.createdAt), order(comments.id))
      .limit(perPage)
      .offset(offset),
    db
      .select({ total: count() })
      .from(comments)
      .where(and(...where)),
  ]);
  const links = await postLinks(
    [...new Set(rows.map((r) => r.postId))],
    settings,
  );
  return {
    data: rows.map((c) =>
      serializeComment(
        c,
        settings,
        links.get(c.postId) ?? siteUrl("/"),
        moderator && context === "edit" ? "edit" : "view",
      ),
    ),
    total,
    pages: Math.max(1, Math.ceil(total / perPage)),
  };
}

async function loadComment(ctx: RestContext) {
  const id = intParam(ctx.params.id, "id") ?? 0;
  const [row] = await db.select().from(comments).where(eq(comments.id, id));
  if (!row)
    throw new RestError("rest_comment_invalid_id", "Invalid comment ID.", 404);
  return row;
}

async function serializeOne(
  comment: typeof comments.$inferSelect,
  context: "view" | "edit",
) {
  const settings = await getSettings();
  const links = await postLinks([comment.postId], settings);
  return serializeComment(
    comment,
    settings,
    links.get(comment.postId) ?? siteUrl("/"),
    context,
  );
}

export async function getCommentRoute(ctx: RestContext): Promise<RestResult> {
  const comment = await loadComment(ctx);
  const viewer = await ctx.viewer();
  const moderator = !!viewer && hasCap(viewer, "moderate_comments");
  if (comment.status !== "approved" && !moderator) {
    throw new RestError("rest_comment_invalid_id", "Invalid comment ID.", 404);
  }
  return {
    data: await serializeOne(
      comment,
      moderator && contextOf(ctx) === "edit" ? "edit" : "view",
    ),
  };
}

export async function createCommentRoute(
  ctx: RestContext,
): Promise<RestResult> {
  const body = await ctx.body();
  const viewer = await ctx.viewer();
  try {
    const saved = await submitComment(
      {
        postId: intParam(body.post, "post") ?? 0,
        parentId: intParam(body.parent, "parent") || null,
        content: rawText(body.content) ?? "",
        authorName: String(body.author_name ?? ""),
        authorEmail: String(body.author_email ?? ""),
        authorUrl: String(body.author_url ?? ""),
      },
      viewer,
      { ip: ctx.ip, userAgent: ctx.request.headers.get("user-agent") },
    );
    if (saved.status === "approved") invalidate(COMMENTS_TAG);
    const moderator = !!viewer && hasCap(viewer, "moderate_comments");
    return {
      data: await serializeOne(saved, moderator ? "edit" : "view"),
      status: 201,
    };
  } catch (error) {
    if (error instanceof CommentError)
      throw new RestError("rest_comment_failed", error.message, 400);
    throw error;
  }
}

const STATUS_ACTION: Record<CommentStatus, ModerationAction> = {
  approved: "approve",
  pending: "unapprove",
  spam: "spam",
  trash: "trash",
};

export async function updateCommentRoute(
  ctx: RestContext,
): Promise<RestResult> {
  await requireCap(ctx, "moderate_comments");
  const comment = await loadComment(ctx);
  const body = await ctx.body();
  if (
    body.content !== undefined ||
    body.author_name !== undefined ||
    body.author_email !== undefined ||
    body.author_url !== undefined
  ) {
    await updateComment(comment.id, {
      content: rawText(body.content) ?? comment.content,
      authorName: String(body.author_name ?? comment.authorName),
      authorEmail: String(body.author_email ?? comment.authorEmail),
      authorUrl: String(body.author_url ?? comment.authorUrl),
    });
  }
  if (body.status !== undefined) {
    const status = STATUS_IN[String(body.status)];
    if (!status)
      throw new RestError(
        "rest_invalid_param",
        "Invalid parameter(s): status",
        400,
      );
    await moderateComment(comment.id, STATUS_ACTION[status]);
  }
  invalidate(COMMENTS_TAG);
  return { data: await serializeOne(await loadComment(ctx), "edit") };
}

export async function deleteCommentRoute(
  ctx: RestContext,
): Promise<RestResult> {
  await requireCap(ctx, "moderate_comments");
  const comment = await loadComment(ctx);
  const force =
    boolParam(ctx.query.get("force")) ??
    boolParam((await ctx.body()).force) ??
    false;
  const previous = await serializeOne(comment, "edit");
  if (force) {
    await moderateComment(comment.id, "delete");
    invalidate(COMMENTS_TAG);
    return { data: { deleted: true, previous } };
  }
  if (comment.status === "trash")
    throw new RestError(
      "rest_already_trashed",
      "The comment has already been trashed.",
      410,
    );
  await moderateComment(comment.id, "trash");
  invalidate(COMMENTS_TAG);
  return { data: await serializeOne(await loadComment(ctx), "edit") };
}

// ---------------------------------------------------------------------------
// Search, settings, types, taxonomies
// ---------------------------------------------------------------------------

export async function searchRoute(ctx: RestContext): Promise<RestResult> {
  const q = ctx.query;
  const { perPage, offset } = pagination(q);
  const term = q.get("search")?.trim() ?? "";
  const type = q.get("type") ?? "post";
  if (type !== "post") return { data: [], total: 0, pages: 0 };
  const subtypes = (stringList(q.get("subtype")) ?? ["any"]).flatMap((s) =>
    s === "any" ? ["post", "page"] : [s],
  );

  const where = and(
    inArray(posts.type, subtypes),
    eq(posts.status, "publish"),
    term
      ? sql`${posts.searchVector} @@ websearch_to_tsquery('english', ${term})`
      : undefined,
  );
  const settings = await getSettings();
  const [rows, [{ total }], tree] = await Promise.all([
    db
      .select({
        id: posts.id,
        title: posts.title,
        type: posts.type,
        slug: posts.slug,
        publishedAt: posts.publishedAt,
      })
      .from(posts)
      .where(where)
      .orderBy(
        term
          ? desc(
              sql`ts_rank(${posts.searchVector}, websearch_to_tsquery('english', ${term}))`,
            )
          : desc(posts.publishedAt),
      )
      .limit(perPage)
      .offset(offset),
    db.select({ total: count() }).from(posts).where(where),
    getPageTree(),
  ]);
  return {
    data: rows.map((r) => ({
      id: r.id,
      title: r.title,
      url: siteUrl(
        postPath(
          r,
          settings.permalinkStructure,
          tree.find((t) => t.id === r.id)?.path,
        ),
      ),
      type: "post",
      subtype: r.type,
      _links: {
        self: [
          {
            embeddable: true,
            href: siteUrl(
              `/wp-json/wp/v2/${r.type === "page" ? "pages" : "posts"}/${r.id}`,
            ),
          },
        ],
      },
    })),
    total,
    pages: Math.max(1, Math.ceil(total / perPage)),
  };
}

function settingsPayload(s: SiteSettings) {
  return {
    title: s.title,
    description: s.tagline,
    url: siteUrl("/").replace(/\/$/, ""),
    email: s.adminEmail,
    timezone: s.timezone,
    date_format: s.dateFormat,
    start_of_week: 1,
    language: "en_US",
    posts_per_page: s.postsPerPage,
    default_category: s.defaultCategory ?? 0,
    default_comment_status: s.defaultCommentStatus,
    show_on_front: s.showOnFront,
    page_on_front: s.pageOnFront ?? 0,
    page_for_posts: s.pageForPosts ?? 0,
    permalink_structure: PERMALINK_STRUCTURES[s.permalinkStructure],
  };
}

export async function getSettingsRoute(ctx: RestContext): Promise<RestResult> {
  await requireCap(ctx, "manage_options");
  return { data: settingsPayload(await getSettings()) };
}

export async function updateSettingsRoute(
  ctx: RestContext,
): Promise<RestResult> {
  await requireCap(ctx, "manage_options");
  const b = await ctx.body();
  const values: Partial<SiteSettings> = {};
  if (b.title !== undefined) values.title = String(b.title);
  if (b.description !== undefined) values.tagline = String(b.description);
  if (b.email !== undefined) values.adminEmail = String(b.email);
  if (b.timezone !== undefined) {
    const tz = String(b.timezone);
    if (tz !== "UTC" && !Intl.supportedValuesOf("timeZone").includes(tz)) {
      throw new RestError(
        "rest_invalid_param",
        "Invalid parameter(s): timezone",
        400,
      );
    }
    values.timezone = tz;
  }
  if (b.date_format !== undefined) values.dateFormat = String(b.date_format);
  if (b.posts_per_page !== undefined)
    values.postsPerPage = Math.min(
      100,
      Math.max(1, intParam(b.posts_per_page, "posts_per_page") ?? 10),
    );
  if (b.default_comment_status !== undefined)
    values.defaultCommentStatus =
      String(b.default_comment_status) === "closed" ? "closed" : "open";
  if (b.default_category !== undefined)
    values.defaultCategory =
      intParam(b.default_category, "default_category") || null;
  await saveSettings(values);
  invalidate(SETTINGS_TAG, POSTS_TAG);
  return { data: settingsPayload(await getSettings()) };
}

export function typesRoute(): RestResult {
  const type = (
    slug: string,
    name: string,
    rest: string,
    taxonomies: string[],
    hierarchical: boolean,
  ) => ({
    description: "",
    hierarchical,
    has_archive: slug === "post",
    name,
    slug,
    taxonomies,
    rest_base: rest,
    rest_namespace: "wp/v2",
  });
  return {
    data: {
      post: type("post", "Posts", "posts", ["category", "post_tag"], false),
      page: type("page", "Pages", "pages", [], true),
      attachment: type("attachment", "Media", "media", [], false),
    },
  };
}

export function taxonomiesRoute(): RestResult {
  return {
    data: {
      category: {
        name: "Categories",
        slug: "category",
        description: "",
        types: ["post"],
        hierarchical: true,
        rest_base: "categories",
        rest_namespace: "wp/v2",
      },
      post_tag: {
        name: "Tags",
        slug: "post_tag",
        description: "",
        types: ["post"],
        hierarchical: false,
        rest_base: "tags",
        rest_namespace: "wp/v2",
      },
    },
  };
}
