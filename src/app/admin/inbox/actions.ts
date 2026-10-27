"use server";

import { refresh, updateTag } from "next/cache";
import { type FormState, formError, optionalId } from "@/lib/form";
import { FORMS_TAG } from "@/lib/forms";
import { applySuggestion, dismissSuggestion, runSiteChecks } from "@/lib/inbox";
import { POSTS_TAG } from "@/lib/posts";
import { assertCap } from "@/lib/session";
import { TERMS_TAG } from "@/lib/terms";

const CAP = "edit_others_posts";

export async function applySuggestionAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const viewer = await assertCap(CAP);
    await applySuggestion(optionalId(formData, "id") ?? 0, viewer);
  } catch (error) {
    return formError(error);
  }
  for (const tag of [POSTS_TAG, TERMS_TAG, FORMS_TAG]) updateTag(tag);
  refresh();
  return { message: "Done." };
}

export async function dismissSuggestionAction(formData: FormData) {
  const viewer = await assertCap(CAP);
  await dismissSuggestion(optionalId(formData, "id") ?? 0, viewer);
  refresh();
}

export async function runChecksAction(
  _: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await assertCap(CAP);
    const { found } = await runSiteChecks();
    refresh();
    return {
      message: found
        ? `Found ${found} new thing${found === 1 ? "" : "s"} to look at.`
        : "All checks passed; nothing new.",
    };
  } catch (error) {
    return formError(error);
  }
}
