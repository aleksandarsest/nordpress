import "server-only";
import { aiProvenance, describeAiSources } from "./ai-provenance";
import { htmlToDoc } from "./content";
import { formatInZone } from "./dates";
import { docToMarkdown, markdownToHtml } from "./markdown";
import type { SiteSettings } from "./options";
import { authorPath, postPath, resolveRoute, termPath } from "./permalinks";
import { applyFilters } from "./plugins";
import { getPageTree, getPublished, listPublished } from "./posts";
import { listShopProducts, type ShopProduct } from "./shop";
import { formatMoney } from "./shop/money";
import { siteUrl } from "./site-url";
import type { SinglePost } from "./themes/types";

// Making the site easy for AI agents to read: Markdown versions of every
// post and page, llms.txt, and robots.txt rules for AI crawlers.

/** Crawlers that collect data to train models. */
export const AI_TRAINING_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "meta-externalagent",
  "Bytespider",
  "Amazonbot",
  "cohere-training-data-crawler",
  "AI2Bot",
];

/** AI search engines and assistants fetching pages to answer people. */
export const AI_SEARCH_BOTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "DuckAssistBot",
  "MistralAI-User",
];

export function robotsTxt(settings: SiteSettings) {
  if (!settings.blogPublic) return "User-agent: *\nDisallow: /\n";
  const yesNo = (v: boolean) => (v ? "yes" : "no");
  const lines = [
    "User-agent: *",
    // https://contentsignals.org: how content may be used once fetched
    `Content-Signal: search=yes, ai-input=${yesNo(settings.aiSearchCrawlers)}, ai-train=${yesNo(settings.aiTrainingCrawlers)}`,
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    "",
  ];
  const blocked = [
    ...(settings.aiTrainingCrawlers ? [] : AI_TRAINING_BOTS),
    ...(settings.aiSearchCrawlers ? [] : AI_SEARCH_BOTS),
  ];
  if (blocked.length) {
    lines.push(
      "# AI crawlers turned off in Settings → Reading",
      ...blocked.map((bot) => `User-agent: ${bot}`),
      "Disallow: /",
      "",
    );
  }
  lines.push(`Sitemap: ${siteUrl("/sitemap.xml")}`, "");
  return lines.join("\n");
}

const markdownOptions = {
  absolute: (url: string) => (url.startsWith("/") ? siteUrl(url) : url),
  formUrl: (id: number) => siteUrl(`/wp-json/nordpress/v1/forms/${id}`),
};

/** The .md address for a post's HTML path ("/" can't take a suffix). */
export const markdownPath = (path: string) =>
  path === "/" ? "/llms.txt" : `${path}.md`;

async function pathOf(post: SinglePost, settings: SiteSettings) {
  return (await pathsOf(post, settings)).html;
}

/** A post's HTML permalink and its Markdown address. */
export async function pathsOf(post: SinglePost, settings: SiteSettings) {
  const pagePath =
    post.type === "page"
      ? (await getPageTree()).find((p) => p.id === post.id)?.path
      : undefined;
  const html = postPath(post, settings.permalinkStructure, pagePath);
  // The front page lives at "/", but its Markdown stays at the page path
  return { html, markdown: pagePath ? `/${pagePath}.md` : markdownPath(html) };
}

export type MarkdownLookup =
  | { kind: "post"; post: SinglePost; path: string }
  | { kind: "redirect"; to: string };

// Finds the published post or page a URL path points to. Only permalinks
// map to posts; archives and the front page are covered by llms.txt.
export async function findForMarkdown(
  segments: string[],
  settings: SiteSettings,
): Promise<MarkdownLookup | null> {
  const route = resolveRoute(segments, {});
  let post: SinglePost | null = null;
  if (route.kind === "single" || route.kind === "page-by-id") {
    post = await getPublished({ id: route.id });
  } else if (route.kind === "dated") {
    post = await getPublished({ type: "post", slug: route.slug });
  } else if (route.kind === "slug") {
    const path = route.slugs.join("/");
    const page = (await getPageTree()).find((p) => p.path === path);
    if (page) {
      if (page.id === settings.pageForPosts && settings.showOnFront === "page")
        return null;
      post = await getPublished({ id: page.id });
    } else if (route.slugs.length === 1) {
      post = await getPublished({ type: "post", slug: route.slugs[0] });
    }
  }
  if (!post) return null;
  const path = await pathOf(post, settings);
  const requested = `/${segments.join("/")}`;
  if (path !== requested && path !== "/")
    return { kind: "redirect", to: markdownPath(path) };
  return { kind: "post", post, path };
}

const isoDate = (date: Date | null, settings: SiteSettings) =>
  date ? formatInZone(date, settings.timezone, "yyyy-MM-dd") : null;

