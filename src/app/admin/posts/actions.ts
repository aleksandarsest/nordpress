"use server";

import type { JSONContent } from "@tiptap/core";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { queueIndex } from "@/lib/ai/embeddings";
import { type FormState, formError, optionalId, str } from "@/lib/form";
import { getSettings } from "@/lib/options";
import {
  deletePostPermanently,
  isPostType,
  POSTS_TAG,
  restorePost,
  restoreRevision,
  type SaveIntent,
  savePost,
  trashPost,
} from "@/lib/posts";
import { createPreview } from "@/lib/previews";
import { getViewer, PermissionError } from "@/lib/session";
import { TERMS_TAG } from "@/lib/terms";

async function actor() {
  const viewer = await getViewer();
  if (!viewer)
    throw new PermissionError("Your session has expired. Please log in again.");
  return viewer;
}

function invalidate() {
  updateTag(POSTS_TAG);
  updateTag(TERMS_TAG);
}

function parseDoc(raw: string): JSONContent | null {
  if (!raw) return null;
  const doc = JSON.parse(raw);
  if (doc?.type !== "doc") throw new Error("The content could not be read.");
  return doc;
}

const INTENTS: SaveIntent[] = ["draft", "pending", "publish", "private"];

export async function savePostAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const type = str(formData, "type");
  const intent = str(formData, "intent") as SaveIntent;
  let id: number;
  let created = false;
  try {
    if (!isPostType(type)) throw new Error("Unknown content type.");
    if (!INTENTS.includes(intent)) throw new Error("Unknown action.");
    const date = str(formData, "published_at");
    const saved = await savePost(await actor(), {
      id: optionalId(formData, "id") ?? undefined,
      type,
      intent,
      title: str(formData, "title"),
      slug: str(formData, "slug"),
      content: parseDoc(str(formData, "content")),
      excerpt: str(formData, "excerpt"),
      publishedAt: date ? new Date(date) : null,
      parentId: optionalId(formData, "parent_id"),
      menuOrder: Number(str(formData, "menu_order")) || 0,
      featuredMediaId: optionalId(formData, "featured_media_id"),
      commentStatus:
        formData.get("comment_status") === "on" ? "open" : "closed",
      sticky: formData.get("sticky") === "on",
      categoryIds: formData
        .getAll("category")
        .map(Number)
        .filter(Number.isInteger),
      tags: str(formData, "tags").split(","),
      ...(formData.get("ai_assisted") === "1" && {
        aiSource: "writing-assistant" as const,
      }),
    });
    id = saved.id;
    created = !formData.get("id");
    invalidate();
    queueIndex(saved.id);

    if (!created) {
      refresh();
      const labels: Record<string, string> = {
        publish: "updated",
        future: "scheduled",
        private: "published privately",
        pending: "submitted for review",
        draft: "saved as a draft",
      };
      const label = labels[saved.status] ?? "updated";
      return { message: `${type === "page" ? "Page" : "Post"} ${label}.` };
    }
  } catch (error) {
    return formError(error);
  }
  redirect(`/admin/posts/${id}?created=1`);
}

export async function quickDraft(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const settings = await getSettings();
    const body = str(formData, "body").trim();
    await savePost(await actor(), {
      type: "post",
      intent: "draft",
      title: str(formData, "title"),
      content: {
        type: "doc",
        content: body
          .split(/\n{2,}/)
          .filter(Boolean)
          .map((p) => ({
            type: "paragraph",
            content: [{ type: "text", text: p }],
          })),
      },
      categoryIds: settings.defaultCategory ? [settings.defaultCategory] : [],
    });
    invalidate();
    return { message: "Draft saved." };
  } catch (error) {
    return formError(error);
  }
}

function backTo(formData: FormData, fallback: string) {
  const target = str(formData, "back");
  return target.startsWith("/admin") ? target : fallback;
}

export async function trashPostAction(formData: FormData) {
  const post = await trashPost(await actor(), Number(formData.get("id")));
  invalidate();
  queueIndex(post.id);
  redirect(
    backTo(formData, post.type === "page" ? "/admin/pages" : "/admin/posts"),
  );
}

export async function restorePostAction(formData: FormData) {
  const post = await restorePost(await actor(), Number(formData.get("id")));
  invalidate();
  queueIndex(post.id);
  redirect(
    backTo(formData, post.type === "page" ? "/admin/pages" : "/admin/posts"),
  );
}

export async function deletePostAction(formData: FormData) {
  const post = await deletePostPermanently(
    await actor(),
    Number(formData.get("id")),
  );
  invalidate();
  queueIndex(post.id);
  redirect(
    backTo(
      formData,
      post.type === "page"
        ? "/admin/pages?status=trash"
        : "/admin/posts?status=trash",
    ),
  );
}

export async function restoreRevisionAction(formData: FormData) {
  const post = await restoreRevision(
    await actor(),
    Number(formData.get("revision_id")),
  );
  invalidate();
  queueIndex(post.id);
  redirect(`/admin/posts/${post.id}?restored=1`);
}

export async function createPreviewAction(input: {
  postId: number | null;
  type: string;
  title: string;
  content: string;
  excerpt: string;
  featuredMediaId: number | null;
  categoryIds: number[];
  tags: string;
}): Promise<{ token?: string; error?: string }> {
  try {
    if (!isPostType(input.type)) throw new Error("Unknown content type.");
    const token = await createPreview(await actor(), {
      postId: input.postId,
      type: input.type,
      title: String(input.title),
      content: parseDoc(String(input.content)),
      excerpt: String(input.excerpt),
      featuredMediaId: input.featuredMediaId,
      categoryIds: input.categoryIds.filter(Number.isInteger),
      tags: String(input.tags)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
    return { token };
  } catch (error) {
    return { error: formError(error)?.error };
  }
}
