"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  COMMENTS_TAG,
  getComment,
  MODERATION_ACTIONS,
  type ModerationAction,
  moderateComment,
  submitComment,
  updateComment,
} from "@/lib/comments";
import { type FormState, formError, str } from "@/lib/form";
import { assertCap } from "@/lib/session";

function backTo(formData: FormData) {
  const target = str(formData, "back");
  return target.startsWith("/admin/comments") ? target : "/admin/comments";
}

export async function moderateCommentAction(formData: FormData) {
  await assertCap("moderate_comments");
  const action = str(formData, "do") as ModerationAction;
  if (!MODERATION_ACTIONS.includes(action)) throw new Error("Unknown action.");
  await moderateComment(Number(formData.get("id")), action);
  updateTag(COMMENTS_TAG);
  redirect(backTo(formData));
}

export async function bulkModerateAction(formData: FormData) {
  await assertCap("moderate_comments");
  const action = str(formData, "do") as ModerationAction;
  if (!MODERATION_ACTIONS.includes(action)) throw new Error("Unknown action.");
  for (const id of formData
    .getAll("ids")
    .map(Number)
    .filter(Number.isInteger)) {
    await moderateComment(id, action);
  }
  updateTag(COMMENTS_TAG);
  redirect(backTo(formData));
}

export async function updateCommentAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap("moderate_comments");
    await updateComment(Number(formData.get("id")), {
      content: str(formData, "content"),
      authorName: str(formData, "author_name"),
      authorEmail: str(formData, "author_email"),
      authorUrl: str(formData, "author_url"),
    });
    updateTag(COMMENTS_TAG);
    refresh();
    return { message: "Comment updated." };
  } catch (error) {
    return formError(error);
  }
}

export async function replyToCommentAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const viewer = await assertCap("moderate_comments");
    const parent = await getComment(Number(formData.get("id")));
    if (!parent) throw new Error("Comment not found.");
    // Replying to a held comment approves it, as in WordPress
    if (parent.status === "pending")
      await moderateComment(parent.id, "approve");
    await submitComment(
      {
        postId: parent.postId,
        parentId: parent.id,
        content: str(formData, "content"),
        authorName: "",
        authorEmail: "",
        authorUrl: "",
      },
      viewer,
      { ip: null, userAgent: null },
    );
    updateTag(COMMENTS_TAG);
    refresh();
    return { message: "Reply posted." };
  } catch (error) {
    return formError(error);
  }
}
