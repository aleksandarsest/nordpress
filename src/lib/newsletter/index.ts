import "server-only";
import {
  and,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import {
  memberships,
  type Newsletter,
  newsletters,
  type Post,
  posts,
  type SubscriberStatus,
  subscribers,
  user,
} from "@/db/schema";
import { mailConfigured, sendMail } from "../mail";
import { docToMarkdown } from "../markdown";
import {
  isMembersOnly,
  membershipGrantsAccess,
  teaser,
} from "../members/access";
import { getSettings, type SiteSettings } from "../options";
import { postPath } from "../permalinks";
import { applyFilters, doAction } from "../plugins";
import { rateLimit } from "../rate-limit";
import { siteUrl } from "../site-url";
import {
  emailBodyHtml,
  escapeHtml,
  normalizeEmail,
  renderNewsletter,
} from "./email";
import {
  checkSubscriberToken,
  subscriberToken,
  type TokenPurpose,
} from "./tokens";

export { normalizeEmail, parseSubscriberList } from "./email";

export class NewsletterError extends Error {}

const BATCH = 50;
const LEASE_MS = 2 * 60 * 1000;
// After a batch where every email failed (SMTP down), wait before retrying
const RETRY_MS = 15 * 60 * 1000;

function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("BETTER_AUTH_SECRET is not set.");
  return value;
}

const tokenFor = (id: number, purpose: TokenPurpose) =>
  subscriberToken(secret(), id, purpose);

export function unsubscribeUrl(id: number) {
  return siteUrl(
    `/newsletter/unsubscribe?s=${id}&t=${tokenFor(id, "unsubscribe")}`,
  );
}

// For mail apps' own unsubscribe button (RFC 8058 one-click)
function oneClickUrl(id: number) {
  return siteUrl(
    `/api/newsletter/unsubscribe?s=${id}&t=${tokenFor(id, "unsubscribe")}`,
  );
}

// ---------------------------------------------------------------------------
// Subscribing
// ---------------------------------------------------------------------------

/**
 * Double opt-in: the address gets a confirmation link and only receives
 * newsletters once it's clicked. The answer is the same whether or not the
 * address was already subscribed, so the form can't be used to look people up.
 */
export async function subscribe(input: {
  email: string;
  name?: string;
  source?: string;
}) {
  const settings = await getSettings();
  if (!settings.newsletterEnabled)
    throw new NewsletterError("This site doesn't have a newsletter.");
  const email = normalizeEmail(input.email);
  if (!email) throw new NewsletterError("Please enter a valid email address.");
  // Caps confirmation emails to one address, so nobody can flood an inbox
  if (!(await rateLimit(`newsletter:${email}`, 3, 60 * 60 * 1000)).ok) return;

  const name = (input.name ?? "").trim().slice(0, 200);
  const [existing] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, email));
  if (existing?.status === "active") return;
  const [row] = existing
    ? await db
        .update(subscribers)
        .set({ status: "pending", name: name || existing.name })
        .where(eq(subscribers.id, existing.id))
        .returning()
    : await db
        .insert(subscribers)
        .values({ email, name, source: input.source ?? "form" })
        .returning();

  const link = siteUrl(
    `/api/newsletter/confirm?s=${row.id}&t=${tokenFor(row.id, "confirm")}`,
  );
  await sendMail({
    to: email,
    subject: `Confirm your subscription to ${settings.title}`,
    text: `Please confirm that you want to get new posts from ${settings.title} by email:\n\n${link}\n\nIf you didn't ask for this, ignore this email and you won't hear from us.`,
    html: `<p>Please confirm that you want to get new posts from ${escapeHtml(settings.title)} by email.</p><p><a href="${escapeHtml(link)}">Yes, subscribe me</a></p><p>If you didn't ask for this, ignore this email and you won't hear from us.</p>`,
  });
}

export async function confirmSubscription(id: number, token: string) {
  if (!checkSubscriberToken(secret(), id, "confirm", token)) return false;
  const [row] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.id, id));
  if (!row) return false;
  if (row.status === "pending") {
    const [active] = await db
      .update(subscribers)
      .set({ status: "active", confirmedAt: new Date(), unsubscribedAt: null })
      .where(eq(subscribers.id, id))
      .returning();
    await doAction("newsletter.subscribed", {
      id: active.id,
      email: active.email,
      name: active.name,
    });
  }
  return row.status !== "unsubscribed";
}

