// Finds embedded forms in rendered post HTML. Embeds only occur at the top
// level of a document (see FormEmbed), so splitting there keeps every piece
// well-formed.
const EMBED = /<div data-form="(\d+)"[^>]*><\/div>/g;

/** `at` is the offset in the HTML, a stable key for rendering. */
export type BodyPart = { at: number } & ({ html: string } | { formId: number });

export function splitFormEmbeds(html: string): BodyPart[] {
  const parts: BodyPart[] = [];
  let last = 0;
  for (const match of html.matchAll(EMBED)) {
    const before = html.slice(last, match.index);
    if (before.trim()) parts.push({ at: last, html: before });
    parts.push({ at: match.index, formId: Number(match[1]) });
    last = match.index + match[0].length;
  }
  const rest = html.slice(last);
  if (rest.trim()) parts.push({ at: last, html: rest });
  return parts;
}

// For feeds and other places that can't run a form.
export function replaceFormEmbeds(html: string, replacement: string) {
  return html.replace(EMBED, replacement);
}
