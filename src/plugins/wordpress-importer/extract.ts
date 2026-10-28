import { Window } from "happy-dom";

// Reads one page of any website (Wix, Squarespace, Webflow, hand-made):
// its title, main content, images, date and links. The page's scripts never
// run; happy-dom only parses. Pure apart from the parser.

export type ExtractedPage = {
  url: string;
  title: string;
  description: string;
  /** The main content as HTML, still to be cleaned by htmlToDoc. */
  html: string;
  /** Absolute addresses of the content's images. */
  images: string[];
  /** When it was published, for posts. */
  date: Date | null;
  /** Looks like a blog post or news item rather than a page. */
  isPost: boolean;
  /** Same-site links anywhere on the page, for finding more pages. */
  links: string[];
  /** The site's main menu, in order. */
  nav: { label: string; url: string }[];
  logo: string | null;
  themeColor: string | null;
  siteName: string | null;
};

// Parts of a page that are never content
const CHROME = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "nav",
  "header",
  "footer",
  "aside",
  "[role='navigation']",
  "[role='banner']",
  "[role='contentinfo']",
  "[aria-hidden='true']",
  "[hidden]",
  "[class*='cookie']",
  "[id*='cookie']",
  "[class*='consent']",
  "[class*='newsletter']",
  "[class*='share']",
  "[class*='social']",
  "[class*='breadcrumb']",
  "[class*='comments']",
  "[class*='related']",
  "[class*='popup']",
  "[class*='modal']",
].join(",");

// Where site builders put the main content, best guesses first
const MAIN = [
  "main article",
  "article",
  "main",
  "[role='main']",
  "#PAGES_CONTAINER", // Wix
  ".sqs-layout", // Squarespace
  ".entry-content",
  ".post-content",
  ".page-content",
  "#content",
  ".content",
];

const NON_PAGE =
  /\.(jpe?g|png|gif|webp|svg|avif|pdf|zip|mp[34]|webm|css|js|xml|json|ics)$/i;
const SKIP_PATH =
  /^\/(cart|checkout|account|login|signin|sign-in|register|search|wp-admin|wp-login|feed|tag|tags|category|categories|author|cdn-cgi|_next|static|assets)(\/|$)/i;

/** A same-site address worth crawling, normalized; or null. */
export function crawlable(href: string, base: URL): string | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (
    url.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")
  )
    return null;
  if (NON_PAGE.test(url.pathname) || SKIP_PATH.test(url.pathname)) return null;
  url.hash = "";
  url.search = "";
  url.protocol = base.protocol;
  url.hostname = base.hostname;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return `${url.origin}${path}`;
}

function bestImage(img: Element, base: URL) {
  const candidates = [
    img.getAttribute("data-src"),
    img.getAttribute("data-lazy-src"),
    img.getAttribute("src"),
  ];
  // The widest from srcset, when there is one
  const srcset = img.getAttribute("srcset") ?? img.getAttribute("data-srcset");
  if (srcset) {
    const widest = srcset
      .split(",")
      .map((part) => part.trim().split(/\s+/))
      .map(([u, w]) => ({ u, w: Number.parseInt(w ?? "0", 10) || 0 }))
      .sort((a, b) => b.w - a.w)[0];
    if (widest?.u) candidates.unshift(widest.u);
  }
  for (const c of candidates) {
    if (!c || c.startsWith("data:")) continue;
    try {
      const url = new URL(c, base);
      if (url.protocol === "https:" || url.protocol === "http:")
        return url.toString();
    } catch {}
  }
  return null;
}

