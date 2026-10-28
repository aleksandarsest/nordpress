"use server";

import { refresh, updateTag } from "next/cache";
import { suggestNewsletterSubjects } from "@/lib/ai/newsletter";
import { type FormState, formError, optionalId, str } from "@/lib/form";
import {
  type Audience,
  cancelNewsletter,
  deleteSubscribers,
  importSubscribers,
  parseSubscriberList,
  queueNewsletter,
  sendTestNewsletter,
} from "@/lib/newsletter";
import { SETTINGS_TAG, saveSettings } from "@/lib/options";
import { getPostForEdit } from "@/lib/posts";
import { assertCap } from "@/lib/session";

const CAP = "edit_others_posts";

export async function saveNewsletterSettingsAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap("manage_options");
    await saveSettings({
      newsletterEnabled: formData.get("newsletterEnabled") === "on",
      newsletterAutoSend: formData.get("newsletterAutoSend") === "on",
      newsletterSignupAfterPosts:
        formData.get("newsletterSignupAfterPosts") === "on",
      newsletterFooter: str(formData, "newsletterFooter").trim().slice(0, 1000),
    });
  } catch (error) {
    return formError(error);
  }
  updateTag(SETTINGS_TAG);
  return { message: "Settings saved." };
}

export async function importSubscribersAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap(CAP);
    if (formData.get("consent") !== "on")
      throw new Error(
        "Confirm that these people agreed to get your newsletter.",
      );
    const file = formData.get("file");
    const text =
      file instanceof File && file.size > 0
        ? await file.text()
        : str(formData, "list");
    const { valid, invalid } = parseSubscriberList(text);
    if (valid.length === 0)
      throw new Error("No email addresses found. Put one on each line.");
    const { added, skipped } = await importSubscribers(valid);
    refresh();
    return {
      message: [
        `Added ${added} subscriber${added === 1 ? "" : "s"}.`,
        skipped ? `${skipped} already on the list.` : "",
        invalid.length
          ? `Skipped ${invalid.length} line${invalid.length === 1 ? "" : "s"} without a valid address: ${invalid.slice(0, 3).join("; ")}${invalid.length > 3 ? "…" : ""}`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  } catch (error) {
    return formError(error);
  }
}

export async function deleteSubscriberAction(formData: FormData) {
  await assertCap(CAP);
  const id = optionalId(formData, "id");
  if (id) await deleteSubscribers([id]);
  refresh();
}

export async function cancelNewsletterAction(formData: FormData) {
  await assertCap(CAP);
  const id = optionalId(formData, "id");
  if (id) await cancelNewsletter(id).catch(() => {});
  refresh();
}

// From the post editor's Newsletter card, which sits inside the editor's own
// form, so these are called directly rather than submitted
type Result = { message?: string; error?: string };

export async function emailPostAction(input: {
  postId: number;
  subject: string;
  preheader: string;
  audience: Audience;
  test: boolean;
}): Promise<Result> {
  try {
    const viewer = await assertCap(CAP);
    if (input.test) {
      const { delivered } = await sendTestNewsletter({
        ...input,
        to: viewer.email,
      });
      return {
        message: delivered
          ? `Sent a test to ${viewer.email}.`
          : "Email isn't set up (SMTP_URL), so the test went to the server log.",
      };
    }
    const row = await queueNewsletter({ ...input, actorId: viewer.id });
    refresh();
    return {
      message:
        row.sendAt > new Date()
          ? "Scheduled: it goes out by email when the post is published."
          : "Sending now. Progress shows under Newsletter.",
    };
  } catch (error) {
    return { error: formError(error)?.error };
  }
}

export async function suggestSubjectsAction(
  postId: number,
): Promise<{ subjects?: string[]; preheader?: string; error?: string }> {
  try {
    const viewer = await assertCap(CAP);
    const found = await getPostForEdit(postId);
    if (!found) throw new Error("This post no longer exists.");
    const { post } = found;
    return await suggestNewsletterSubjects(
      { title: post.title, excerpt: post.excerpt, text: post.contentText },
      viewer.id,
    );
  } catch (error) {
    return { error: formError(error)?.error };
  }
}
