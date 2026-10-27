"use server";

import { refresh } from "next/cache";
import { createAppPassword, revokeAppPassword } from "@/lib/app-passwords";
import { formError, str } from "@/lib/form";
import { getViewer, PermissionError } from "@/lib/session";

export type NewAppPasswordState = {
  error?: string;
  secret?: string;
  name?: string;
} | null;

export async function createAppPasswordAction(
  _: NewAppPasswordState,
  formData: FormData,
): Promise<NewAppPasswordState> {
  try {
    const viewer = await getViewer();
    if (!viewer) throw new PermissionError();
    const created = await createAppPassword(viewer.id, str(formData, "name"));
    refresh();
    return { secret: created.secret, name: created.name };
  } catch (error) {
    return { error: formError(error)?.error };
  }
}

export async function revokeAppPasswordAction(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) throw new PermissionError();
  await revokeAppPassword(viewer.id, str(formData, "id"));
  refresh();
}
