"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { type FormState, formError, optionalId, str } from "@/lib/form";
import { getSettings } from "@/lib/options";
import { POSTS_TAG } from "@/lib/posts";
import { assertCap } from "@/lib/session";
import {
  createTerm,
  deleteTerm,
  getTerm,
  isTaxonomy,
  TERMS_TAG,
  updateTerm,
} from "@/lib/terms";

function invalidate() {
  updateTag(TERMS_TAG);
  updateTag(POSTS_TAG);
}

function input(formData: FormData) {
  return {
    name: str(formData, "name"),
    slug: str(formData, "slug"),
    description: str(formData, "description"),
    parentId: optionalId(formData, "parent_id"),
  };
}

export async function createTermAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap("manage_categories");
    const taxonomy = str(formData, "taxonomy");
    if (!isTaxonomy(taxonomy)) throw new Error("Unknown taxonomy.");
    const term = await createTerm(taxonomy, input(formData));
    invalidate();
    return { message: `“${term.name}” added.` };
  } catch (error) {
    return formError(error);
  }
}

export async function updateTermAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap("manage_categories");
    await updateTerm(Number(formData.get("id")), input(formData));
    invalidate();
    return { message: "Item updated." };
  } catch (error) {
    return formError(error);
  }
}

export async function deleteTermAction(formData: FormData) {
  await assertCap("manage_categories");
  const term = await getTerm(Number(formData.get("id")));
  if (!term) redirect("/admin/categories");
  const settings = await getSettings();
  const back =
    term.taxonomy === "post_tag" ? "/admin/tags" : "/admin/categories";
  try {
    await deleteTerm(term.id, settings.defaultCategory);
  } catch {
    redirect(`${back}?error=default`);
  }
  invalidate();
  redirect(`${back}?deleted=1`);
}
