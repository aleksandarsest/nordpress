import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, count, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { media, posts, type Suggestion, suggestions } from "@/db/schema";
import {
  createAgentTools,
  previewAgentTool,
  runAgentTool,
  type ToolContext,
} from "../agent/tools";
import { generateAltText, supportsAltText } from "../ai/alt-text";
import { aiConfigured, aiContext, recordUsage } from "../ai/client";
import { withGuidance } from "../ai/voice";
import { findForMarkdown } from "../ai-readable";
import { countPendingComments } from "../comments";
import { listForms } from "../forms";
import { assertPublicUrl } from "../net";
import {
  getSettings,
  SETTINGS_TAG,
  type SiteSettings,
  saveSettings,
} from "../options";
import { resolveRoute } from "../permalinks";
import type { Viewer } from "../session";
import { siteUrl } from "../site-url";
import { getTermBySlug } from "../terms";

// The AI inbox: scheduled checks that find things worth fixing and, where
// they can, propose the fix as an agent tool call for a person to approve.

export const INBOX_TAG = "inbox";
const MAX_AI_DRAFTS = 8;
const MAX_EXTERNAL_LINKS = 40;
const DISMISSED_FOR_DAYS = 30;
const RUN_EVERY_MS = 24 * 60 * 60 * 1000;

type Finding = {
  kind: string;
  target: string;
  title: string;
  detail?: string;
  tool?: string;
  toolInput?: Record<string, unknown>;
  link?: string;
};

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

async function draftExcerpt(title: string, text: string) {
  const ctx = await aiContext();
  const response = await ctx.client.beta.messages.parse({
    model: ctx.model,
    max_tokens: 2000,
    output_config: {
      effort: "low",
      format: betaZodOutputFormat(
        z.object({
          excerpt: z
            .string()
            .describe("A summary of at most 40 words for listings and search"),
        }),
      ),
    },
    system: withGuidance(
      "You write excerpts for posts on a website: one or two sentences that tell a reader what the post gives them. Same language as the post. No quotes around it.",
      ctx.settings,
    ),
    messages: [
      {
        role: "user",
        content: `<title>${title}</title>\n<post>\n${text.slice(0, 20_000)}\n</post>`,
      },
    ],
  });
  await recordUsage({
    userId: null,
    feature: "inbox",
    model: response.model,
    usage: response.usage,
  });
  return response.parsed_output?.excerpt.trim() ?? "";
}

async function missingExcerpts(skip: Set<string>, budget: { ai: number }) {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      contentText: posts.contentText,
    })
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
    .limit(50);
  const findings: Finding[] = [];
  const present = rows.map((r) => `post:${r.id}`);
  for (const row of rows) {
    const target = `post:${row.id}`;
    if (skip.has(`missing_excerpt|${target}`) || budget.ai <= 0) continue;
    budget.ai--;
    try {
      const excerpt = await draftExcerpt(row.title, row.contentText);
      if (!excerpt) continue;
      findings.push({
        kind: "missing_excerpt",
        target,
        title: `Add an excerpt to “${row.title}”`,
        detail:
          "Excerpts show in post lists, search results, feeds and link previews.",
        tool: "update_post",
        toolInput: { id: row.id, excerpt },
        link: `/admin/posts/${row.id}`,
      });
    } catch (error) {
      console.error("[inbox] excerpt draft failed", (error as Error).message);
    }
  }
  return { findings, present };
}

async function missingAltText(skip: Set<string>, budget: { ai: number }) {
  const rows = await db
    .select()
    .from(media)
    .where(and(eq(media.alt, ""), sql`${media.mimeType} like 'image/%'`))
    .orderBy(desc(media.createdAt))
    .limit(50);
  const candidates = rows.filter(supportsAltText);
  const findings: Finding[] = [];
  for (const item of candidates) {
    const target = `media:${item.id}`;
    if (skip.has(`missing_alt|${target}`) || budget.ai <= 0) continue;
    budget.ai--;
    try {
      const result = await generateAltText(item, null);
      if (result.decorative || !result.alt) continue;
      findings.push({
        kind: "missing_alt",
        target,
        title: `Describe the image “${item.title || item.path}”`,
        detail:
          "Alt text lets people using screen readers, and search engines, understand the image.",
        tool: "set_image_alt_text",
        toolInput: { media_id: item.id, alt: result.alt },
        link: `/admin/media/${item.id}`,
      });
    } catch (error) {
      console.error("[inbox] alt text failed", (error as Error).message);
    }
  }
  return { findings, present: candidates.map((i) => `media:${i.id}`) };
}

