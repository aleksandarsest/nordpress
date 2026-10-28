import "server-only";
import { aiConfigured } from "@/lib/ai/client";
import { type Actor, canOnPost, hasCap } from "@/lib/capabilities";
import { formatInZone } from "@/lib/dates";
import { listForms } from "@/lib/forms";
import { getMedia, mediaUrl } from "@/lib/media";
import { newsletterForPost, subscriberCounts } from "@/lib/newsletter";
import { getSettings } from "@/lib/options";
import { postPath } from "@/lib/permalinks";
import { getPageTree, listParentCandidates, type PostType } from "@/lib/posts";
import { seoOf } from "@/lib/seo";
import { listTerms } from "@/lib/terms";
import { getTranslations } from "@/lib/translations";
import type { EditorOptions } from "./post-editor";
import type { EditorSeo } from "./seo-card";

export async function editorOptions(
  actor: Actor,
  post: {
    id?: number;
    type: PostType;
    status: string;
    slug: string;
    authorId: string | null;
    publishedAt: Date | null;
    parentId: number | null;
    meta?: unknown;
  },
): Promise<EditorOptions> {
  const [settings, categories, parents, tree, forms, translations, sent] =
    await Promise.all([
      getSettings(),
      post.type === "post" ? listTerms("category") : [],
      post.type === "page" ? listParentCandidates("page", post.id) : [],
      post.type === "page" ? getPageTree() : [],
      listForms(),
      post.id ? getTranslations({ id: post.id, meta: post.meta ?? {} }) : [],
      post.id && post.type === "post" ? newsletterForPost(post.id) : null,
    ]);
  const newsletter =
    settings.newsletterEnabled &&
    post.type === "post" &&
    hasCap(actor, "edit_others_posts")
      ? {
          subscribers: (await subscriberCounts()).active,
          sent:
            sent && sent.status !== "cancelled"
              ? {
                  status: sent.status,
                  subject: sent.subject,
                  delivered: sent.sent,
                  at: formatInZone(
                    sent.finishedAt ?? sent.sendAt,
                    settings.timezone,
                    `${settings.dateFormat} HH:mm`,
                  ),
                }
              : null,
        }
      : null;

  const parentPath = post.parentId
    ? tree.find((p) => p.id === post.parentId)?.path
    : undefined;
  const sample = {
    id: post.id ?? 0,
    type: post.type,
    slug: "",
    publishedAt: post.publishedAt,
    // Translations live under their language, e.g. /de/
    meta: post.meta,
  };
  // Everything before the slug, e.g. "/2026/10/" for dated permalinks
  const marker = "\u0000slug";
  const base =
    post.type === "page"
      ? `/${parentPath ? `${parentPath}/` : ""}`
      : postPath(
          { ...sample, slug: marker },
          settings.permalinkStructure,
        ).split(marker)[0];
  const ownPath = tree.find((p) => p.id === post.id)?.path;
  const live = post.status === "publish";

  return {
    canPublish: canOnPost(actor, "publish", {
      type: post.type,
      status: "draft",
      authorId: post.authorId ?? actor.id,
    }),
    canSticky: hasCap(actor, "edit_others_posts"),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
    })),
    parents,
    forms: forms.map((f) => ({ id: f.id, title: f.title })),
    permalinkBase: base,
    ai: settings.aiEnabled && aiConfigured(),
    defaultLanguage: settings.defaultLanguage,
    languages: settings.languages,
    translations,
    newsletter,
    viewUrl:
      live && post.id
        ? postPath(
            { ...sample, slug: post.slug },
            settings.permalinkStructure,
            ownPath,
          )
        : null,
  };
}

export async function featuredUrl(id: number | null) {
  if (!id) return null;
  const item = await getMedia(id);
  return item ? mediaUrl(item.path) : null;
}

export async function editorSeo(meta: unknown): Promise<EditorSeo> {
  const seo = seoOf(meta);
  return {
    title: seo.title ?? "",
    description: seo.description ?? "",
    imageId: seo.imageId ?? null,
    imageUrl: await featuredUrl(seo.imageId ?? null),
    noindex: seo.noindex ?? false,
  };
}
