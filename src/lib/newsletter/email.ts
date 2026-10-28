import { isValidVideo, type VideoProvider, videoPageUrl } from "../video-embed";

// Turns a post into an email: HTML that mail apps render (no iframes or
// forms, absolute links, inline styles) and a plain-text part. Pure.

export const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const FORM = /<div data-form="\d+"[^>]*><\/div>/g;
const VIDEO =
  /<figure[^>]*data-video="([a-z]+)"[^>]*data-id="([^"]+)"[^>]*>[\s\S]*?<\/figure>/g;

// Mail apps ignore stylesheets, so the few rules that matter go inline
const INLINE: [RegExp, string][] = [
  [/<img /g, '<img style="max-width:100%;height:auto;border-radius:6px" '],
  [/<a /g, '<a style="color:#2563eb" '],
  [
    /<blockquote>/g,
    '<blockquote style="margin:16px 0;padding-left:16px;border-left:3px solid #d4d4d8;color:#52525b">',
  ],
  [
    /<pre>/g,
    '<pre style="padding:12px;background:#f4f4f5;border-radius:6px;overflow:auto;font-size:13px">',
  ],
  [/<h2>/g, '<h2 style="font-size:20px;margin:28px 0 8px">'],
  [/<h3>/g, '<h3 style="font-size:17px;margin:24px 0 8px">'],
];

/** Post HTML made safe and readable in mail apps. */
export function emailBodyHtml(
  html: string,
  o: { postUrl: string; absolute: (path: string) => string },
) {
  let out = html
    .replace(
      FORM,
      `<p><a href="${escapeHtml(o.postUrl)}">Fill in the form on the site.</a></p>`,
    )
    .replace(VIDEO, (_m, provider: string, id: string) => {
      if (!isValidVideo(provider, id)) return "";
      const url = videoPageUrl(provider as VideoProvider, id);
      // YouTube serves a still for every video; Vimeo needs an API call
      const still =
        provider === "youtube"
          ? `<img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="Watch the video" width="560"><br>`
          : "";
      return `<p><a href="${escapeHtml(url)}">${still}Watch the video</a></p>`;
    })
    .replace(/<iframe[\s\S]*?<\/iframe>/g, "")
    .replace(/(src|href)="\/(?!\/)([^"]*)"/g, (_m, attr, path) => {
      return `${attr}="${escapeHtml(o.absolute(`/${path}`))}"`;
    });
  for (const [pattern, replacement] of INLINE)
    out = out.replace(pattern, replacement);
  return out;
}

export type NewsletterParts = {
  siteTitle: string;
  siteUrl: string;
  title: string;
  postUrl: string;
  /** From emailBodyHtml. */
  bodyHtml: string;
  /** The body as plain text or Markdown. */
  bodyText: string;
  preheader: string;
  /** Who sends it and a postal address, as the site owner wrote it. */
  footer: string;
  unsubscribeUrl: string;
  /** Set when the reader only gets a teaser of a members-only post. */
  teaser?: boolean;
};

export function renderNewsletter(p: NewsletterParts) {
  const more = p.teaser
    ? `<p style="margin:24px 0"><a href="${escapeHtml(p.postUrl)}" style="display:inline-block;padding:10px 18px;background:#18181b;color:#fff;border-radius:6px;text-decoration:none">Read the rest as a member</a></p>`
    : `<p style="margin:24px 0;font-size:14px"><a href="${escapeHtml(p.postUrl)}" style="color:#2563eb">Read it on the site</a></p>`;
  const footer = p.footer
    .split("\n")
    .map((line) => escapeHtml(line))
    .join("<br>");
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(p.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(p.preheader)}</div>
<div style="max-width:600px;margin:0 auto;padding:32px 24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#18181b">
<p style="margin:0 0 24px;font-size:14px;color:#71717a"><a href="${escapeHtml(p.siteUrl)}" style="color:#71717a;text-decoration:none">${escapeHtml(p.siteTitle)}</a></p>
<h1 style="font-size:26px;line-height:1.25;margin:0 0 20px"><a href="${escapeHtml(p.postUrl)}" style="color:#18181b;text-decoration:none">${escapeHtml(p.title)}</a></h1>
${p.bodyHtml}
${more}
<hr style="border:0;border-top:1px solid #e4e4e7;margin:32px 0 16px">
<p style="font-size:12px;color:#71717a;margin:0">${footer ? `${footer}<br><br>` : ""}You're getting this because you subscribed to ${escapeHtml(p.siteTitle)}. <a href="${escapeHtml(p.unsubscribeUrl)}" style="color:#71717a">Unsubscribe</a></p>
</div>
</body>
</html>`;
  const text = [
    p.title,
    "",
    p.bodyText,
    "",
    p.teaser
      ? `Read the rest as a member: ${p.postUrl}`
      : `Read it on the site: ${p.postUrl}`,
    "",
    "--",
    ...(p.footer ? [p.footer, ""] : []),
    `You're getting this because you subscribed to ${p.siteTitle}.`,
    `Unsubscribe: ${p.unsubscribeUrl}`,
  ].join("\n");
  return { html, text };
}

/** "Name <a@b.c>"-safe check, also used before storing an address. */
export function normalizeEmail(input: string) {
  const email = input.trim().toLowerCase();
  return /^[^\s@<>",]+@[^\s@<>",]+\.[^\s@<>",]+$/.test(email) &&
    email.length <= 254
    ? email
    : null;
}

/** Subscribers from a CSV or a pasted list: one address per line, optional name. */
export function parseSubscriberList(input: string) {
  const seen = new Set<string>();
  const valid: { email: string; name: string }[] = [];
  const invalid: string[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line
      .split(/[,;\t]/)
      .map((c) => c.trim().replace(/^"|"$/g, ""));
    const emailCell = cells.find((c) => c.includes("@"));
    // A header row ("email,name") has no address in it
    if (!emailCell) {
      if (valid.length || invalid.length) invalid.push(line);
      continue;
    }
    const email = normalizeEmail(emailCell);
    if (!email) {
      invalid.push(line);
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    const name = cells.find((c) => c && c !== emailCell) ?? "";
    valid.push({ email, name: name.slice(0, 200) });
  }
  return { valid, invalid };
}
