// WordPress-style shortcodes ([gallery ids="1,2"], [box]text[/box]) expanded
// in rendered post HTML. Follows WordPress's get_shortcode_regex() and
// shortcode_parse_atts() so content imported from WordPress keeps working.
// Kept free of server-only imports so it can be unit tested.

export type ShortcodeAttrs = Record<string, string>;

export type ShortcodeHandler<C = unknown> = (
  attrs: ShortcodeAttrs,
  /** The HTML between [tag] and [/tag], or null for a self-closing shortcode. */
  content: string | null,
  context: C,
) => string | Promise<string>;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Same groups as WordPress: 1 extra [, 2 tag, 3 attributes, 4 self-closing /,
// 5 enclosed content, 6 extra ]. [[tag]] is an escaped, literal [tag].
function shortcodeRegex(tag: string) {
  const t = escapeRe(tag);
  return new RegExp(
    `\\[(\\[?)(${t})(?![\\w-])([^\\]\\/]*(?:\\/(?!\\])[^\\]\\/]*)*?)(?:(\\/)\\]|\\](?:([^\\[]*(?:\\[(?!\\/\\2\\])[^\\[]*)*)\\[\\/\\2\\])?)(\\]?)`,
    "g",
  );
}

// Attribute text arrives HTML-escaped from the editor, and WordPress content
// often has curly quotes and non-breaking spaces typed by its editor.
function decodeAttrText(text: string) {
  return text
    .replace(/&nbsp;|&#160;| /g, " ")
    .replace(/&quot;|&#34;|&#8220;|&#8221;|&#8243;|[“”″]/g, '"')
    .replace(/&#39;|&#039;|&apos;|&#8216;|&#8217;|&#8242;|[‘’′]/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function parseShortcodeAttrs(text: string): ShortcodeAttrs {
  const attrs: ShortcodeAttrs = {};
  const re =
    /([\w-]+)\s*=\s*"([^"]*)"(?:\s|$)|([\w-]+)\s*=\s*'([^']*)'(?:\s|$)|([\w-]+)\s*=\s*([^\s'"]+)(?:\s|$)|"([^"]*)"(?:\s|$)|'([^']*)'(?:\s|$)|(\S+)(?:\s|$)/g;
  let position = 0;
  for (const m of decodeAttrText(text).matchAll(re)) {
    if (m[1]) attrs[m[1].toLowerCase()] = m[2];
    else if (m[3]) attrs[m[3].toLowerCase()] = m[4];
    else if (m[5]) attrs[m[5].toLowerCase()] = m[6];
    // Values without a name are numbered, as in WordPress: [video "a.mp4"]
    else attrs[String(position++)] = m[7] ?? m[8] ?? m[9];
  }
  return attrs;
}

/** Escapes text for use in HTML a shortcode returns. */
export function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function expandShortcodes<C>(
  html: string,
  handlers: Record<string, ShortcodeHandler<C>>,
  context: C,
): Promise<string> {
  let out = html;
  for (const [tag, handler] of Object.entries(handlers)) {
    if (!out.includes(`[${tag}`)) continue;
    // A shortcode alone in a paragraph usually renders a block; drop the <p>
    // around it, as WordPress's shortcode_unautop() does.
    out = out.replace(
      new RegExp(
        `<p>\\s*(\\[\\/?${escapeRe(tag)}(?![\\w-])[^\\]]*\\])\\s*<\\/p>`,
        "g",
      ),
      "$1",
    );
    const parts: (string | Promise<string>)[] = [];
    let last = 0;
    for (const m of out.matchAll(shortcodeRegex(tag))) {
      parts.push(out.slice(last, m.index));
      last = m.index + m[0].length;
      if (m[1] === "[" && m[6] === "]") {
        parts.push(m[0].slice(1, -1));
        continue;
      }
      const content = m[5] ?? null;
      parts.push(
        Promise.resolve(
          handler(parseShortcodeAttrs(m[3]), content, context),
        ).then((result) => m[1] + (result ?? "") + m[6]),
      );
    }
    parts.push(out.slice(last));
    out = (await Promise.all(parts)).join("");
  }
  return out;
}
