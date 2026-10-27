import { makeExcerpt } from "@/lib/content";
import { getSettings } from "@/lib/options";
import { postPath } from "@/lib/permalinks";
import { applyFilters } from "@/lib/plugins";
import { listPublished } from "@/lib/posts";
import { siteUrl } from "@/lib/site-url";

const escapeXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Feed readers can't resolve site-relative links in content
const absolutize = (html: string) =>
  html.replace(
    /(src|href)="\/(?!\/)/g,
    (_m, attr) => `${attr}="${siteUrl("/")}`,
  );

const cdata = (s: string) =>
  `<![CDATA[${s.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;

export async function GET() {
  const settings = await getSettings();
  const { items } = await listPublished({ perPage: 20 });

  const bodies = await Promise.all(
    items.map((post) =>
      applyFilters("post.contentHtml", post.contentHtml, { post }),
    ),
  );
  const entries = items
    .map((post, i) => {
      const link = siteUrl(postPath(post, settings.permalinkStructure));
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(siteUrl(`/?p=${post.id}`))}</guid>
      <pubDate>${post.publishedAt?.toUTCString() ?? ""}</pubDate>
      ${post.authorName ? `<dc:creator>${cdata(post.authorName)}</dc:creator>` : ""}
      ${post.terms.map((t) => `<category>${cdata(t.name)}</category>`).join("")}
      <description>${cdata(post.excerpt || makeExcerpt(post.contentText))}</description>
      <content:encoded>${cdata(absolutize(bodies[i]))}</content:encoded>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(settings.title)}</title>
    <link>${escapeXml(siteUrl())}</link>
    <atom:link href="${escapeXml(siteUrl("/feed"))}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(settings.tagline)}</description>
    <language>en</language>
${entries}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
