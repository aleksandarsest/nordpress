import "server-only";
import { aiConfigured } from "@/lib/ai/client";
import { type Actor, canOnPost, hasCap } from "@/lib/capabilities";
import { listForms } from "@/lib/forms";
import { getMedia, mediaUrl } from "@/lib/media";
import { getSettings } from "@/lib/options";
import { postPath } from "@/lib/permalinks";
import { getPageTree, listParentCandidates, type PostType } from "@/lib/posts";
import { listTerms } from "@/lib/terms";
import type { EditorOptions } from "./post-editor";

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
  },
): Promise<EditorOptions> {
  const [settings, categories, parents, tree, forms] = await Promise.all([
    getSettings(),
    post.type === "post" ? listTerms("category") : [],
    post.type === "page" ? listParentCandidates("page", post.id) : [],
    post.type === "page" ? getPageTree() : [],
    listForms(),
  ]);

  const parentPath = post.parentId
    ? tree.find((p) => p.id === post.parentId)?.path
    : undefined;
  const sample = {
    id: post.id ?? 0,
    type: post.type,
    slug: "",
    publishedAt: post.publishedAt,
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
