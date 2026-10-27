import type { JSONContent } from "@tiptap/core";
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";
import type {
  FormField,
  FormSettings,
  SubmissionData,
} from "@/lib/forms/fields";

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Users & auth (tables shaped for Better Auth)
// ---------------------------------------------------------------------------

export const roleEnum = pgEnum("role", [
  "administrator",
  "editor",
  "author",
  "contributor",
  "subscriber",
]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: roleEnum("role").notNull().default("subscriber"),
  bio: text("bio"),
  website: text("website"),
  ...timestamps,
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

// Better Auth's own request limits (login, sign-up endpoints)
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// Fixed-window counters shared by every server instance (lib/rate-limit.ts)
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: bigint("window_start", { mode: "number" }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    index("rate_limits_window_idx").on(t.windowStart),
  ],
);

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export const postStatusEnum = pgEnum("post_status", [
  "publish",
  "future",
  "draft",
  "pending",
  "private",
  "trash",
]);

export const posts = pgTable(
  "posts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    // "post", "page", or any registered custom post type
    type: text("type").notNull().default("post"),
    status: postStatusEnum("status").notNull().default("draft"),
    title: text("title").notNull().default(""),
    slug: text("slug").notNull(),
    // Tiptap document; the source of truth for the body
    content: jsonb("content").$type<JSONContent>(),
    // Rendered and plain-text projections of `content`, kept in sync on save
    contentHtml: text("content_html").notNull().default(""),
    contentText: text("content_text").notNull().default(""),
    excerpt: text("excerpt").notNull().default(""),
    authorId: text("author_id").references(() => user.id, {
      onDelete: "set null",
    }),
    parentId: bigint("parent_id", { mode: "number" }),
    menuOrder: integer("menu_order").notNull().default(0),
    featuredMediaId: bigint("featured_media_id", { mode: "number" }),
    commentStatus: text("comment_status", { enum: ["open", "closed"] })
      .notNull()
      .default("open"),
    password: text("password"),
    sticky: boolean("sticky").notNull().default(false),
    template: text("template"),
    // Arbitrary per-post fields (the WordPress post_meta equivalent)
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    // Status the post had before being trashed, restored on untrash
    trashedStatus: postStatusEnum("trashed_status"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(excerpt, '')), 'B') || setweight(to_tsvector('english', coalesce(content_text, '')), 'C')`,
    ),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("posts_type_slug_idx").on(t.type, t.slug),
    index("posts_type_status_published_idx").on(
      t.type,
      t.status,
      t.publishedAt,
    ),
    index("posts_author_idx").on(t.authorId),
    index("posts_parent_idx").on(t.parentId),
    index("posts_search_idx").using("gin", t.searchVector),
  ],
);

export const postRevisions = pgTable(
  "post_revisions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    content: jsonb("content").$type<JSONContent>(),
    excerpt: text("excerpt").notNull().default(""),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("post_revisions_post_idx").on(t.postId, t.createdAt)],
);

// Short-lived snapshots of unsaved editor state, rendered by /preview/<token>
export const postPreviews = pgTable(
  "post_previews",
  {
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    postId: bigint("post_id", { mode: "number" }).references(() => posts.id, {
      onDelete: "cascade",
    }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("post_previews_expires_idx").on(t.expiresAt)],
);

// ---------------------------------------------------------------------------
// Taxonomies
// ---------------------------------------------------------------------------

export const terms = pgTable(
  "terms",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    // "category", "post_tag", or any registered custom taxonomy
    taxonomy: text("taxonomy").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    parentId: bigint("parent_id", { mode: "number" }),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("terms_taxonomy_slug_idx").on(t.taxonomy, t.slug)],
);

export const postTerms = pgTable(
  "post_terms",
  {
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    termId: bigint("term_id", { mode: "number" })
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.termId] }),
    index("post_terms_term_idx").on(t.termId),
  ],
);

// ---------------------------------------------------------------------------
// Navigation menus
// ---------------------------------------------------------------------------

export const menus = pgTable("menus", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  ...timestamps,
});

export const menuItemTypeEnum = pgEnum("menu_item_type", [
  "custom",
  "post",
  "term",
]);

export const menuItems = pgTable(
  "menu_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    menuId: bigint("menu_id", { mode: "number" })
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    parentId: bigint("parent_id", { mode: "number" }),
    position: integer("position").notNull().default(0),
    type: menuItemTypeEnum("type").notNull(),
    // posts.id or terms.id for "post"/"term" items; the link follows renames
    objectId: bigint("object_id", { mode: "number" }),
    url: text("url").notNull().default(""),
    // Empty means "use the linked post or term's current title"
    label: text("label").notNull().default(""),
    openInNewTab: boolean("open_in_new_tab").notNull().default(false),
  },
  (t) => [index("menu_items_menu_idx").on(t.menuId, t.position)],
);

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export const media = pgTable(
  "media",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    uploaderId: text("uploader_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // Path relative to the storage root, e.g. "2026/10/photo.jpg"
    path: text("path").notNull().unique(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    title: text("title").notNull().default(""),
    alt: text("alt").notNull().default(""),
    caption: text("caption").notNull().default(""),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index("media_created_idx").on(t.createdAt)],
);

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export const commentStatusEnum = pgEnum("comment_status", [
  "approved",
  "pending",
  "spam",
  "trash",
]);

export const comments = pgTable(
  "comments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    parentId: bigint("parent_id", { mode: "number" }),
    // Set when the commenter was logged in
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull(),
    authorEmail: text("author_email").notNull().default(""),
    authorUrl: text("author_url").notNull().default(""),
    content: text("content").notNull(),
    status: commentStatusEnum("status").notNull().default("pending"),
    // Status before being trashed, restored on untrash
    trashedStatus: commentStatusEnum("trashed_status"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [
    index("comments_post_status_idx").on(t.postId, t.status, t.createdAt),
    index("comments_status_idx").on(t.status, t.createdAt),
    index("comments_email_idx").on(t.authorEmail),
  ],
);

// ---------------------------------------------------------------------------
// Application passwords (REST API credentials, as in WordPress)
// ---------------------------------------------------------------------------

export const appPasswords = pgTable(
  "app_passwords",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // SHA-256 of the generated secret; the secret itself is shown only once
    secretHash: text("secret_hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    lastIp: text("last_ip"),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("app_passwords_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Semantic search index: published content split into embedded passages
// ---------------------------------------------------------------------------

export const EMBEDDING_DIMENSIONS = 1024;

export const postChunks = pgTable(
  "post_chunks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    // SHA-256 of model + content, so unchanged passages are never re-embedded
    contentHash: text("content_hash").notNull(),
    model: text("model").notNull(),
    embedding: vector("embedding", {
      dimensions: EMBEDDING_DIMENSIONS,
    }).notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    uniqueIndex("post_chunks_post_chunk_idx").on(t.postId, t.chunkIndex),
    index("post_chunks_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

// ---------------------------------------------------------------------------
// AI usage log (one row per model call, for cost visibility)
// ---------------------------------------------------------------------------

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    feature: text("feature").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    // "ok", "refused", or "error"
    outcome: text("outcome").notNull().default("ok"),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt)],
);

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export const forms = pgTable("forms", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  title: text("title").notNull(),
  fields: jsonb("fields").$type<FormField[]>().notNull().default([]),
  settings: jsonb("settings").$type<FormSettings>().notNull(),
  ...timestamps,
});

export const submissionStatusEnum = pgEnum("submission_status", [
  "new",
  "read",
  "spam",
]);

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    formId: bigint("form_id", { mode: "number" })
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    data: jsonb("data").$type<SubmissionData>().notNull(),
    status: submissionStatusEnum("status").notNull().default("new"),
    // Filled in by AI triage after the submission is stored
    aiSummary: text("ai_summary"),
    aiSpamReason: text("ai_spam_reason"),
    // "web" for the site form, "api" for REST and agents
    source: text("source").notNull().default("web"),
    sourcePostId: bigint("source_post_id", { mode: "number" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("form_submissions_form_idx").on(t.formId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Site options (the wp_options equivalent)
// ---------------------------------------------------------------------------

export const options = pgTable("options", {
  name: text("name").primaryKey(),
  value: jsonb("value").notNull(),
  ...timestamps,
});

export type User = typeof user.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type Post = typeof posts.$inferSelect;
export type PostStatus = (typeof postStatusEnum.enumValues)[number];
export type Term = typeof terms.$inferSelect;
export type Media = typeof media.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type CommentStatus = (typeof commentStatusEnum.enumValues)[number];
export type Menu = typeof menus.$inferSelect;
export type MenuItem = typeof menuItems.$inferSelect;
export type Form = typeof forms.$inferSelect;
export type FormSubmission = typeof formSubmissions.$inferSelect;
export type SubmissionStatus = (typeof submissionStatusEnum.enumValues)[number];
