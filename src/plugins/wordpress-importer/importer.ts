import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "@/db";
import {
  type CommentStatus,
  comments,
  media,
  menuItems,
  menus,
  posts,
  terms,
  user,
} from "@/db/schema";
import { embeddingsConfigured, rebuildIndex } from "@/lib/ai/embeddings";
import { createUserWithPassword } from "@/lib/auth";
import { COMMENTS_TAG } from "@/lib/comments";
import { htmlToDoc } from "@/lib/content";
import {
  ALLOWED_TYPES,
  MAX_UPLOAD_BYTES,
  mediaUrl,
  storeUpload,
  updateMedia,
} from "@/lib/media";
import { createMenu, isAllowedMenuUrl, MENUS_TAG } from "@/lib/menus";
import { assertPublicUrl } from "@/lib/net";
import {
  DEFAULT_SETTINGS,
  getSettings,
  SETTINGS_TAG,
  saveSettings,
} from "@/lib/options";
import { postPath } from "@/lib/permalinks";
import { POSTS_TAG, type SaveIntent, savePost, trashPost } from "@/lib/posts";
import { RedirectRuleError, saveRedirect } from "@/lib/redirects";
import type { Viewer } from "@/lib/session";
import { createTerm, TERMS_TAG } from "@/lib/terms";
import { type CrawlResult, crawlSite } from "./crawl";
import { fetchLiveSite, LiveImportError, liveToWxr } from "./live";
import {
  autop,
  cleanContent,
  menusFromWxr,
  parentsFirst,
  parseWxr,
  type Wxr,
  type WxrItem,
  type WxrMenu,
} from "./wxr";

export type AuthorMode = "me" | "match" | "create";

export type ImportOptions = {
  authorMode: AuthorMode;
  downloadMedia: boolean;
  allowPrivateHosts: boolean;
};

export type ImportCounts = {
  posts: number;
  pages: number;
  categories: number;
  tags: number;
  comments: number;
  media: number;
  menus: number;
  users: number;
  skipped: number;
  failed: number;
};

export type ImportJob = {
  status: "running" | "done" | "failed";
  phase: string;
  progress: { done: number; total: number };
  counts: ImportCounts;
  log: string[];
  startedAt: string;
  finishedAt?: string;
  source?: string;
};

const MAX_LOG = 200;
let current: ImportJob | null = null;

export function currentJob() {
  return current;
}

const IMPORTABLE_TYPES = new Set(["post", "page"]);
const STATUS_MAP: Record<string, SaveIntent> = {
  publish: "publish",
  future: "publish",
  draft: "draft",
  pending: "pending",
  private: "private",
};
const COMMENT_STATUS: Record<string, CommentStatus> = {
  "1": "approved",
  "0": "pending",
  spam: "spam",
  trash: "trash",
};

function emptyCounts(): ImportCounts {
  return {
    posts: 0,
    pages: 0,
    categories: 0,
    tags: 0,
    comments: 0,
    media: 0,
    menus: 0,
    users: 0,
    skipped: 0,
    failed: 0,
  };
}

/** An export file's contents, or the address of a live WordPress site. */
export type ImportSource = { xml: string } | { siteUrl: string };

export function startImport(
  source: ImportSource,
  actor: Viewer,
  options: ImportOptions,
) {
  if (current?.status === "running")
    throw new Error("An import is already running.");
  const job: ImportJob = {
    status: "running",
    phase: "xml" in source ? "Reading the export file" : "Reading the site",
    progress: { done: 0, total: 0 },
    counts: emptyCounts(),
    log: [],
    startedAt: new Date().toISOString(),
  };
  current = job;
  return {
    job,
    run: () =>
      runImport(source, actor, options, job).catch((error) => {
        job.status = "failed";
        job.finishedAt = new Date().toISOString();
        note(job, `Import stopped: ${(error as Error).message}`);
        console.error("[plugin:wordpress-importer]", error);
      }),
  };
}

function note(job: ImportJob, message: string) {
  job.log.push(message);
  if (job.log.length > MAX_LOG) job.log.splice(0, job.log.length - MAX_LOG);
}