const textOf = (el: Element | null) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** Reads a page. `url` is where it was fetched from (after redirects). */
export function extractPage(html: string, url: string): ExtractedPage {
  const base = new URL(url);
  const window = new Window({
    url,
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableIframePageLoading: true,
      disableComputedStyleRendering: true,
      navigator: { userAgent: "Nordpress importer" },
    },
  });
  const doc = new window.DOMParser().parseFromString(
    html,
    "text/html",
  ) as unknown as Document;
  const meta = (name: string) =>
    doc
      .querySelector(`meta[property="${name}"], meta[name="${name}"]`)
      ?.getAttribute("content")
      ?.trim() ?? "";

  const siteName = meta("og:site_name") || null;
  // "Page | Site" titles lose the site part
  let title =
    meta("og:title") ||
    textOf(doc.querySelector("title")) ||
    textOf(doc.querySelector("h1"));
  if (siteName)
    title = title.replace(
      new RegExp(`\\s*[|–—-]\\s*${escapeRegex(siteName)}\\s*$`, "i"),
      "",
    );
  title = title.slice(0, 300);

  // Links and menu, before the chrome is removed
  const links = new Set<string>();
  for (const a of doc.querySelectorAll("a[href]")) {
    const target = crawlable(a.getAttribute("href") ?? "", base);
    if (target) links.add(target);
  }
  const navRoot =
    doc.querySelector("header nav") ??
    doc.querySelector("nav") ??
    doc.querySelector("[role='navigation']");
  const nav: ExtractedPage["nav"] = [];
  const seenNav = new Set<string>();
  for (const a of navRoot?.querySelectorAll("a[href]") ?? []) {
    const target = crawlable(a.getAttribute("href") ?? "", base);
    const label = textOf(a);
    if (!target || !label || label.length > 60 || seenNav.has(target)) continue;
    seenNav.add(target);
    nav.push({ label, url: target });
  }

  const logoImg =
    doc.querySelector(
      "header img[class*='logo'], header img[alt*='logo'], header img[alt*='Logo'], [class*='logo'] img, img[class*='logo'], img[id*='logo']",
    ) ?? doc.querySelector("header img");
  const logo = logoImg ? bestImage(logoImg, base) : null;

  const published =
    meta("article:published_time") ||
    doc.querySelector("time[datetime]")?.getAttribute("datetime") ||
    "";
  const date = published ? new Date(published) : null;
  const validDate = date && !Number.isNaN(date.getTime()) ? date : null;
  const isPost =
    meta("og:type") === "article" ||
    !!meta("article:published_time") ||
    /\/(blog|news|posts?|articles?|journal|stories)\/[^/]+$/i.test(
      base.pathname,
    ) ||
    /\/\d{4}\/\d{2}\//.test(base.pathname);

  // The main content: the candidate with the most text
  for (const el of doc.querySelectorAll(CHROME)) el.remove();
  const candidates = MAIN.flatMap((sel) => [...doc.querySelectorAll(sel)]);
  const root =
    candidates.sort((a, b) => textOf(b).length - textOf(a).length)[0] ??
    doc.body;

  // The page title isn't repeated in the body
  const h1 = root.querySelector("h1");
  if (h1 && textOf(h1) === title) h1.remove();

  // The editor's headings start at h2; other h1s become section headings
  for (const extra of root.querySelectorAll("h1")) {
    const h2 = doc.createElement("h2");
    h2.innerHTML = extra.innerHTML;
    extra.replaceWith(h2);
  }

  const images: string[] = [];
  for (const img of root.querySelectorAll("img")) {
    const src = bestImage(img, base);
    const w = Number(img.getAttribute("width") || 0);
    const h = Number(img.getAttribute("height") || 0);
    // Icons, spacers and tracking pixels aren't content
    if (!src || (w && w < 48) || (h && h < 48) || /\.svg(\?|$)/i.test(src)) {
      img.remove();
      continue;
    }
    img.setAttribute("src", src);
    img.removeAttribute("srcset");
    images.push(src);
  }
  // Links inside the content point at their full address for now
  for (const a of root.querySelectorAll("a[href]")) {
    try {
      a.setAttribute(
        "href",
        new URL(a.getAttribute("href") ?? "", base).toString(),
      );
    } catch {
      a.removeAttribute("href");
    }
  }

  const result: ExtractedPage = {
    url,
    title,
    description: meta("description") || meta("og:description"),
    html: root.innerHTML,
    images: [...new Set(images)],
    date: validDate,
    isPost,
    links: [...links],
    nav,
    logo,
    themeColor: /^#[0-9a-f]{6}$/i.test(meta("theme-color"))
      ? meta("theme-color").toLowerCase()
      : null,
    siteName,
  };
  window.close();
  return result;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Page addresses listed in a sitemap (or the sitemaps a sitemap index lists). */
export function sitemapUrls(xml: string) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) =>
    m[1].replace(/&amp;/g, "&"),
  );
}
