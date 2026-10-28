import "server-only";
import { count, desc, eq, ilike, notInArray, or, sql } from "drizzle-orm";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { db } from "@/db";
import { notFoundLog, redirects } from "@/db/schema";
import { getSettings } from "../options";
import { postPath } from "../permalinks";
import { listPublished } from "../posts";
import { siteUrl } from "../site-url";
import {
  createsLoop,
  matchRedirect,
  normalizeSource,
  normalizeStatus,
  normalizeTarget,
  pathWords,
  RedirectRuleError,
} from "./rules";

export { parseRedirectCsv, RedirectRuleError } from "./rules";

export const REDIRECTS_TAG = "redirects";
const MAX_404_ROWS = 2000;

// Works from server actions and route handlers alike
const invalidate = () => revalidateTag(REDIRECTS_TAG, { expire: 0 });

async function rules() {
  "use cache";
  cacheTag(REDIRECTS_TAG);
  cacheLife("max");
  return db
    .select({
      source: redirects.source,
      target: redirects.target,
      status: redirects.status,
    })
    .from(redirects);
}

/** Where a request for `path` should go instead, if anywhere. */
export async function findRedirect(path: string) {
  const all = await rules();
  if (all.length === 0) return null;
  return matchRedirect(all, path);
}

// A page can render twice for one request (prerendering, then the request);
// the same address within a moment counts once
const recent = new Map<string, number>();
function firstInAWhile(key: string) {
  const now = Date.now();
  const last = recent.get(key);
  recent.set(key, now);
  if (recent.size > 1000)
    for (const [k, t] of recent) if (now - t > 2000) recent.delete(k);
  return !last || now - last > 2000;
}

export async function recordRedirectHit(source: string) {
  if (!firstInAWhile(`redirect:${source}`)) return;
  await db
    .update(redirects)
    .set({ hits: sql`${redirects.hits} + 1`, lastHitAt: new Date() })
    .where(eq(redirects.source, source));
}

export async function listRedirects(q: { search?: string; page?: number }) {
  const perPage = 50;
  const page = Math.max(1, q.page ?? 1);
  const where = q.search
    ? or(
        ilike(redirects.source, `%${q.search}%`),
        ilike(redirects.target, `%${q.search}%`),
      )
    : undefined;
  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(redirects)
      .where(where)
      .orderBy(desc(redirects.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ total: count() }).from(redirects).where(where),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function allRedirects() {
  return db.select().from(redirects).orderBy(redirects.source);
}

/** Adds a rule (or changes the one with this id). */
export async function saveRedirect(input: {
  id?: number;
  source: string;
  target: string;
  status?: unknown;
  origin?: "manual" | "import";
}) {
  const source = normalizeSource(input.source, new URL(siteUrl("/")).origin);
  const target = normalizeTarget(input.target);
  const status = normalizeStatus(input.status);
  if (target === source)
    throw new RedirectRuleError("The new address is the same as the old one.");
  const others = (await db.select().from(redirects)).filter(
    (r) => r.id !== input.id,
  );
  if (others.some((r) => r.source === source))
    throw new RedirectRuleError(`${source} already redirects somewhere.`);
  if (createsLoop(others, source, target))
    throw new RedirectRuleError(
      "That would send visitors in a circle between redirects.",
    );
  const values = { source, target, status, origin: input.origin ?? "manual" };
  const [row] = input.id
    ? await db
        .update(redirects)
        .set(values)
        .where(eq(redirects.id, input.id))
        .returning()
    : await db.insert(redirects).values(values).returning();
  if (!row) throw new RedirectRuleError("That redirect no longer exists.");
  // Once redirected, the address no longer needs attention
  await db.delete(notFoundLog).where(eq(notFoundLog.path, source));
  invalidate();
  return row;
}

export async function deleteRedirects(ids: number[]) {
  for (const id of ids) await db.delete(redirects).where(eq(redirects.id, id));
  invalidate();
}

/** Imports rows from a CSV; addresses that already redirect are skipped. */
export async function importRedirects(
  rows: { source: string; target: string; status: number }[],
) {
  let added = 0;
  const skipped: string[] = [];
  for (const row of rows) {
    try {
      await saveRedirect({ ...row, origin: "import" });
      added++;
    } catch (error) {
      if (!(error instanceof RedirectRuleError)) throw error;
      skipped.push(`${row.source}: ${error.message}`);
    }
  }
  return { added, skipped };
}

/**
 * Keeps an old address working after a published post moves (its slug,
 * date or parent changed), like WordPress's old-slug redirect. Chains are
 * collapsed, and a rule that would hide the new address is removed.
 */
export async function redirectMovedContent(from: string, to: string) {
  if (from === to) return;
  await db.transaction(async (tx) => {
    await tx.delete(redirects).where(eq(redirects.source, to));
    await tx
      .update(redirects)
      .set({ target: to })
      .where(eq(redirects.target, from));
    await tx
      .insert(redirects)
      .values({ source: from, target: to, status: 301, origin: "auto" })
      .onConflictDoUpdate({
        target: redirects.source,
        set: { target: to, status: 301, origin: "auto" },
      });
  });
  invalidate();
}

// ---------------------------------------------------------------------------
// 404s
// ---------------------------------------------------------------------------

// Paths no person would ask for: scanners probing for other software
const NOISE =
  /\.(php|asp|aspx|env|git|sql|bak|ini|ya?ml|cgi)(\/|$)|^\/(wp-admin|wp-login|xmlrpc|\.well-known\/(?!security))/i;

export async function recordNotFound(path: string, referrer: string | null) {
  if (path.length > 500 || NOISE.test(path)) return;
  if (!firstInAWhile(`404:${path}`)) return;
  const ref =
    referrer && !referrer.startsWith(siteUrl(path))
      ? referrer.slice(0, 500)
      : null;
  await db
    .insert(notFoundLog)
    .values({ path, referrer: ref })
    .onConflictDoUpdate({
      target: notFoundLog.path,
      set: {
        hits: sql`${notFoundLog.hits} + 1`,
        lastSeenAt: new Date(),
        ...(ref && { referrer: ref }),
      },
    });
  // Now and then, keep only the most recent addresses
  if (Math.random() < 0.02) {
    const keep = db
      .select({ path: notFoundLog.path })
      .from(notFoundLog)
      .orderBy(desc(notFoundLog.lastSeenAt))
      .limit(MAX_404_ROWS);
    await db.delete(notFoundLog).where(notInArray(notFoundLog.path, keep));
  }
}

export async function listNotFound(limit = 50) {
  return db
    .select()
    .from(notFoundLog)
    .orderBy(desc(notFoundLog.hits), desc(notFoundLog.lastSeenAt))
    .limit(limit);
}

export async function clearNotFound(path?: string) {
  await db
    .delete(notFoundLog)
    .where(path ? eq(notFoundLog.path, path) : undefined);
}

/** The published post a missing address most likely meant, by its words. */
export async function suggestTarget(path: string) {
  const words = pathWords(path);
  if (words.length === 0) return null;
  const settings = await getSettings();
  const { items } = await listPublished({
    perPage: 1,
    // Any of the words, best match first: old addresses rarely match exactly
    search: words.join(" or "),
  });
  const post = items[0];
  return post
    ? { title: post.title, path: postPath(post, settings.permalinkStructure) }
    : null;
}

export async function suggestTargets(paths: string[]) {
  const out = new Map<string, { title: string; path: string } | null>();
  for (const path of paths) out.set(path, await suggestTarget(path));
  return out;
}

export async function countRedirects() {
  const [{ n }] = await db.select({ n: count() }).from(redirects);
  return n;
}