async function runImport(
  source: ImportSource,
  actor: Viewer,
  options: ImportOptions,
  job: ImportJob,
) {
  // The same network guard as media downloads
  const guard = (url: string) =>
    options.allowPrivateHosts ? Promise.resolve() : assertPublicUrl(url);
  const progress = (message: string) => {
    job.phase = message;
  };
  // A WordPress site is read through its REST API; any other site (or one
  // with the API turned off) is copied page by page
  let crawled: CrawlResult | null = null;
  let wxr: Wxr;
  if ("xml" in source) wxr = parseWxr(source.xml);
  else {
    try {
      wxr = liveToWxr(await fetchLiveSite(source.siteUrl, guard, progress));
    } catch (error) {
      if (!(error instanceof LiveImportError) && !(error instanceof TypeError))
        throw error;
      note(
        job,
        "It isn't WordPress (or its API is off), so its pages are copied one by one.",
      );
      crawled = await crawlSite(source.siteUrl, guard, progress);
      wxr = crawled.wxr;
    }
  }
  job.source = wxr.site.title || wxr.site.link;
  const items = wxr.items.filter((i) => IMPORTABLE_TYPES.has(i.type));
  const attachments = options.downloadMedia
    ? wxr.items.filter((i) => i.type === "attachment" && i.attachmentUrl)
    : [];
  const unsupported = wxr.items.filter(
    (i) =>
      !IMPORTABLE_TYPES.has(i.type) &&
      i.type !== "attachment" &&
      i.type !== "nav_menu_item",
  );
  if (unsupported.length) {
    const kinds = [...new Set(unsupported.map((i) => i.type))].join(", ");
    note(
      job,
      `Skipping ${unsupported.length} items of unsupported types (${kinds}).`,
    );
  }
  job.progress = { done: 0, total: items.length + attachments.length };

  // 1. Authors
  job.phase = "Matching authors";
  const authorIds = await mapAuthors(
    wxr.authors,
    actor,
    options.authorMode,
    job,
  );
  const wpUserIds = new Map(
    wxr.authors.map((a) => [a.id, authorIds.get(a.login) ?? actor.id]),
  );

  // 2. Categories and tags
  job.phase = "Creating categories and tags";
  const categoryIds = await importTerms(
    "category",
    parentsFirst(wxr.categories),
    job,
  );
  const tagIds = await importTerms("post_tag", wxr.tags, job);

  // 3. Media
  const mediaIds = new Map<number, number>();
  const urlMap = new Map<string, string>();
  if (attachments.length) {
    job.phase = "Downloading media";
    for (const item of attachments) {
      try {
        const saved = await importAttachment(
          item,
          authorIds.get(item.creator) ?? actor.id,
          options,
          job,
        );
        if (saved) {
          mediaIds.set(item.id, saved.id);
          urlMap.set(stripSize(item.attachmentUrl), saved.url);
        }
      } catch (error) {
        job.counts.failed++;
        note(
          job,
          `Couldn't download ${item.attachmentUrl}: ${(error as Error).message}`,
        );
      }
      job.progress.done++;
    }
  }

  // 4. Posts and pages (parents first, so hierarchy can be linked)
  job.phase = "Importing posts and pages";
  const postIds = new Map<number, number>();
  for (const item of parentsFirstItems(items)) {
    try {
      const id = await importItem(item, {
        actor,
        authorId: authorIds.get(item.creator) ?? actor.id,
        categoryIds,
        tagIds,
        mediaIds,
        postIds,
        urlMap,
        baseUrl: wxr.site.baseSiteUrl,
        job,
      });
      if (id) {
        postIds.set(item.id, id);
        await importComments(item, id, wpUserIds, job);
      }
    } catch (error) {
      job.counts.failed++;
      note(
        job,
        `Couldn't import “${item.title || item.slug}”: ${(error as Error).message}`,
      );
    }
    job.progress.done++;
  }

  // 5. Menus (they point at the posts and terms created above)
  const wxrMenus = menusFromWxr(wxr);
  if (wxrMenus.length) {
    job.phase = "Creating menus";
    const byWpTermId = (
      list: typeof wxr.categories,
      ids: Map<string, number>,
    ) =>
      new Map(
        list.flatMap((t) =>
          ids.has(t.slug) ? [[t.id, ids.get(t.slug) as number]] : [],
        ),
      );
    await importMenus(
      wxrMenus,
      {
        posts: postIds,
        category: byWpTermId(wxr.categories, categoryIds),
        post_tag: byWpTermId(wxr.tags, tagIds),
      },
      job,
    );
  }

  // 6. Old addresses keep working: each imported page's old path
  // redirects to its new one
  job.phase = "Adding redirects";
  await redirectOldLinks(wxr, items, postIds, job);

  // 7. A copied site gets its home page, menu, logo and color back
  if (crawled) await finishCopiedSite(crawled, postIds, actor, options, job);

  // 8. Caches and search index
  job.phase = "Finishing up";
  for (const tag of [
    POSTS_TAG,
    TERMS_TAG,
    COMMENTS_TAG,
    SETTINGS_TAG,
    MENUS_TAG,
  ])
    revalidateTag(tag, { expire: 0 });
  if (embeddingsConfigured()) {
    note(job, "Updating the search index…");
    await rebuildIndex();
  }

  job.phase = "Done";
  job.status = "done";
  job.finishedAt = new Date().toISOString();
  note(job, "Import finished.");
}

