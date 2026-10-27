// Languages for translated content. A translation is a post whose meta has
// `lang` (its language) and `translationOf` (the original's id); originals
// are in the site's default language and have neither. Pure.

const CODE = /^[a-z]{2,3}(-[a-z]{2,4})?$/;

export function normalizeLanguageCode(input: string) {
  const code = input.trim().toLowerCase().replace("_", "-");
  return CODE.test(code) ? code : null;
}

/** The language of a translation, or null for default-language content. */
export function translationLang(meta: unknown): string | null {
  const lang = (meta as { lang?: unknown } | null)?.lang;
  return typeof lang === "string" && lang ? lang : null;
}

/** The id that ties a post and its translations together. */
export function translationGroup(post: { id: number; meta: unknown }) {
  const of = (post.meta as { translationOf?: unknown } | null)?.translationOf;
  return typeof of === "number" ? of : post.id;
}

/** "de" → "Deutsch" (each language in its own name, for switchers). */
export function languageName(code: string, inLocale = code) {
  try {
    const name = new Intl.DisplayNames([inLocale], { type: "language" }).of(
      code,
    );
    return name ? name[0].toUpperCase() + name.slice(1) : code;
  } catch {
    return code;
  }
}
