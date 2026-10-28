"use server";

import { refresh } from "next/cache";
import { type FormState, formError, optionalId, str } from "@/lib/form";
import {
  clearNotFound,
  deleteRedirects,
  importRedirects,
  parseRedirectCsv,
  saveRedirect,
} from "@/lib/redirects";
import { assertCap } from "@/lib/session";

const CAP = "manage_options";

export async function saveRedirectAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap(CAP);
    const row = await saveRedirect({
      id: optionalId(formData, "id") ?? undefined,
      source: str(formData, "source"),
      target: str(formData, "target"),
      status: str(formData, "status"),
    });
    refresh();
    return { message: `${row.source} now redirects to ${row.target}.` };
  } catch (error) {
    return formError(error);
  }
}

export async function deleteRedirectAction(formData: FormData) {
  await assertCap(CAP);
  const id = optionalId(formData, "id");
  if (id) await deleteRedirects([id]);
  refresh();
}

export async function importRedirectsAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap(CAP);
    const file = formData.get("file");
    const text =
      file instanceof File && file.size > 0
        ? await file.text()
        : str(formData, "list");
    const { rows, invalid } = parseRedirectCsv(text);
    if (rows.length === 0)
      throw new Error(
        "No redirects found. Put one per line: old address, new address.",
      );
    const { added, skipped } = await importRedirects(rows);
    refresh();
    const problems = [...invalid, ...skipped];
    return {
      message: [
        `Added ${added} redirect${added === 1 ? "" : "s"}.`,
        problems.length
          ? `Skipped ${problems.length}: ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? "…" : ""}`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  } catch (error) {
    return formError(error);
  }
}

export async function dismissNotFoundAction(formData: FormData) {
  await assertCap(CAP);
  await clearNotFound(str(formData, "path") || undefined);
  refresh();
}
