"use server";

import { refresh, updateTag } from "next/cache";
import { headers } from "next/headers";
import { COMMENTS_TAG, CommentError, submitComment } from "@/lib/comments";
import { type FormState, formError, optionalId, str } from "@/lib/form";
import { submitForm } from "@/lib/forms";
import { clientIp } from "@/lib/rate-limit";
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

export type FormSubmitState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** What was sent, so the form can be refilled after an error. */
  values?: Record<string, string[]>;
  /** Changes on every attempt, to remount the form with the values above. */
  attempt: number;
} | null;

export async function submitFormAction(
  prev: FormSubmitState,
  formData: FormData,
): Promise<FormSubmitState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  // Bots fill in every field; people never see this one
  if (str(formData, "_hp")) return { ok: true, message: "Thanks!", attempt };

  const values: Record<string, string[]> = {};
  for (const [key, value] of formData) {
    if (key.startsWith("_") || key.startsWith("$") || typeof value !== "string")
      continue;
    values[key] = [...(values[key] ?? []), value];
  }
  try {
    const h = await headers();
    const result = await submitForm(
      optionalId(formData, "_form_id") ?? 0,
      (key) => values[key] ?? [],
      {
        ip: clientIp(h) === "unknown" ? null : clientIp(h),
        userAgent: h.get("user-agent"),
        source: "web",
        postId: optionalId(formData, "_post_id"),
      },
    );
    if (result.ok) return { ok: true, message: result.message, attempt };
    return {
      error: result.error,
      fieldErrors: result.fieldErrors,
      values,
      attempt,
    };
  } catch (error) {
    return { ...formError(error), values, attempt };
  }
}