export async function postMarkdown(
  post: SinglePost,
  settings: SiteSettings,
  path: string,
) {
  const categories = post.terms.filter((t) => t.taxonomy === "category");
  const tags = post.terms.filter((t) => t.taxonomy === "post_tag");
  const facts = [
    `URL: ${siteUrl(path)}`,
    post.publishedAt && `Published: ${isoDate(post.publishedAt, settings)}`,
    post.updatedAt &&
      post.publishedAt &&
      post.updatedAt.getTime() - post.publishedAt.getTime() > 86_400_000 &&
      `Updated: ${isoDate(post.updatedAt, settings)}`,
    post.type === "post" &&
      post.authorName &&
      post.authorId &&
      `Author: [${post.authorName}](${siteUrl(authorPath(post.authorId))})`,
    categories.length &&
      `Categories: ${categories.map((t) => `[${t.name}](${siteUrl(termPath(t.taxonomy, t.slug))})`).join(", ")}`,
    tags.length && `Tags: ${tags.map((t) => t.name).join(", ")}`,
    aiProvenance(post.meta) &&
      `AI assistance: written with help from ${describeAiSources(aiProvenance(post.meta)?.sources ?? [])}`,
  ].filter(Boolean);
  const body = docToMarkdown(post.content, markdownOptions);
  const markdown = [
    `# ${post.title || "(no title)"}`,
    post.excerpt && `> ${post.excerpt.replace(/\n+/g, " ")}`,
    facts.map((f) => `- ${f}`).join("\n"),
    body,
  ]
    .filter(Boolean)
    .join("\n\n");
  return `${await applyFilters("post.markdown", markdown, { post })}\n`;
}

export async function productMarkdown(
  product: ShopProduct,
  settings: SiteSettings,
) {
  const facts = [
    `URL: ${siteUrl(`/shop/${product.slug}`)}`,
    `Price: ${formatMoney(product.priceCents, settings.shopCurrency)}`,
    `Availability: ${product.stock === 0 ? "sold out" : product.stock === null ? "in stock" : `${product.stock} in stock`}`,
    product.sku && `SKU: ${product.sku}`,
    product.shippable
      ? "Shipped to the buyer"
      : "Delivered digitally or in person",
  ].filter(Boolean);
  return `${[
    `# ${product.name}`,
    product.summary && `> ${product.summary}`,
    facts.map((f) => `- ${f}`).join("\n"),
    // Through the editor schema, like every other description we serve
    docToMarkdown(
      htmlToDoc(markdownToHtml(product.description)),
      markdownOptions,
    ),
    `To buy: add it to the cart at ${siteUrl(`/shop/${product.slug}`)} and check out at ${siteUrl("/shop/cart")}.`,
  ]
    .filter(Boolean)
    .join("\n\n")}\n`;
}

const LLMS_POSTS = 50;
const FULL_POSTS = 100;

// https://llmstxt.org: a Markdown index of the site for language models.
export async function llmsTxt(settings: SiteSettings) {
  const [pages, posts, shop] = await Promise.all([
    getPageTree(),
    listPublished({ perPage: LLMS_POSTS }),
    listShopProducts(),
  ]);
  const link = (title: string, path: string, note?: string) =>
    `- [${title || "(no title)"}](${siteUrl(markdownPath(path))})${note ? `: ${note}` : ""}`;
  const sections = [
    `# ${settings.title}`,
    settings.tagline && `> ${settings.tagline}`,
    `Every page below is also available as HTML at the same address without the \`.md\` suffix. Full text of everything: ${siteUrl("/llms-full.txt")}`,
    pages.length &&
      `## Pages\n\n${pages
        .filter(
          (p) =>
            !(
              p.id === settings.pageForPosts && settings.showOnFront === "page"
            ),
        )
        // The front page's .md stays at its page path, since "/" can't take a suffix
        .map((p) => link(p.title, `/${p.path}`))
        .join("\n")}`,
    posts.items.length &&
      `## Posts\n\n${posts.items
        .map((p) =>
          link(
            p.title,
            postPath(p, settings.permalinkStructure),
            [isoDate(p.publishedAt, settings), p.excerpt]
              .filter(Boolean)
              .join(" — "),
          ),
        )
        .join("\n")}`,
    shop.length &&
      `## Products\n\n${shop
        .map(
          (p) =>
            `- [${p.name}](${siteUrl(`/shop/${p.slug}.md`)}): ${formatMoney(p.priceCents, settings.shopCurrency)}${p.stock === 0 ? ", sold out" : ""}${p.summary ? ` — ${p.summary}` : ""}`,
        )
        .join("\n")}`,
    `## Optional\n\n- [RSS feed](${siteUrl("/feed")}): the latest posts\n- [REST API](${siteUrl("/wp-json")}): WordPress-compatible API for posts, pages, comments and search\n- [Forms API](${siteUrl("/wp-json/nordpress/v1")}): forms linked from pages can be read and submitted as JSON`,
  ];
  return `${sections.filter(Boolean).join("\n\n")}\n`;
}

export async function llmsFullTxt(settings: SiteSettings) {
  const [pages, posts] = await Promise.all([
    getPageTree(),
    listPublished({ perPage: FULL_POSTS }),
  ]);
  const ids = [...pages.map((p) => p.id), ...posts.items.map((p) => p.id)];
  const docs: string[] = [];
  for (const id of ids) {
    const post = await getPublished({ id });
    if (!post) continue;
    docs.push(await postMarkdown(post, settings, await pathOf(post, settings)));
  }
  const header = [
    `# ${settings.title}`,
    settings.tagline && `> ${settings.tagline}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return `${[header, ...docs.map((d) => d.trim())].join("\n\n---\n\n")}\n`;
}