// Whether a site-relative path leads somewhere.
async function internalPathExists(path: string, settings: SiteSettings) {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "");
  if (!clean || clean === "/") return true;
  const segments = clean.split("/").filter(Boolean);
  // Files, feeds, the API and the admin aren't content routes
  if (
    [
      "uploads",
      "wp-json",
      "admin",
      "api",
      "feed",
      "mcp",
      "llms.txt",
      "login",
    ].includes(segments[0]) ||
    /\.(md|txt|xml)$/.test(clean)
  )
    return true;
  const route = resolveRoute(segments, {});
  switch (route.kind) {
    case "term":
      return !!(await getTermBySlug(route.taxonomy, route.slug));
    case "single":
    case "page-by-id":
    case "dated":
    case "slug":
      return !!(await findForMarkdown(segments, settings));
    case "not-found":
      return false;
    default:
      return true;
  }
}

async function externalUrlDead(url: string) {
  try {
    const parsed = await assertPublicUrl(url);
    const res = await fetch(parsed, {
      method: "HEAD",
      // A redirect means the link still leads somewhere; following it could
      // reach private addresses
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Nordpress link checker" },
    });
    return res.status === 404 || res.status === 410;
  } catch (error) {
    // Unknown hosts are dead; refusals and timeouts are inconclusive. DNS
    // lookups report the code directly, fetch puts it on the cause
    const e = error as { code?: string; cause?: { code?: string } };
    return (e.code ?? e.cause?.code) === "ENOTFOUND";
  }
}

async function brokenLinks(skip: Set<string>, settings: SiteSettings) {
  const rows = await db
    .select({ id: posts.id, title: posts.title, html: posts.contentHtml })
    .from(posts)
    .where(eq(posts.status, "publish"));
  const base = siteUrl("/").replace(/\/$/, "");
  const external = new Map<string, boolean>();
  const findings: Finding[] = [];
  const present: string[] = [];
  for (const row of rows) {
    const hrefs = [...row.html.matchAll(/href="([^"]+)"/g)].map((m) =>
      m[1].replaceAll("&amp;", "&"),
    );
    const broken: string[] = [];
    for (const href of new Set(hrefs)) {
      if (href.startsWith("/") || href.startsWith(base)) {
        const path = href.startsWith(base)
          ? href.slice(base.length) || "/"
          : href;
        if (!(await internalPathExists(path, settings))) broken.push(href);
      } else if (/^https?:\/\//.test(href)) {
        if (!external.has(href)) {
          if (external.size >= MAX_EXTERNAL_LINKS) continue;
          external.set(href, await externalUrlDead(href));
        }
        if (external.get(href)) broken.push(href);
      }
    }
    if (!broken.length) continue;
    const target = `post:${row.id}`;
    present.push(target);
    if (skip.has(`broken_links|${target}`)) continue;
    findings.push({
      kind: "broken_links",
      target,
      title: `${broken.length === 1 ? "A link" : `${broken.length} links`} in “${row.title}” ${broken.length === 1 ? "leads" : "lead"} nowhere`,
      detail: broken.join("\n"),
      link: `/admin/posts/${row.id}`,
    });
  }
  return { findings, present };
}

async function waitingWork(skip: Set<string>) {
  const findings: Finding[] = [];
  const present: string[] = [];
  const pending = await countPendingComments();
  if (pending > 0) {
    present.push("comments");
    if (!skip.has("moderation|comments"))
      findings.push({
        kind: "moderation",
        target: "comments",
        title: `${pending} comment${pending === 1 ? " is" : "s are"} waiting for moderation`,
        link: "/admin/comments?status=pending",
      });
  }
  for (const form of await listForms()) {
    if (!form.unread) continue;
    const target = `form:${form.id}`;
    present.push(target);
    if (!skip.has(`unread_responses|${target}`))
      findings.push({
        kind: "unread_responses",
        target,
        title: `${form.unread} new response${form.unread === 1 ? "" : "s"} to “${form.title}”`,
        link: `/admin/forms/${form.id}/responses?view=new`,
      });
  }
  return { findings, present };
}

// Counts that change between runs: refresh their titles instead of skipping
const REFRESHED = new Set(["moderation", "unread_responses"]);

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