export async function unsubscribe(id: number, token: string) {
  if (!checkSubscriberToken(secret(), id, "unsubscribe", token)) return false;
  await db
    .update(subscribers)
    .set({ status: "unsubscribed", unsubscribedAt: new Date() })
    .where(
      and(eq(subscribers.id, id), sql`${subscribers.status} <> 'unsubscribed'`),
    );
  return true;
}

export async function subscriberByEmail(email: string) {
  const [row] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, email.toLowerCase()));
  return row ?? null;
}

/** For signed-in readers: unsubscribing from their account page. */
export async function unsubscribeEmail(email: string) {
  await db
    .update(subscribers)
    .set({ status: "unsubscribed", unsubscribedAt: new Date() })
    .where(eq(subscribers.email, email.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Managing subscribers
// ---------------------------------------------------------------------------

export async function subscriberCounts() {
  const rows = await db
    .select({ status: subscribers.status, n: count() })
    .from(subscribers)
    .groupBy(subscribers.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  return {
    active: by.active ?? 0,
    pending: by.pending ?? 0,
    unsubscribed: by.unsubscribed ?? 0,
  };
}

export async function listSubscribers(q: {
  status?: SubscriberStatus;
  search?: string;
  page?: number;
}) {
  const perPage = 50;
  const page = Math.max(1, q.page ?? 1);
  const where = and(
    q.status ? eq(subscribers.status, q.status) : undefined,
    q.search
      ? or(
          ilike(subscribers.email, `%${q.search}%`),
          ilike(subscribers.name, `%${q.search}%`),
        )
      : undefined,
  );
  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(subscribers)
      .where(where)
      .orderBy(desc(subscribers.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ total: count() }).from(subscribers).where(where),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

/**
 * Adds people who already agreed to get the newsletter elsewhere (an
 * export from another service). Unsubscribed addresses stay unsubscribed.
 */
export async function importSubscribers(
  list: { email: string; name: string }[],
) {
  if (list.length > 50_000)
    throw new NewsletterError("Import at most 50,000 addresses at a time.");
  let added = 0;
  for (let i = 0; i < list.length; i += 1000) {
    const rows = await db
      .insert(subscribers)
      .values(
        list.slice(i, i + 1000).map((s) => ({
          email: s.email,
          name: s.name,
          status: "active" as const,
          source: "import",
          confirmedAt: new Date(),
        })),
      )
      .onConflictDoNothing()
      .returning({ id: subscribers.id });
    added += rows.length;
  }
  return { added, skipped: list.length - added };
}

export async function deleteSubscribers(ids: number[]) {
  if (ids.length)
    await db.delete(subscribers).where(inArray(subscribers.id, ids));
}

export async function allSubscribers() {
  return db.select().from(subscribers).orderBy(subscribers.id);
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type Audience = "everyone" | "members";

const isLive = (post: Pick<Post, "status" | "publishedAt">) =>
  post.status === "publish" ||
  (post.status === "future" &&
    !!post.publishedAt &&
    post.publishedAt <= new Date());

export async function newsletterForPost(postId: number) {
  const [row] = await db
    .select()
    .from(newsletters)
    .where(eq(newsletters.postId, postId));
  return row ?? null;
}

export async function listNewsletters(limit = 50) {
  return db
    .select({
      newsletter: newsletters,
      postTitle: posts.title,
    })
    .from(newsletters)
    .leftJoin(posts, eq(posts.id, newsletters.postId))
    .orderBy(desc(newsletters.createdAt))
    .limit(limit);
}

/**
 * Queues a post to be emailed. Scheduled posts go out when they're
 * published; a post is never emailed twice.
 */
export async function queueNewsletter(input: {
  postId: number;
  subject?: string;
  preheader?: string;
  audience?: Audience;
  actorId: string | null;
}) {
  const settings = await getSettings();
  if (!settings.newsletterEnabled)
    throw new NewsletterError(
      "Turn on the newsletter under Settings → Newsletter first.",
    );
  const [post] = await db
    .select()
    .from(posts)
    .where(eq(posts.id, input.postId));
  if (post?.type !== "post")
    throw new NewsletterError("Only posts can be emailed.");
  if (post.status !== "publish" && post.status !== "future")
    throw new NewsletterError(
      "Publish or schedule the post before emailing it.",
    );
  const previous = await newsletterForPost(post.id);
  if (previous && previous.status !== "cancelled")
    throw new NewsletterError("This post has already been emailed.");
  if (previous)
    await db.delete(newsletters).where(eq(newsletters.id, previous.id));
  const subject = (input.subject ?? "").trim().slice(0, 200) || post.title;
  const [row] = await db
    .insert(newsletters)
    .values({
      postId: post.id,
      subject,
      preheader:
        (input.preheader ?? "").trim().slice(0, 200) ||
        (isMembersOnly(post.meta) ? teaser(post) : post.excerpt).slice(0, 200),
      audience: input.audience === "members" ? "members" : "everyone",
      sendAt:
        post.status === "future" &&
        post.publishedAt &&
        post.publishedAt > new Date()
          ? post.publishedAt
          : new Date(),
      createdBy: input.actorId,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new NewsletterError("This post has already been emailed.");
  kickNewsletters();
  return row;
}

export async function cancelNewsletter(id: number) {
  const [row] = await db
    .update(newsletters)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(and(eq(newsletters.id, id), eq(newsletters.status, "queued")))
    .returning();
  if (!row)
    throw new NewsletterError(
      "Only newsletters that haven't started can be cancelled.",
    );
}

/**
 * Called after every save: with automatic sending on, a newly published or
 * scheduled post is queued, and a queued one follows its post's schedule.
 */
export async function onPostSaved(
  post: Post,
  previousStatus: Post["status"] | null,
  source: "app" | "import",
) {
  if (post.type !== "post" || source === "import") return;
  const queued = await newsletterForPost(post.id);
  if (queued?.status === "queued") {
    await db
      .update(newsletters)
      .set({
        sendAt:
          post.status === "future" && post.publishedAt
            ? post.publishedAt
            : new Date(),
      })
      .where(eq(newsletters.id, queued.id));
    return;
  }
  if (queued) return;
  const settings = await getSettings();
  const published = post.status === "publish" || post.status === "future";
  const wasPublished =
    previousStatus === "publish" || previousStatus === "future";
  if (!settings.newsletterEnabled || !settings.newsletterAutoSend) return;
  if (!published || wasPublished) return;
  try {
    await queueNewsletter({ postId: post.id, actorId: null });
  } catch (error) {
    if (!(error instanceof NewsletterError)) throw error;
  }
}

/** Sends due newsletters in the background, after the response. */
export function kickNewsletters() {
  try {
    after(() =>
      processNewsletters().catch((e) => console.error("[newsletter]", e)),
    );
  } catch {
    // Outside a request (scripts); the next request or the cron picks it up
  }
}

// Takes the next due newsletter, if no other worker has it
async function claim(): Promise<Newsletter | null> {
  const [row] = await db
    .update(newsletters)
    .set({
      status: "sending",
      lockedUntil: new Date(Date.now() + LEASE_MS),
      startedAt: sql`coalesce(${newsletters.startedAt}, now())`,
    })
    .where(
      sql`${newsletters.id} = (
        select id from newsletters
        where status in ('queued', 'sending') and send_at <= now()
          and (locked_until is null or locked_until < now())
        order by send_at limit 1
        for update skip locked
      )`,
    )
    .returning();
  return row ?? null;
}

async function finish(id: number, values: Partial<Newsletter>) {
  await db
    .update(newsletters)
    .set({ lockedUntil: null, ...values })
    .where(eq(newsletters.id, id));
}

/** Works through due newsletters for up to `budgetMs`. */
export async function processNewsletters(budgetMs = 60_000) {
  const until = Date.now() + budgetMs;
  let emails = 0;
  while (Date.now() < until) {
    const job = await claim();
    if (!job) break;
    emails += await sendBatches(job, until);
  }
  return { emails };
}

async function sendBatches(job: Newsletter, until: number) {
  const settings = await getSettings();
  const [post] = job.postId
    ? await db.select().from(posts).where(eq(posts.id, job.postId))
    : [];
  if (!post || !isLive(post)) {
    await finish(job.id, {
      status: "cancelled",
      error: "The post was unpublished or deleted before it was sent.",
      finishedAt: new Date(),
    });
    return 0;
  }
  const content = await emailContent(post, settings);
  let cursor = job.cursor;
  let sentTotal = 0;
  while (Date.now() < until) {
    const batch = await recipients(job, cursor);
    if (batch.length === 0) {
      await finish(job.id, {
        status: "sent",
        cursor,
        finishedAt: new Date(),
        error: null,
      });
      return sentTotal;
    }
    let sent = 0;
    let failed = 0;
    let lastError = "";
    for (const r of batch) {
      if (job.audience === "members" && !r.member) continue;
      try {
        await sendMail(newsletterMail(job, content, r, settings));
        sent++;
      } catch (error) {
        failed++;
        lastError = (error as Error).message;
      }
    }
    if (sent === 0 && failed > 0) {
      // Likely the mail server, not the addresses: keep the place and retry
      await finish(job.id, {
        lockedUntil: new Date(Date.now() + RETRY_MS),
        error: `Sending failed: ${lastError}. Retrying in 15 minutes.`,
      });
      return sentTotal;
    }
    cursor = batch[batch.length - 1].id;
    sentTotal += sent;
    await db
      .update(newsletters)
      .set({
        cursor,
        sent: sql`${newsletters.sent} + ${sent}`,
        failed: sql`${newsletters.failed} + ${failed}`,
        lockedUntil: new Date(Date.now() + LEASE_MS),
      })
      .where(eq(newsletters.id, job.id));
  }
  await finish(job.id, {});
  return sentTotal;
}

// Active subscribers who had confirmed when the newsletter was queued, and
// whether each has member access (matched to an account by email)
async function recipients(job: Newsletter, afterId: number) {
  const rows = await db
    .select({
      id: subscribers.id,
      email: subscribers.email,
      name: subscribers.name,
      role: user.role,
      status: memberships.status,
      currentPeriodEnd: memberships.currentPeriodEnd,
    })
    .from(subscribers)
    .leftJoin(user, sql`lower(${user.email}) = ${subscribers.email}`)
    .leftJoin(memberships, eq(memberships.userId, user.id))
    .where(
      and(
        eq(subscribers.status, "active"),
        lte(subscribers.confirmedAt, job.createdAt),
        gt(subscribers.id, afterId),
      ),
    )
    .orderBy(subscribers.id)
    .limit(BATCH);
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    member:
      (!!r.role && r.role !== "subscriber") ||
      membershipGrantsAccess(
        r.status
          ? { status: r.status, currentPeriodEnd: r.currentPeriodEnd }
          : null,
      ),
  }));
}

type EmailContent = {
  postUrl: string;
  full: { html: string; text: string };
  teaser: { html: string; text: string } | null;
};

async function emailContent(
  post: Post,
  settings: SiteSettings,
): Promise<EmailContent> {
  const postUrl = siteUrl(postPath(post, settings.permalinkStructure));
  const html = await applyFilters("post.contentHtml", post.contentHtml, {
    post,
  });
  const full = {
    html: emailBodyHtml(html, { postUrl, absolute: siteUrl }),
    text: docToMarkdown(post.content, {
      absolute: (u) => (u.startsWith("/") ? siteUrl(u) : u),
      formUrl: () => postUrl,
    }),
  };
  if (!isMembersOnly(post.meta)) return { postUrl, full, teaser: null };
  const short = teaser(post);
  return {
    postUrl,
    full,
    teaser: { html: `<p>${escapeHtml(short)}</p>`, text: short },
  };
}

function newsletterMail(
  job: Pick<Newsletter, "subject" | "preheader">,
  content: EmailContent,
  r: { id: number; email: string; member: boolean },
  settings: SiteSettings,
) {
  const locked = content.teaser && !r.member;
  const body = locked ? content.teaser : content.full;
  const { html, text } = renderNewsletter({
    siteTitle: settings.title,
    siteUrl: siteUrl("/"),
    title: job.subject,
    postUrl: content.postUrl,
    bodyHtml: body?.html ?? "",
    bodyText: body?.text ?? "",
    preheader: job.preheader,
    footer: settings.newsletterFooter,
    unsubscribeUrl: r.id ? unsubscribeUrl(r.id) : siteUrl("/newsletter"),
    teaser: !!locked,
  });
  return {
    to: r.email,
    subject: job.subject,
    html,
    text,
    headers: r.id
      ? {
          "List-Unsubscribe": `<${oneClickUrl(r.id)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined,
  };
}

/** A copy to one address (the sender's own) before sending for real. */
export async function sendTestNewsletter(input: {
  postId: number;
  subject?: string;
  preheader?: string;
  to: string;
}) {
  const settings = await getSettings();
  const [post] = await db
    .select()
    .from(posts)
    .where(eq(posts.id, input.postId));
  if (!post) throw new NewsletterError("This post no longer exists.");
  const content = await emailContent(post, settings);
  const mail = newsletterMail(
    {
      subject: `[Test] ${(input.subject ?? "").trim() || post.title}`,
      preheader: (input.preheader ?? "").trim() || post.excerpt,
    },
    content,
    { id: 0, email: input.to, member: true },
    settings,
  );
  await sendMail(mail);
  return { delivered: mailConfigured() };
}