// ---------------------------------------------------------------------------

async function mapAuthors(
  authors: { login: string; email: string; displayName: string }[],
  actor: Viewer,
  mode: AuthorMode,
  job: ImportJob,
) {
  const map = new Map<string, string>();
  for (const author of authors) {
    if (mode === "me" || !author.email) {
      map.set(author.login, actor.id);
      continue;
    }
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, author.email));
    if (existing) {
      map.set(author.login, existing.id);
    } else if (mode === "create") {
      // A random password the person never sees; an admin sets a real one
      const created = await createUserWithPassword({
        name: author.displayName,
        email: author.email,
        password: randomBytes(24).toString("base64url"),
        role: "author",
      });
      map.set(author.login, created.id);
      job.counts.users++;
      note(
        job,
        `Created author account ${author.displayName} <${author.email}>. Set a password under Users before they log in.`,
      );
    } else {
      map.set(author.login, actor.id);
    }
  }
  return map;
}

async function importTerms(
  taxonomy: "category" | "post_tag",
  list: { slug: string; name: string; description: string; parent: string }[],
  job: ImportJob,
) {
  const ids = new Map<string, number>();
  for (const term of list) {
    if (!term.slug || !term.name) continue;
    const [existing] = await db
      .select({ id: terms.id })
      .from(terms)
      .where(and(eq(terms.taxonomy, taxonomy), eq(terms.slug, term.slug)));
    if (existing) {
      ids.set(term.slug, existing.id);
      continue;
    }
    const created = await createTerm(taxonomy, {
      name: term.name,
      slug: term.slug,
      description: term.description,
      parentId: term.parent ? (ids.get(term.parent) ?? null) : null,
    });
    ids.set(term.slug, created.id);
    if (taxonomy === "category") job.counts.categories++;
    else job.counts.tags++;
  }
  return ids;
}

// "photo-300x200.jpg" and "photo.jpg" are the same upload in WordPress
function stripSize(url: string) {
  return url
    .replace(/-\d+x\d+(\.[a-z0-9]+)$/i, "$1")
    .replace(/-scaled(\.[a-z0-9]+)$/i, "$1");
}