export async function runSiteChecks() {
  const settings = await getSettings();
  const since = sql`now() - make_interval(days => ${DISMISSED_FOR_DAYS})`;
  const open = await db
    .select({
      id: suggestions.id,
      kind: suggestions.kind,
      target: suggestions.target,
      status: suggestions.status,
    })
    .from(suggestions)
    .where(
      or(
        eq(suggestions.status, "pending"),
        and(
          eq(suggestions.status, "dismissed"),
          gt(suggestions.resolvedAt, since),
        ),
      ),
    );
  const skip = new Set(
    open
      .filter((s) => !(REFRESHED.has(s.kind) && s.status === "pending"))
      .map((s) => `${s.kind}|${s.target}`),
  );

  const ai = settings.aiEnabled && aiConfigured();
  const budget = { ai: ai ? MAX_AI_DRAFTS : 0 };
  const results = await Promise.all([
    ai ? missingExcerpts(skip, budget) : null,
    ai ? missingAltText(skip, budget) : null,
    brokenLinks(skip, settings),
    waitingWork(skip),
  ]);
  const kinds = ["missing_excerpt", "missing_alt", "broken_links", null];

  await db.transaction(async (tx) => {
    // Problems fixed some other way leave the inbox by themselves
    for (const [i, result] of results.entries()) {
      if (!result) continue;
      const present = new Set(result.present);
      const checkedKinds = kinds[i]
        ? [kinds[i]]
        : ["moderation", "unread_responses"];
      const stale = open.filter(
        (s) =>
          s.status === "pending" &&
          checkedKinds.includes(s.kind) &&
          !present.has(s.target),
      );
      if (stale.length)
        await tx.delete(suggestions).where(
          inArray(
            suggestions.id,
            stale.map((s) => s.id),
          ),
        );
    }
    for (const finding of results.flatMap((r) => r?.findings ?? [])) {
      if (REFRESHED.has(finding.kind))
        await tx
          .delete(suggestions)
          .where(
            and(
              eq(suggestions.kind, finding.kind),
              eq(suggestions.target, finding.target),
              eq(suggestions.status, "pending"),
            ),
          );
      await tx.insert(suggestions).values({
        kind: finding.kind,
        target: finding.target,
        title: finding.title,
        detail: finding.detail ?? "",
        tool: finding.tool ?? null,
        toolInput: finding.toolInput ?? null,
        link: finding.link ?? null,
      });
    }
  });
  await markRun();
  return { found: results.reduce((n, r) => n + (r?.findings.length ?? 0), 0) };
}

async function markRun() {
  await saveSettings({ inboxLastRun: new Date().toISOString() });
  // Also called after responses are sent, where only revalidateTag works
  revalidateTag(SETTINGS_TAG, { expire: 0 });
}

/** Runs the checks if they haven't run for a day. */
export async function runSiteChecksIfDue() {
  const settings = await getSettings();
  if (!settings.inboxEnabled) return false;
  const last = settings.inboxLastRun ? Date.parse(settings.inboxLastRun) : 0;
  if (Date.now() - last < RUN_EVERY_MS) return false;
  // Claim the run first, so simultaneous visits don't start it twice
  await markRun();
  await runSiteChecks();
  return true;
}

// ---------------------------------------------------------------------------
// Reviewing
// ---------------------------------------------------------------------------

export async function countOpenSuggestions() {
  const [{ n }] = await db
    .select({ n: count() })
    .from(suggestions)
    .where(eq(suggestions.status, "pending"));
  return n;
}

function inboxContext(viewer: Viewer, settings: SiteSettings): ToolContext {
  return {
    viewer,
    settings,
    // A person approves each fix
    canChangeLive: true,
    credential: "AI inbox",
    client: "admin",
    ip: null,
  };
}

export async function listOpenSuggestions(viewer: Viewer) {
  const settings = await getSettings();
  const rows = await db
    .select()
    .from(suggestions)
    .where(eq(suggestions.status, "pending"))
    .orderBy(desc(suggestions.createdAt))
    .limit(100);
  const tools = new Map(
    createAgentTools(inboxContext(viewer, settings)).map((t) => [t.name, t]),
  );
  return Promise.all(
    rows.map(async (row) => {
      const tool = row.tool ? tools.get(row.tool) : undefined;
      // Previews are built fresh, so they reflect the content as it is now
      const preview = tool ? await previewAgentTool(tool, row.toolInput) : null;
      return { ...row, preview };
    }),
  );
}

export class InboxError extends Error {}

async function loadOpen(id: number): Promise<Suggestion> {
  const [row] = await db
    .select()
    .from(suggestions)
    .where(eq(suggestions.id, id));
  if (row?.status !== "pending")
    throw new InboxError("This suggestion was already handled.");
  return row;
}

export async function applySuggestion(id: number, viewer: Viewer) {
  const row = await loadOpen(id);
  if (!row.tool)
    throw new InboxError("This one needs a person: open it to fix it.");
  const settings = await getSettings();
  const ctx = inboxContext(viewer, settings);
  const tool = createAgentTools(ctx).find((t) => t.name === row.tool);
  if (!tool) throw new InboxError("This kind of fix is no longer available.");
  const result = await runAgentTool(ctx, tool, row.toolInput);
  if (!result.ok) throw new InboxError(result.text);
  await db
    .update(suggestions)
    .set({ status: "applied", resolvedBy: viewer.id, resolvedAt: new Date() })
    .where(eq(suggestions.id, id));
}

export async function dismissSuggestion(id: number, viewer: Viewer) {
  await loadOpen(id);
  await db
    .update(suggestions)
    .set({ status: "dismissed", resolvedBy: viewer.id, resolvedAt: new Date() })
    .where(eq(suggestions.id, id));
}
