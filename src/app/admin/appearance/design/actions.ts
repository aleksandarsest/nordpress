"use server";

import { updateTag } from "next/cache";
import { AiError } from "@/lib/ai/client";
import { designFromDescription } from "@/lib/ai/design";
import { designSchema, type SiteDesign } from "@/lib/design";
import { getSettings, SETTINGS_TAG, saveSettings } from "@/lib/options";
import { assertCap, PermissionError } from "@/lib/session";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function saveDesignAction(
  input: unknown,
  switchTheme: boolean,
): Promise<Result<null>> {
  try {
    await assertCap("manage_options");
    const design = designSchema.parse(input);
    await saveSettings({ design, ...(switchTheme && { theme: "studio" }) });
    updateTag(SETTINGS_TAG);
    return { ok: true, data: null };
  } catch (error) {
    if (error instanceof PermissionError)
      return { ok: false, error: error.message };
    return {
      ok: false,
      error: "That design couldn't be saved. Please try again.",
    };
  }
}

export async function describeDesignAction(
  description: string,
  current: SiteDesign,
): Promise<Result<SiteDesign>> {
  try {
    const viewer = await assertCap("manage_options");
    const base = designSchema.safeParse(current);
    const settings = await getSettings();
    return {
      ok: true,
      data: await designFromDescription(
        String(description),
        base.success ? base.data : settings.design,
        viewer.id,
      ),
    };
  } catch (error) {
    if (error instanceof AiError || error instanceof PermissionError)
      return { ok: false, error: error.message };
    console.error("[design]", error);
    return { ok: false, error: "Something went wrong with the AI request." };
  }
}
