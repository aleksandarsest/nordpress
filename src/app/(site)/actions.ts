"use server";

import { refresh, updateTag } from "next/cache";
import { headers } from "next/headers";
import { COMMENTS_TAG, CommentError, submitComment } from "@/lib/comments";
import { type FormState, formError, optionalId, str } from "@/lib/form";
import { getViewer } from "@/lib/session";

export async function postComment(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  // Bots fill in every field; people never see this one
  if (str(formData, "hp_website"))
    return { message: "Thanks for your comment." };

  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null;
    const saved = await submitComment(
      {
        postId: optionalId(formData, "post_id") ?? 0,
        parentId: optionalId(formData, "parent_id"),
        content: str(formData, "comment"),
        authorName: str(formData, "author"),
        authorEmail: str(formData, "email"),
        authorUrl: str(formData, "url"),
      },
      await getViewer(),
      { ip, userAgent: h.get("user-agent") },
    );
    if (saved.status === "approved") {
      updateTag(COMMENTS_TAG);
      refresh();
      return { message: "Your comment has been posted." };
    }
    return { message: "Thanks! Your comment is awaiting moderation." };
  } catch (error) {
    if (error instanceof CommentError) return { error: error.message };
    return formError(error);
  }
}
