"use server";

import { refresh, updateTag } from "next/cache";
import { type FormState, formError, str } from "@/lib/form";
import { getSettings, SETTINGS_TAG, saveSettings } from "@/lib/options";
import { getPlugin, savePluginSettings } from "@/lib/plugins";
import { POSTS_TAG } from "@/lib/posts";
import { assertCap } from "@/lib/session";
import { parseSettingFields } from "@/lib/setting-fields";

async function setActive(slug: string, active: boolean) {
  await assertCap("manage_options");
  if (!getPlugin(slug)) throw new Error("That plugin isn't installed.");
  const current = (await getSettings()).activePlugins;
  const next = active
    ? [...new Set([...current, slug])]
    : current.filter((s) => s !== slug);
  await saveSettings({ activePlugins: next });
  // Plugins can change rendered content, so cached pages must refresh too
  updateTag(SETTINGS_TAG);
  updateTag(POSTS_TAG);
  refresh();
}

export async function activatePluginAction(formData: FormData) {
  await setActive(str(formData, "slug"), true);
}

export async function deactivatePluginAction(formData: FormData) {
  await setActive(str(formData, "slug"), false);
}

export async function savePluginSettingsAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap("manage_options");
    const plugin = getPlugin(str(formData, "slug"));
    if (!plugin) throw new Error("That plugin isn't installed.");

    const values = parseSettingFields(plugin.settings ?? [], formData);
    await savePluginSettings(plugin.slug, values);
    updateTag(SETTINGS_TAG);
    updateTag(POSTS_TAG);
    return { message: "Settings saved." };
  } catch (error) {
    return formError(error);
  }
}
