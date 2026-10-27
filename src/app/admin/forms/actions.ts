"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { AiError } from "@/lib/ai/client";
import { draftForm, type FormDraft } from "@/lib/ai/forms";
import { type FormState, formError, optionalId, str } from "@/lib/form";
import {
  createForm,
  deleteForm,
  deleteSubmissions,
  FORMS_TAG,
  setSubmissionStatus,
  updateForm,
} from "@/lib/forms";
import type { FormField, FormSettings } from "@/lib/forms/fields";
import { assertCap } from "@/lib/session";

// Editors and administrators build forms and read responses.
const CAP = "edit_others_pages";

function invalidate() {
  updateTag(FORMS_TAG);
  refresh();
}

export async function createFormAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  let id: number;
  try {
    await assertCap(CAP);
    ({ id } = await createForm({ title: str(formData, "title") }));
  } catch (error) {
    return formError(error);
  }
  updateTag(FORMS_TAG);
  redirect(`/admin/forms/${id}`);
}

// Drafts a whole form from a description and opens it in the builder.
export async function createFormWithAiAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  let id: number;
  try {
    const viewer = await assertCap(CAP);
    const draft = await draftForm(str(formData, "description"), viewer.id);
    ({ id } = await createForm({
      title: draft.title,
      fields: draft.fields,
      settings: {
        submitLabel: draft.submitLabel,
        successMessage: draft.successMessage,
      },
    }));
  } catch (error) {
    return formError(error);
  }
  updateTag(FORMS_TAG);
  redirect(`/admin/forms/${id}`);
}

// For the builder: returns a draft without saving, so the editor can review it.
export async function draftFormAction(
  description: string,
): Promise<{ draft?: FormDraft; error?: string }> {
  try {
    const viewer = await assertCap(CAP);
    return { draft: await draftForm(description, viewer.id) };
  } catch (error) {
    if (error instanceof AiError) return { error: error.message };
    return { error: formError(error)?.error };
  }
}

export async function saveFormAction(
  id: number,
  input: { title: string; fields: FormField[]; settings: FormSettings },
): Promise<{ error?: string; message?: string; fields?: FormField[] }> {
  let fields: FormField[];
  try {
    await assertCap(CAP);
    ({ fields } = await updateForm(id, input));
  } catch (error) {
    return formError(error) ?? {};
  }
  invalidate();
  // Saved keys stay fixed from now on, even if a label changes
  return { message: "Form saved.", fields };
}

export async function deleteFormAction(formData: FormData) {
  await assertCap(CAP);
  const id = optionalId(formData, "form_id");
  if (id) await deleteForm(id);
  updateTag(FORMS_TAG);
  redirect("/admin/forms");
}

const ids = (formData: FormData) =>
  formData
    .getAll("ids")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

export async function markSubmissionsAction(formData: FormData) {
  await assertCap(CAP);
  const status = str(formData, "status");
  if (status !== "new" && status !== "read" && status !== "spam") return;
  await setSubmissionStatus(ids(formData), status);
  invalidate();
}

export async function deleteSubmissionsAction(formData: FormData) {
  await assertCap(CAP);
  await deleteSubmissions(ids(formData));
  invalidate();
}