function rewriteMediaUrls(html: string, urlMap: Map<string, string>) {
  if (urlMap.size === 0) return html;
  return html.replace(
    /(src|href)=(["'])(https?:\/\/[^"']+)\2/g,
    (match, attr, quote, url: string) => {
      const mapped = urlMap.get(stripSize(url.split("?")[0]));
      return mapped ? `${attr}=${quote}${mapped}${quote}` : match;
    },
  );
}

// Downloads a file named in the export, refusing internal network addresses
// (unless explicitly allowed) so an export file can't probe the server's network.
async function download(url: string, allowPrivate: boolean) {
  const parsed = allowPrivate ? new URL(url) : await assertPublicUrl(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error("only http(s) URLs are allowed");
  const res = await fetch(parsed, {
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES) throw new Error("file is larger than 20 MB");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_UPLOAD_BYTES)
    throw new Error("file is larger than 20 MB");
  return { bytes, type };
}

function guessType(url: string, served: string) {
  if (ALLOWED_TYPES[served]) return served;
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  const byExt: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    pdf: "application/pdf",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
  };
  return (ext && byExt[ext]) || served;
}

async function importAttachment(
  item: WxrItem,
  uploaderId: string,
  options: ImportOptions,
  job: ImportJob,
) {
  const [existing] = await db
    .select({ id: media.id, path: media.path })
    .from(media)
    .where(sql`${media.meta}->>'wpUrl' = ${item.attachmentUrl}`);
  if (existing) {
    job.counts.skipped++;
    return { id: existing.id, url: mediaUrl(existing.path) };
  }

  const { bytes, type } = await download(
    item.attachmentUrl,
    options.allowPrivateHosts,
  );
  const name = decodeURIComponent(
    item.attachmentUrl.split("?")[0].split("/").pop() || "file",
  );
  const row = await storeUpload(
    new File([bytes], name, { type: guessType(item.attachmentUrl, type) }),
    uploaderId,
  );
  await updateMedia(row.id, {
    title: item.title || row.title,
    alt: item.meta._wp_attachment_image_alt ?? "",
    caption: item.excerpt,
  });
  await db
    .update(media)
    .set({ meta: { wpId: item.id, wpUrl: item.attachmentUrl } })
    .where(eq(media.id, row.id));
  job.counts.media++;
  return { id: row.id, url: mediaUrl(row.path) };
}

function parentsFirstItems(items: WxrItem[]) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: WxrItem[] = [];
  const seen = new Set<number>();
  const visit = (item: WxrItem, path: Set<number>) => {
    if (seen.has(item.id) || path.has(item.id)) return;
    path.add(item.id);
    const parent = byId.get(item.parentId);
    if (parent) visit(parent, path);
    seen.add(item.id);
    out.push(item);
  };
  for (const item of items) visit(item, new Set());
  return out;
}

type ItemContext = {
  actor: Viewer;
  authorId: string;
  categoryIds: Map<string, number>;
  tagIds: Map<string, number>;
  mediaIds: Map<number, number>;
  postIds: Map<number, number>;
  urlMap: Map<string, string>;
  baseUrl: string;
  job: ImportJob;
};

async function importItem(item: WxrItem, ctx: ItemContext) {
  const intent = STATUS_MAP[item.status];
  if (!intent) {
    ctx.job.counts.skipped++;
    return null;
  }
  const guid = item.guid || `${ctx.baseUrl}/?p=${item.id}`;
  const [existing] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(sql`${posts.meta}->>'wpGuid' = ${guid}`);
  if (existing) {
    ctx.job.counts.skipped++;
    return existing.id;
  }

  const protectedPost = !!item.password && intent === "publish";
  if (protectedPost) {
    note(
      ctx.job,
      `“${item.title}” was password-protected in WordPress; imported as private.`,
    );
  }

  const html = autop(cleanContent(rewriteMediaUrls(item.content, ctx.urlMap)));
  const thumbnail = Number(item.meta._thumbnail_id) || 0;
  const saved = await savePost(ctx.actor, {
    type: item.type as "post" | "page",
    intent: protectedPost ? "private" : intent,
    title: item.title,
    slug: item.slug,
    content: htmlToDoc(html),
    excerpt: item.excerpt,
    publishedAt: item.dateGmt,
    parentId: item.parentId ? (ctx.postIds.get(item.parentId) ?? null) : null,
    menuOrder: item.menuOrder,
    featuredMediaId: thumbnail ? (ctx.mediaIds.get(thumbnail) ?? null) : null,
    commentStatus: item.commentStatus,
    sticky: item.sticky,
    categoryIds: item.categories.flatMap((s) => ctx.categoryIds.get(s) ?? []),
    tagIds: item.tags.flatMap((s) => ctx.tagIds.get(s) ?? []),
    authorId: ctx.authorId,
    source: "import",
  });
  await db
    .update(posts)
    .set({
      meta: { ...saved.meta, wpId: item.id, wpGuid: guid, wpLink: item.link },
    })
    .where(eq(posts.id, saved.id));
  if (item.type === "page") ctx.job.counts.pages++;
  else ctx.job.counts.posts++;
  return saved.id;
}

async function importComments(
  item: WxrItem,
  postId: number,
  wpUserIds: Map<number, string>,
  job: ImportJob,
) {
  const list = item.comments
    .filter(
      (c) =>
        (c.type === "" || c.type === "comment") && COMMENT_STATUS[c.approved],
    )
    .sort((a, b) => a.id - b.id);
  if (list.length === 0) return;
  // Comments of an already imported post were imported with it
  const already = await db.$count(comments, eq(comments.postId, postId));
  if (already) return;

  const ids = new Map<number, number>();
  for (const c of list) {
    const [row] = await db
      .insert(comments)
      .values({
        postId,
        parentId: c.parentId ? (ids.get(c.parentId) ?? null) : null,
        userId: c.userId ? (wpUserIds.get(c.userId) ?? null) : null,
        authorName: c.authorName || "Anonymous",
        authorEmail: c.authorEmail,
        authorUrl: /^https?:\/\//i.test(c.authorUrl) ? c.authorUrl : "",
        content: c.content,
        status: COMMENT_STATUS[c.approved],
        ipAddress: c.authorIp || null,
        ...(c.dateGmt ? { createdAt: c.dateGmt, updatedAt: c.dateGmt } : {}),
      })
      .returning({ id: comments.id });
    ids.set(c.id, row.id);
    job.counts.comments++;
  }
}

// WordPress keeps menu locations in theme settings, which exports leave out,
// so imported menus still need assigning under Appearance → Menus.
async function importMenus(
  list: WxrMenu[],
  ids: {
    posts: Map<number, number>;
    category: Map<number, number>;
    post_tag: Map<number, number>;
  },
  job: ImportJob,
) {
  for (const menu of list) {
    const [existing] = await db
      .select({ id: menus.id })
      .from(menus)
      .where(eq(menus.name, menu.name));
    if (existing) {
      job.counts.skipped++;
      note(job, `A menu named “${menu.name}” already exists; left it as is.`);
      continue;
    }
    const { id: menuId } = await createMenu(menu.name);
    const newIds = new Map<number, number>();
    let position = 0;
    let missing = menu.skipped;
    for (const item of menu.items) {
      const objectId =
        item.kind === "post"
          ? ids.posts.get(item.objectWpId)
          : item.kind === "term"
            ? ids[item.taxonomy].get(item.objectWpId)
            : null;
      if (
        (item.kind === "custom" && !isAllowedMenuUrl(item.url)) ||
        (item.kind !== "custom" && !objectId)
      ) {
        missing++;
        continue;
      }
      const [row] = await db
        .insert(menuItems)
        .values({
          menuId,
          // Children of a skipped item move up to the top level
          parentId: newIds.get(item.parentWpId) ?? null,
          position: position++,
          type: item.kind,
          objectId: objectId ?? null,
          url: item.kind === "custom" ? item.url : "",
          label: item.label,
          openInNewTab: item.newTab,
        })
        .returning({ id: menuItems.id });
      newIds.set(item.wpId, row.id);
    }
    job.counts.menus++;
    note(
      job,
      `Created the “${menu.name}” menu with ${position} items` +
        (missing
          ? `, leaving out ${missing} that pointed to content that wasn't imported`
          : "") +
        ". Assign it to a location under Appearance → Menus.",
    );
  }
}

// ---------------------------------------------------------------------------
// After the import
// ---------------------------------------------------------------------------

async function redirectOldLinks(
  wxr: Wxr,
  items: WxrItem[],
  postIds: Map<number, number>,
  job: ImportJob,
) {
  let base: URL;
  try {
    base = new URL(wxr.site.baseSiteUrl || wxr.site.link);
  } catch {
    return;
  }
  const settings = await getSettings();
  const ids = [...postIds.values()];
  if (ids.length === 0) return;
  const rows = await db.select().from(posts).where(inArray(posts.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Page paths from the imported rows themselves; cached trees are stale here
  const pagePath = (id: number, seen = new Set<number>()): string => {
    const row = byId.get(id);
    if (!row || seen.has(id)) return "";
    seen.add(id);
    const parent = row.parentId ? pagePath(row.parentId, seen) : "";
    return parent ? `${parent}/${row.slug}` : row.slug;
  };
  let added = 0;
  for (const item of items) {
    const id = postIds.get(item.id);
    const row = id ? byId.get(id) : undefined;
    if (row?.status !== "publish" || !item.link) continue;
    let old: URL;
    try {
      old = new URL(item.link);
    } catch {
      continue;
    }
    if (
      old.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")
    )
      continue;
    const from = old.pathname.replace(/\/+$/, "") || "/";
    const to = postPath(
      row,
      settings.permalinkStructure,
      row.type === "page" ? pagePath(row.id) : undefined,
    );
    if (from === "/" || from === to) continue;
    try {
      await saveRedirect({ source: from, target: to, origin: "import" });
      added++;
    } catch (error) {
      if (!(error instanceof RedirectRuleError)) throw error;
    }
  }
  if (added)
    note(
      job,
      `Added ${added} redirect${added === 1 ? "" : "s"} from the old addresses, so existing links and search results keep working once your domain points here.`,
    );
}

async function finishCopiedSite(
  crawled: CrawlResult,
  postIds: Map<number, number>,
  actor: Viewer,
  options: ImportOptions,
  job: ImportJob,
) {
  const settings = await getSettings();
  const changes: Parameters<typeof saveSettings>[0] = {};
  const home = crawled.homeItemId ? postIds.get(crawled.homeItemId) : undefined;
  if (home && !(settings.showOnFront === "page" && settings.pageOnFront)) {
    changes.showOnFront = "page";
    changes.pageOnFront = home;
    note(job, "Made the copied home page your front page.");
  }
  // The imported menu goes in the header when nothing is there yet
  const [menu] = await db
    .select({ id: menus.id })
    .from(menus)
    .where(eq(menus.name, "Main menu"));
  if (menu && !settings.menuLocations.primary) {
    changes.menuLocations = { ...settings.menuLocations, primary: menu.id };
  }
  if (crawled.logo && !settings.siteLogo && options.downloadMedia) {
    try {
      const saved = await importAttachment(
        { ...emptyItem(), title: "Logo", attachmentUrl: crawled.logo },
        actor.id,
        options,
        job,
      );
      if (saved) changes.siteLogo = saved.id;
    } catch (error) {
      note(job, `Couldn't copy the logo: ${(error as Error).message}`);
    }
  }
  if (crawled.themeColor && !settings.siteLogo) {
    changes.design = {
      ...settings.design,
      preset: "custom",
      brand: crawled.themeColor,
    };
    note(job, "Used the old site's brand color in your design.");
  }
  if (crawled.description && settings.tagline === DEFAULT_SETTINGS.tagline)
    changes.tagline = crawled.description.slice(0, 200);
  // The sample post and page make no sense on a copied site
  const samples = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(
        inArray(posts.slug, ["hello-world", "sample-page"]),
        eq(posts.status, "publish"),
      ),
    );
  for (const { id } of samples) await trashPost(actor, id);
  if (samples.length) note(job, "Moved the sample post and page to the trash.");
  if (Object.keys(changes).length) await saveSettings(changes);
}

function emptyItem(): WxrItem {
  return {
    id: 0,
    type: "attachment",
    status: "inherit",
    title: "",
    slug: "",
    guid: "",
    link: "",
    creator: "",
    content: "",
    excerpt: "",
    dateGmt: null,
    parentId: 0,
    menuOrder: 0,
    commentStatus: "closed",
    password: "",
    sticky: false,
    attachmentUrl: "",
    categories: [],
    tags: [],
    navMenus: [],
    meta: {},
    comments: [],
  };
}
