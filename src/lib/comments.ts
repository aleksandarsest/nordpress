import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { type CommentStatus, comments, posts, user } from "@/db/schema";
import { hasCap } from "./capabilities";
import { getSettings, type SiteSettings } from "./options";
import { applyFilters, doAction } from "./plugins";
import type { Viewer } from "./session";

export const COMMENTS_TAG = "comments";

const MAX_LINKS = 2;
const FLOOD_SECONDS = 15;

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

export type PublicComment = {
  id: number;
  parentId: number | null;
  authorName: string;
  authorUrl: string;
  isStaff: boolean;
  content: string;
  createdAt: Date;
};

export async function getApprovedComments(
  postId: number,
): Promise<PublicComment[]> {
  "use cache";
  cacheTag(COMMENTS_TAG);
  cacheLife("hours");

  return db
    .select({
      id: comments.id,
      parentId: comments.parentId,
      authorName: comments.authorName,
      authorUrl: comments.authorUrl,
      isStaff: sql<boolean>`${user.role} in ('administrator', 'editor', 'author')`,
      content: comments.content,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .leftJoin(user, eq(user.id, comments.userId))
    .where(and(eq(comments.postId, postId), eq(comments.status, "approved")))
    .orderBy(asc(comments.createdAt));
}

export async function countApproved(postIds: number[]) {
  if (postIds.length === 0) return new Map<number, number>();
  const rows = await db
    .select({ postId: comments.postId, n: count() })
    .from(comments)
    .where(
      and(inArray(comments.postId, postIds), eq(comments.status, "approved")),
    )
    .groupBy(comments.postId);
  return new Map(rows.map((r) => [r.postId, r.n]));
}

// Comments close automatically once a post is older than the configured age.
export function commentsCloseAt(
  publishedAt: Date | null,
  settings: SiteSettings,
) {
  if (!settings.closeCommentsDaysOld || !publishedAt) return null;
  return new Date(
    publishedAt.getTime() + settings.closeCommentsDaysOld * 86_400_000,
  );
}

// ---------------------------------------------------------------------------
// Submitting
// ---------------------------------------------------------------------------

export class CommentError extends Error {}

export const commentInput = z.object({
  postId: z.number().int().positive(),
  parentId: z.number().int().positive().nullable(),
  content: z
    .string()
    .trim()
    .min(1, "Please type your comment text.")
    .max(65_525, "Your comment is too long."),
  authorName: z.string().trim().max(245),
  authorEmail: z.string().trim().max(100),
  authorUrl: z
    .string()
    .trim()
    .max(200)
    .refine(
      (v) => v === "" || /^https?:\/\//i.test(v),
      "Please enter a valid website URL.",
    ),
});

export type CommentInput = z.infer<typeof commentInput>;

function countLinks(text: string) {
  return (text.match(/https?:\/\//gi) ?? []).length;
}

async function threadDepth(parentId: number) {
  let depth = 1;
  let current: number | null = parentId;
  const seen = new Set<number>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const [row] = await db
      .select({ parentId: comments.parentId })
      .from(comments)
      .where(eq(comments.id, current));
    if (!row) break;
    current = row.parentId;
    depth++;
  }
  return depth;
}

export async function submitComment(
  raw: CommentInput,
  viewer: Viewer | null,
  meta: { ip: string | null; userAgent: string | null },
) {
  const input = commentInput.parse(raw);
  const settings = await getSettings();

  const [post] = await db
    .select({
      id: posts.id,
      status: posts.status,
      commentStatus: posts.commentStatus,
      publishedAt: posts.publishedAt,
    })
    .from(posts)
    .where(eq(posts.id, input.postId));
  const live =
    post &&
    (post.status === "publish" ||
      (post.status === "future" &&
        post.publishedAt &&
        post.publishedAt <= new Date()));
  if (!post || !live)
    throw new CommentError("Sorry, this post is not available.");

  const closeAt = commentsCloseAt(post.publishedAt, settings);
  if (post.commentStatus !== "open" || (closeAt && closeAt <= new Date())) {
    throw new CommentError("Sorry, comments are closed for this item.");
  }
  if (settings.commentRegistration && !viewer) {
    throw new CommentError("Sorry, you must be logged in to comment.");
  }

  let authorName = input.authorName;
  let authorEmail = input.authorEmail.toLowerCase();
  if (viewer) {
    authorName = viewer.name;
    authorEmail = viewer.email;
  } else if (settings.requireNameEmail) {
    if (!authorName) throw new CommentError("Please fill in your name.");
    if (!z.email().safeParse(authorEmail).success) {
      throw new CommentError("Please enter a valid email address.");
    }
  }
  if (!authorName) authorName = "Anonymous";

  if (input.parentId) {
    const [parent] = await db
      .select({ postId: comments.postId, status: comments.status })
      .from(comments)
      .where(eq(comments.id, input.parentId));
    if (!parent || parent.postId !== post.id || parent.status !== "approved") {
      throw new CommentError(
        "The comment you are replying to is not available.",
      );
    }
    if ((await threadDepth(input.parentId)) >= settings.threadDepth) {
      throw new CommentError(
        "This conversation is nested as deep as it can go.",
      );
    }
  }

  const [duplicate] = await db
    .select({ id: comments.id })
    .from(comments)
    .where(
      and(
        eq(comments.postId, post.id),
        eq(comments.content, input.content),
        authorEmail
          ? eq(comments.authorEmail, authorEmail)
          : eq(comments.authorName, authorName),
      ),
    )
    .limit(1);
  if (duplicate) {
    throw new CommentError(
      "Duplicate comment detected; it looks as though you’ve already said that!",
    );
  }

  const isModerator = !!viewer && hasCap(viewer, "moderate_comments");
  if (!isModerator && meta.ip) {
    const [recent] = await db
      .select({ id: comments.id })
      .from(comments)
      .where(
        and(
          eq(comments.ipAddress, meta.ip),
          gt(
            comments.createdAt,
            sql`now() - make_interval(secs => ${FLOOD_SECONDS})`,
          ),
        ),
      )
      .limit(1);
    if (recent)
      throw new CommentError(
        "You are posting comments too quickly. Slow down.",
      );
  }

  const status = isModerator
    ? "approved"
    : await applyFilters(
        "comment.status",
        await decideStatus(settings, authorEmail, input.content),
        {
          postId: post.id,
          content: input.content,
          authorName,
          authorEmail,
          authorUrl: input.authorUrl,
          ip: meta.ip,
        },
      );

  const [saved] = await db
    .insert(comments)
    .values({
      postId: post.id,
      parentId: input.parentId,
      userId: viewer?.id ?? null,
      authorName,
      authorEmail,
      authorUrl: viewer ? "" : input.authorUrl,
      content: input.content,
      status,
      ipAddress: meta.ip,
      userAgent: meta.userAgent?.slice(0, 254) ?? null,
    })
    .returning();
  await doAction("comment.created", saved);
  return saved;
}

// Mirrors WordPress's check_comment(): hold for moderation when required,
// when the comment has too many links, or for first-time commenters.
async function decideStatus(
  settings: SiteSettings,
  email: string,
  content: string,
): Promise<CommentStatus> {
  if (settings.commentModeration) return "pending";
  if (countLinks(content) > MAX_LINKS) return "pending";
  if (settings.commentPreviouslyApproved) {
    if (!email) return "pending";
    const [known] = await db
      .select({ id: comments.id })
      .from(comments)
      .where(
        and(eq(comments.authorEmail, email), eq(comments.status, "approved")),
      )
      .limit(1);
    return known ? "approved" : "pending";
  }
  return "approved";
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

export type AdminCommentQuery = {
  status?: CommentStatus | "all";
  search?: string;
  postId?: number;
  page?: number;
  perPage?: number;
};

export async function adminListComments(q: AdminCommentQuery) {
  const perPage = q.perPage ?? 20;
  const page = Math.max(1, q.page ?? 1);
  const where: SQL[] = [];
  if (!q.status || q.status === "all") {
    where.push(inArray(comments.status, ["approved", "pending"]));
  } else {
    where.push(eq(comments.status, q.status));
  }
  if (q.postId) where.push(eq(comments.postId, q.postId));
  if (q.search) {
    const pattern = `%${q.search}%`;
    where.push(
      or(
        ilike(comments.content, pattern),
        ilike(comments.authorName, pattern),
        ilike(comments.authorEmail, pattern),
      ) as SQL,
    );
  }

  const [items, [{ total }], statusCounts] = await Promise.all([
    db
      .select({
        comment: comments,
        postTitle: posts.title,
        postType: posts.type,
        postSlug: posts.slug,
        postPublishedAt: posts.publishedAt,
      })
      .from(comments)
      .innerJoin(posts, eq(posts.id, comments.postId))
      .where(and(...where))
      .orderBy(desc(comments.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db
      .select({ total: count() })
      .from(comments)
      .where(and(...where)),
    db
      .select({ status: comments.status, n: count() })
      .from(comments)
      .groupBy(comments.status),
  ]);

  return {
    items,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    counts: Object.fromEntries(
      statusCounts.map((c) => [c.status, c.n]),
    ) as Partial<Record<CommentStatus, number>>,
  };
}

export async function countPendingComments() {
  return db.$count(comments, eq(comments.status, "pending"));
}

export async function getComment(id: number) {
  const [row] = await db.select().from(comments).where(eq(comments.id, id));
  return row ?? null;
}

export type ModerationAction =
  | "approve"
  | "unapprove"
  | "spam"
  | "unspam"
  | "trash"
  | "restore"
  | "delete";

export const MODERATION_ACTIONS: ModerationAction[] = [
  "approve",
  "unapprove",
  "spam",
  "unspam",
  "trash",
  "restore",
  "delete",
];

export async function moderateComment(id: number, action: ModerationAction) {
  const comment = await getComment(id);
  if (!comment) throw new CommentError("Comment not found.");

  switch (action) {
    case "approve":
      return setStatus(id, "approved");
    case "unapprove":
    case "unspam":
      return setStatus(id, "pending");
    case "spam":
      return setStatus(id, "spam");
    case "trash":
      if (comment.status === "trash") return;
      await db
        .update(comments)
        .set({ status: "trash", trashedStatus: comment.status })
        .where(eq(comments.id, id));
      return;
    case "restore":
      await db
        .update(comments)
        .set({
          status: comment.trashedStatus ?? "pending",
          trashedStatus: null,
        })
        .where(eq(comments.id, id));
      return;
    case "delete":
      await db.transaction(async (tx) => {
        // Replies move up a level instead of disappearing with their parent
        await tx
          .update(comments)
          .set({ parentId: comment.parentId })
          .where(eq(comments.parentId, id));
        await tx.delete(comments).where(eq(comments.id, id));
      });
      return;
  }
}

async function setStatus(id: number, status: CommentStatus) {
  await db
    .update(comments)
    .set({ status, trashedStatus: null })
    .where(and(eq(comments.id, id), ne(comments.status, status)));
}

export async function updateComment(
  id: number,
  values: {
    content: string;
    authorName: string;
    authorEmail: string;
    authorUrl: string;
  },
) {
  const content = values.content.trim();
  if (!content) throw new CommentError("Please type your comment text.");
  await db
    .update(comments)
    .set({
      ...values,
      content,
      authorEmail: values.authorEmail.trim().toLowerCase(),
    })
    .where(eq(comments.id, id));
}
