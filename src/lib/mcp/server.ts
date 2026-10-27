import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Post } from "@/db/schema";
import { queueIndex } from "../ai/embeddings";
import { markdownPath } from "../ai-readable";
import { type Capability, canOnPost, hasCap } from "../capabilities";
import {
  adminListComments,
  COMMENTS_TAG,
  CommentError,
  getComment,
  moderateComment,
  submitComment,
} from "../comments";
import { htmlToDoc } from "../content";
import { listForms, listSubmissions } from "../forms";
import { docToMarkdown, markdownToHtml } from "../markdown";
import type { SiteSettings } from "../options";
import { postPath } from "../permalinks";
import {
  adminListPosts,
  dashboardStats,
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
import { invalidate } from "../rest/core";
import type { Viewer } from "../session";
import { siteUrl } from "../site-url";
import { createTerm, listTerms, TERMS_TAG } from "../terms";
import { type AgentOutcome, logAgentAction } from "./audit";

// Nordpress as an MCP server: agents manage the site with the connected
// user's own permissions, and every call is written to the agent log.

export type AgentContext = {
  viewer: Viewer;
  credential: string | null;
  client: string | null;
  ip: string | null;
  settings: SiteSettings;
};

class AgentError extends Error {
  constructor(
    message: string,
    public outcome: AgentOutcome = "error",
  ) {
    super(message);
  }
}

const denied = (message: string) => new AgentError(message, "denied");

const LIVE: Post["status"][] = ["publish", "future", "private"];

const POLICY_HINT =
  "An administrator can allow agents to change the live site under Settings → Agents.";

type Result = { text: string; target?: string };

const INSTRUCTIONS = (ctx: AgentContext) =>
  `You are connected to "${ctx.settings.title}", a Nordpress site (a WordPress-style CMS), as ${ctx.viewer.name} (role: ${ctx.viewer.role}). Post and page bodies are read and written as Markdown. ${
    ctx.settings.agentsCanPublish
      ? "This site lets agents publish and edit live content; confirm with the user before publishing or trashing anything."
      : "Agents cannot change the live site here: content you ask to publish is saved as Pending Review for a person to approve, and published content is read-only."
  } Every tool call is recorded in the site's agent activity log.`;

export function createMcpServer(ctx: AgentContext) {
  const { viewer, settings } = ctx;
  const server = new McpServer(
    { name: "nordpress", title: settings.title, version: "1.0.0" },
    { instructions: INSTRUCTIONS(ctx) },
  );

  const need = (cap: Capability, what: string) => {
    if (!hasCap(viewer, cap))
      throw denied(`Your account (${viewer.role}) can't ${what}.`);
  };

  // Registers a tool whose calls are logged, and whose errors come back as
  // tool errors the model can read and recover from.
  function tool<Shape extends z.ZodRawShape>(
    name: string,
    config: {
      title: string;
      description: string;
      inputSchema: Shape;
      annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
      };
    },
    run: (args: z.infer<z.ZodObject<Shape>>) => Promise<Result>,
  ) {
    server.registerTool(
      name,
      {
        ...config,
        annotations: { openWorldHint: false, ...config.annotations },
      },
      (async (args: z.infer<z.ZodObject<Shape>>): Promise<CallToolResult> => {
        const log = (
          outcome: AgentOutcome,
          message?: string,
          target?: string,
        ) =>
          logAgentAction({
            userId: viewer.id,
            credential: ctx.credential,
            client: ctx.client,
            ip: ctx.ip,
            tool: name,
            args: args as Record<string, unknown>,
            outcome,
            message,
            target,
          });
        try {
          const result = await run(args);
          // Reads aren't worth a log row each; changes always are
          if (!config.annotations?.readOnlyHint)
            await log("ok", undefined, result.target);
          return { content: [{ type: "text", text: result.text }] };
        } catch (error) {
          const known =
            error instanceof AgentError ||
            error instanceof PostError ||
            error instanceof CommentError ||
            error instanceof z.ZodError;
          const message = known
            ? error instanceof z.ZodError
              ? error.issues.map((i) => i.message).join(" ")
              : (error as Error).message
            : "Something went wrong on the site. Please try again.";
          if (!known) console.error(`[mcp] ${name} failed`, error);
          await log(
            error instanceof AgentError
              ? error.outcome
              : /not allowed/i.test(message)
                ? "denied"
                : "error",
            message,
          );
          return { isError: true, content: [{ type: "text", text: message }] };
        }
      }) as never,
    );
  }

  const json = (data: unknown) => JSON.stringify(data, null, 2);
  const plural = (type: PostType) => (type === "page" ? "pages" : "posts");

  async function urlOf(post: Post) {
    if (post.status !== "publish") return null;
    const pagePath =
      post.type === "page"
        ? (await getPageTree()).find((p) => p.id === post.id)?.path
        : undefined;
    return siteUrl(postPath(post, settings.permalinkStructure, pagePath));
  }

  async function load(id: number) {
    const found = await getPostForEdit(id);
    if (!found || (found.post.type !== "post" && found.post.type !== "page"))
      throw new AgentError(`There is no post or page with ID ${id}.`);
    return found;
  }

  // Categories by name, slug or ID; new ones are created when allowed.
  async function categoryIds(names: string[]) {
    const all = await listTerms("category");
    const ids: number[] = [];
    for (const raw of names) {
      const name = raw.trim();
      if (!name) continue;
      const hit = all.find(
        (c) =>
          String(c.id) === name ||
          c.slug === name.toLowerCase() ||
          c.name.toLowerCase() === name.toLowerCase(),
      );
      if (hit) ids.push(hit.id);
      else if (hasCap(viewer, "manage_categories"))
        ids.push((await createTerm("category", { name })).id);
      else
        throw new AgentError(
          `There is no category “${name}”, and your account can't create categories. Existing: ${all.map((c) => c.name).join(", ")}.`,
        );
    }
    return ids;
  }

  // Applies the site's agent policy to a requested status.
  function intentFor(status: string | undefined, fallback: SaveIntent) {
    const wanted = (status ?? fallback) as SaveIntent;
    if (
      (wanted === "publish" || wanted === "private") &&
      !settings.agentsCanPublish
    )
      return { intent: "pending" as const, held: true };
    return { intent: wanted, held: false };
  }

  async function summary(post: Post, held: boolean, verb: string) {
    const url = await urlOf(post);
    return {
      text: json({
        result: `${verb} ${post.type} ${post.id}.`,
        ...(held && {
          note: `Saved as Pending Review instead of publishing: agents can't publish on this site. A person can publish it from the admin. ${POLICY_HINT}`,
        }),
        id: post.id,
        status: post.status,
        title: post.title,
        url,
        edit_url: siteUrl(`/admin/posts/${post.id}`),
      }),
      target: `${post.type}:${post.id}`,
    };
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  tool(
    "get_site_info",
    {
      title: "Site info",
      description:
        "The site's name, address and content counts, who you are connected as, what that account may do, and whether agents may publish. Call this first.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const [stats, pending] = await Promise.all([
        dashboardStats(),
        hasCap(viewer, "moderate_comments")
          ? adminListComments({ status: "pending", perPage: 1 })
          : null,
      ]);
      return {
        text: json({
          site: {
            title: settings.title,
            tagline: settings.tagline,
            url: siteUrl("/"),
            timezone: settings.timezone,
            llms_txt: siteUrl("/llms.txt"),
          },
          you: {
            name: viewer.name,
            role: viewer.role,
            can: {
              write_posts: hasCap(viewer, "edit_posts"),
              write_pages: hasCap(viewer, "edit_pages"),
              edit_others_content: hasCap(viewer, "edit_others_posts"),
              moderate_comments: hasCap(viewer, "moderate_comments"),
              create_categories: hasCap(viewer, "manage_categories"),
              read_form_responses: hasCap(viewer, "edit_others_pages"),
            },
          },
          agent_policy: {
            can_change_live_site: settings.agentsCanPublish,
            explanation: settings.agentsCanPublish
              ? "You may publish, edit published content and reply to comments. Confirm with the user first."
              : "Publishing requests are saved as Pending Review; published content and comment replies are off limits.",
          },
          counts: {
            published_posts: stats.posts,
            published_pages: stats.pages,
            drafts: stats.drafts,
            pending_review: stats.pending,
            ...(pending && { pending_comments: pending.total }),
          },
        }),
      };
    },
  );

  tool(
    "search_content",
    {
      title: "Find posts and pages",
      description:
        "Lists posts or pages, newest first, optionally filtered by a search phrase and status. Returns IDs for get_post and update_post.",
      inputSchema: {
        type: z.enum(["post", "page"]).default("post"),
        query: z.string().max(200).optional().describe("Words to search for"),
        status: z
          .enum([
            "any",
            "publish",
            "draft",
            "pending",
            "future",
            "private",
            "trash",
          ])
          .default("any"),
        page: z.number().int().min(1).default(1),
        per_page: z.number().int().min(1).max(50).default(20),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ type, query, status, page, per_page }) => {
      need(`edit_${plural(type)}`, `list ${plural(type)}`);
      const result = await adminListPosts({
        type,
        status: status === "any" ? "all" : status,
        search: query || undefined,
        page,
        perPage: per_page,
        // Without edit_others_*, only your own work is yours to manage
        authorId: hasCap(viewer, `edit_others_${plural(type)}`)
          ? undefined
          : viewer.id,
      });
      const items = await Promise.all(
        result.items.map(async (p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          author: p.authorName,
          date: (p.publishedAt ?? p.updatedAt)?.toISOString(),
          excerpt: p.excerpt || p.contentText.slice(0, 160),
          url: await urlOf(p as unknown as Post),
        })),
      );
      return {
        text: json({ total: result.total, page, pages: result.pages, items }),
      };
    },
  );

  tool(
    "get_post",
    {
      title: "Read a post or page",
      description:
        "Returns a post or page with its metadata and its body as Markdown, including drafts you may edit.",
      inputSchema: { id: z.number().int().positive() },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const { post, categoryIds: cats, tags } = await load(id);
      if (post.status !== "publish" && !canOnPost(viewer, "edit", post))
        throw denied(
          "You can't read this item: it isn't published and isn't yours to edit.",
        );
      const categories = (await listTerms("category")).filter((c) =>
        cats.includes(c.id),
      );
      const url = await urlOf(post);
      const meta = {
        id: post.id,
        type: post.type,
        status: post.status,
        title: post.title,
        slug: post.slug,
        url,
        markdown_url: url ? siteUrl(markdownPath(new URL(url).pathname)) : null,
        published_at: post.publishedAt?.toISOString() ?? null,
        modified_at: post.updatedAt.toISOString(),
        excerpt: post.excerpt,
        ...(post.type === "post" && {
          categories: categories.map((c) => c.name),
          tags,
        }),
        ...(post.type === "page" && { parent_id: post.parentId }),
        comments: post.commentStatus,
      };
      const body = docToMarkdown(post.content, {
        absolute: (u) => (u.startsWith("/") ? siteUrl(u) : u),
        formUrl: (formId) => siteUrl(`/wp-json/nordpress/v1/forms/${formId}`),
      });
      return { text: `${json(meta)}\n\n---\n\n${body || "(empty)"}` };
    },
  );

  tool(
    "list_categories_and_tags",
    {
      title: "List categories and tags",
      description: "All categories and tags with how many posts use each.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const [categories, tags] = await Promise.all([
        listTerms("category"),
        listTerms("post_tag"),
      ]);
      const shape = (t: {
        id: number;
        name: string;
        slug: string;
        count: number;
      }) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        posts: t.count,
      });
      return {
        text: json({
          categories: categories.map(shape),
          tags: tags.map(shape),
        }),
      };
    },
  );

  // -------------------------------------------------------------------------
  // Writing
  // -------------------------------------------------------------------------

  const writeFields = {
    title: z.string().max(300),
    content: z
      .string()
      .max(200_000)
      .describe(
        "The full body in Markdown (GitHub flavored). Raw HTML other than basic formatting is dropped.",
      ),
    excerpt: z.string().max(1000).describe("Short summary for listings"),
    slug: z
      .string()
      .max(200)
      .describe("URL slug; derived from the title if omitted"),
    categories: z
      .array(z.string())
      .max(10)
      .describe("Category names (posts only)"),
    tags: z
      .array(z.string())
      .max(30)
      .describe("Tag names; new tags are created (posts only)"),
    publish_at: z.iso
      .datetime({ offset: true })
      .describe(
        "Schedule for a future time (ISO 8601). Only with status publish.",
      ),
  };

  tool(
    "create_post",
    {
      title: "Create a post or page",
      description:
        "Creates a post or page from Markdown. Defaults to a draft. Asking for status publish needs the site's permission for agents; otherwise it's saved for review.",
      inputSchema: {
        type: z.enum(["post", "page"]).default("post"),
        title: writeFields.title,
        content: writeFields.content,
        status: z
          .enum(["draft", "pending", "publish", "private"])
          .default("draft"),
        excerpt: writeFields.excerpt.optional(),
        slug: writeFields.slug.optional(),
        categories: writeFields.categories.optional(),
        tags: writeFields.tags.optional(),
        parent_id: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Parent page (pages only)"),
        publish_at: writeFields.publish_at.optional(),
      },
    },
    async (args) => {
      need(`edit_${plural(args.type)}`, `write ${plural(args.type)}`);
      const { intent, held } = intentFor(args.status, "draft");
      const input: SavePostInput = {
        type: args.type,
        intent,
        title: args.title,
        slug: args.slug,
        content: htmlToDoc(markdownToHtml(args.content)),
        excerpt: args.excerpt ?? "",
        publishedAt: args.publish_at ? new Date(args.publish_at) : null,
        parentId: args.type === "page" ? (args.parent_id ?? null) : null,
        commentStatus: settings.defaultCommentStatus,
        categoryIds:
          args.type === "post"
            ? args.categories?.length
              ? await categoryIds(args.categories)
              : settings.defaultCategory
                ? [settings.defaultCategory]
                : []
            : [],
        tags: args.type === "post" ? args.tags : undefined,
      };
      const post = await savePost(viewer, input);
      invalidate(POSTS_TAG, TERMS_TAG);
      queueIndex(post.id);
      return summary(post, held, "Created");
    },
  );

  tool(
    "update_post",
    {
      title: "Update a post or page",
      description:
        "Changes only the fields you pass. `content` replaces the whole body, so read the post with get_post first and send the full revised Markdown.",
      inputSchema: {
        id: z.number().int().positive(),
        title: writeFields.title.optional(),
        content: writeFields.content.optional(),
        status: z.enum(["draft", "pending", "publish", "private"]).optional(),
        excerpt: writeFields.excerpt.optional(),
        slug: writeFields.slug.optional(),
        categories: writeFields.categories.optional(),
        tags: writeFields.tags.optional(),
        publish_at: writeFields.publish_at.optional(),
      },
      annotations: { idempotentHint: true },
    },
    async (args) => {
      const existing = await load(args.id);
      const prev = existing.post;
      if (LIVE.includes(prev.status) && !settings.agentsCanPublish)
        throw denied(
          `“${prev.title}” is live (${prev.status}), and agents can't change live content on this site. You can create a new draft instead. ${POLICY_HINT}`,
        );
      const keep: SaveIntent =
        prev.status === "future" ? "publish" : (prev.status as SaveIntent);
      const { intent, held } = intentFor(args.status, keep);
      const type = prev.type as PostType;
      const post = await savePost(viewer, {
        id: prev.id,
        type,
        intent,
        title: args.title ?? prev.title,
        slug: args.slug ?? prev.slug,
        content:
          args.content !== undefined
            ? htmlToDoc(markdownToHtml(args.content))
            : prev.content,
        excerpt: args.excerpt ?? prev.excerpt,
        publishedAt: args.publish_at
          ? new Date(args.publish_at)
          : prev.publishedAt,
        parentId: prev.parentId,
        menuOrder: prev.menuOrder,
        featuredMediaId: prev.featuredMediaId,
        commentStatus: prev.commentStatus,
        sticky: prev.sticky,
        categoryIds:
          type === "post" && args.categories
            ? await categoryIds(args.categories)
            : existing.categoryIds,
        tags: type === "post" ? (args.tags ?? existing.tags) : undefined,
      });
      invalidate(POSTS_TAG, TERMS_TAG);
      queueIndex(post.id);
      return summary(post, held, "Updated");
    },
  );

  tool(
    "trash_post",
    {
      title: "Move a post or page to the trash",
      description:
        "Moves it to the trash, where a person can restore it from the admin. Nothing is deleted permanently.",
      inputSchema: { id: z.number().int().positive() },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { post } = await load(id);
      if (LIVE.includes(post.status) && !settings.agentsCanPublish)
        throw denied(
          `“${post.title}” is live, and agents can't take content offline on this site. ${POLICY_HINT}`,
        );
      await trashPost(viewer, id);
      invalidate(POSTS_TAG, TERMS_TAG);
      queueIndex(id);
      return {
        text: json({
          result: `Moved ${post.type} ${id} (“${post.title}”) to the trash.`,
        }),
        target: `${post.type}:${id}`,
      };
    },
  );

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  tool(
    "list_comments",
    {
      title: "List comments",
      description:
        "Comments to moderate or read, newest first. Defaults to those awaiting approval.",
      inputSchema: {
        status: z
          .enum(["pending", "approved", "spam", "trash"])
          .default("pending"),
        post_id: z.number().int().positive().optional(),
        page: z.number().int().min(1).default(1),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ status, post_id, page }) => {
      need("moderate_comments", "moderate comments");
      const result = await adminListComments({
        status,
        postId: post_id,
        page,
        perPage: 20,
      });
      return {
        text: json({
          total: result.total,
          page,
          pages: result.pages,
          items: result.items.map(({ comment: c, postTitle }) => ({
            id: c.id,
            post_id: c.postId,
            post_title: postTitle,
            parent_id: c.parentId,
            author: c.authorName,
            author_email: c.authorEmail,
            date: c.createdAt.toISOString(),
            status: c.status,
            content: c.content,
          })),
        }),
      };
    },
  );

  tool(
    "moderate_comment",
    {
      title: "Moderate a comment",
      description:
        "Approve, unapprove, mark as spam or trash a comment. Trashed comments can be restored by a person.",
      inputSchema: {
        id: z.number().int().positive(),
        action: z.enum(["approve", "unapprove", "spam", "trash"]),
      },
      annotations: { idempotentHint: true },
    },
    async ({ id, action }) => {
      need("moderate_comments", "moderate comments");
      await moderateComment(id, action);
      invalidate(COMMENTS_TAG);
      return {
        text: json({ result: `Comment ${id}: ${action} done.` }),
        target: `comment:${id}`,
      };
    },
  );

  tool(
    "reply_to_comment",
    {
      title: "Reply to a comment",
      description:
        "Posts a public reply under an approved comment, in the connected user's name. Needs the site's permission for agents to publish.",
      inputSchema: {
        comment_id: z.number().int().positive(),
        content: z.string().min(1).max(10_000).describe("Plain text"),
      },
    },
    async ({ comment_id, content }) => {
      if (!settings.agentsCanPublish)
        throw denied(
          `Replies are public, and agents can't publish on this site. ${POLICY_HINT}`,
        );
      const parent = await getComment(comment_id);
      if (!parent)
        throw new AgentError(`There is no comment with ID ${comment_id}.`);
      const saved = await submitComment(
        {
          postId: parent.postId,
          parentId: parent.id,
          content,
          authorName: viewer.name,
          authorEmail: viewer.email,
          authorUrl: "",
        },
        viewer,
        { ip: ctx.ip, userAgent: ctx.client },
      );
      invalidate(COMMENTS_TAG);
      return {
        text: json({
          result: `Replied to comment ${comment_id}.`,
          id: saved.id,
          status: saved.status,
        }),
        target: `comment:${saved.id}`,
      };
    },
  );

  // -------------------------------------------------------------------------
  // Forms
  // -------------------------------------------------------------------------

  tool(
    "get_form_responses",
    {
      title: "Read form responses",
      description:
        "Without form_id, lists the site's forms with response counts. With form_id, returns that form's responses, newest first, with AI summaries where available.",
      inputSchema: {
        form_id: z.number().int().positive().optional(),
        status: z
          .enum(["new", "read", "spam"])
          .optional()
          .describe("Defaults to new and read"),
        page: z.number().int().min(1).default(1),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ form_id, status, page }) => {
      need("edit_others_pages", "read form responses");
      if (!form_id) {
        const forms = await listForms();
        return {
          text: json(
            forms.map((f) => ({
              id: f.id,
              title: f.title,
              open: f.settings.open,
              responses: f.total,
              unread: f.unread,
            })),
          ),
        };
      }
      const forms = await listForms();
      const form = forms.find((f) => f.id === form_id);
      if (!form) throw new AgentError(`There is no form with ID ${form_id}.`);
      const result = await listSubmissions(form_id, {
        status: status ?? "inbox",
        page,
        perPage: 20,
      });
      const label = new Map(form.fields.map((f) => [f.key, f.label]));
      return {
        text: json({
          form: form.title,
          total: result.total,
          page,
          pages: result.pages,
          items: result.items.map((s) => ({
            id: s.id,
            date: s.createdAt.toISOString(),
            status: s.status,
            summary: s.aiSummary,
            answers: Object.fromEntries(
              Object.entries(s.data).map(([k, v]) => [label.get(k) ?? k, v]),
            ),
          })),
        }),
      };
    },
  );

  return server;
}
