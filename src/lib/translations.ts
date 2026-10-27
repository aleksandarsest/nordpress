import "server-only";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { aiConfigured } from "./ai/client";
import { translatePost } from "./ai/translate";
import { htmlToDoc } from "./content";
import { translationGroup, translationLang } from "./i18n";
import { docToMarkdown, markdownToHtml } from "./markdown";
import { getSettings } from "./options";
import { postPath } from "./permalinks";
import {
  getPageTree,
  getPostForEdit,
  PostError,
  type PostType,
  savePost,
} from "./posts";
import type { Viewer } from "./session";
import { siteUrl } from "./site-url";

export type TranslationLink = {
  id: number;
  lang: string;
  title: string;
  status: string;
  /** The public path, once published. */
  path: string | null;
};

/** A post and all its translations, the original first. */
export async function getTranslations(post: { id: number; meta: unknown }) {
  const group = translationGroup(post);
  const [rows, settings, tree] = await Promise.all([
    db
      .select({
        id: posts.id,
        type: posts.type,
        slug: posts.slug,
        title: posts.title,
        status: posts.status,
        publishedAt: posts.publishedAt,
        meta: posts.meta,
      })
      .from(posts)
      .where(
        and(
          or(
            eq(posts.id, group),
            sql`(${posts.meta}->>'translationOf')::bigint = ${group}`,
          ),
          sql`${posts.status} <> 'trash'`,
        ),
      ),
    getSettings(),
    getPageTree(),
  ]);
  return rows
    .map(
      (r): TranslationLink => ({
        id: r.id,
        lang: translationLang(r.meta) ?? settings.defaultLanguage,
        title: r.title,
        status: r.status,
        path:
          r.status === "publish"
            ? postPath(
                r,
                settings.permalinkStructure,
                r.type === "page"
                  ? tree.find((p) => p.id === r.id)?.path
                  : undefined,
              )
            : null,
      }),
    )
    .sort((a, b) =>
      a.id === group ? -1 : b.id === group ? 1 : a.lang.localeCompare(b.lang),
    );
}

// Starts a translation as a draft: Claude translates it when AI is set up,
// otherwise it's a copy to translate by hand. A person reviews and publishes.
export async function createTranslation(
  actor: Viewer,
  postId: number,
  lang: string,
) {
  const settings = await getSettings();
  if (!settings.languages.includes(lang))
    throw new PostError("Add that language under Settings → General first.");
  const found = await getPostForEdit(postId);
  if (!found) throw new PostError("This item no longer exists.");
  const group = translationGroup(found.post);
  const original =
    group === found.post.id ? found : await getPostForEdit(group);
  if (!original)
    throw new PostError("The original of this translation is gone.");
  const existing = (await getTranslations(original.post)).find(
    (t) => t.lang === lang,
  );
  if (existing) return { id: existing.id, created: false };

  const source = original.post;
  const markdown = docToMarkdown(source.content, {
    absolute: (u) => u,
    formUrl: (id) => siteUrl(`/wp-json/nordpress/v1/forms/${id}`),
  });
  const ai = settings.aiEnabled && aiConfigured();
  const translated = ai
    ? await translatePost(
        {
          title: source.title,
          excerpt: source.excerpt,
          markdown,
          to: lang,
          from: settings.defaultLanguage,
        },
        actor.id,
      )
    : { title: source.title, excerpt: source.excerpt, content: markdown };

  const saved = await savePost(actor, {
    type: source.type as PostType,
    intent: "draft",
    title: translated.title,
    content: htmlToDoc(markdownToHtml(translated.content)),
    excerpt: translated.excerpt,
    commentStatus: source.commentStatus,
    categoryIds: original.categoryIds,
    tags: original.tags,
    featuredMediaId: source.featuredMediaId,
    membersOnly:
      (source.meta as { membersOnly?: boolean }).membersOnly === true,
    ...(ai && { aiSource: "translation" as const }),
  });
  await db
    .update(posts)
    .set({ meta: { ...saved.meta, lang, translationOf: source.id } })
    .where(eq(posts.id, saved.id));
  return { id: saved.id, created: true, translatedByAi: ai };
}
