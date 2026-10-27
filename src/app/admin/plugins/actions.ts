"use server";

import { refresh, updateTag } from "next/cache";
import { type FormState, formError, str } from "@/lib/form";
import { getSettings, SETTINGS_TAG, saveSettings } from "@/lib/options";
import { getPlugin, savePluginSettings } from "@/lib/plugins";
import type { PluginSettings } from "@/lib/plugins/types";
import { POSTS_TAG } from "@/lib/posts";
import { assertCap } from "@/lib/session";

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

    const values: PluginSettings = {};
    for (const field of plugin.settings ?? []) {
      const raw = str(formData, field.key);
      switch (field.type) {
        case "checkbox":
          values[field.key] = formData.get(field.key) === "on";
          break;
        case "number": {
          const n = Number(raw);
          if (!Number.isFinite(n))
            throw new Error(`${field.label} must be a number.`);
          if (field.min !== undefined && n < field.min)
            throw new Error(`${field.label} must be at least ${field.min}.`);
          if (field.max !== undefined && n > field.max)
            throw new Error(`${field.label} must be at most ${field.max}.`);
          values[field.key] = n;
          break;
        }
        case "url":
          if (raw && !/^https?:\/\//i.test(raw))
            throw new Error(`${field.label} must be a web address.`);
          values[field.key] = raw.trim();
          break;
        case "select":
          if (!field.options.some((o) => o.value === raw))
            throw new Error(`Choose a valid ${field.label.toLowerCase()}.`);
          values[field.key] = raw;
          break;
        default:
          values[field.key] = raw;
      }
    }
    await savePluginSettings(plugin.slug, values);
    updateTag(SETTINGS_TAG);
    updateTag(POSTS_TAG);
    return { message: "Settings saved." };
  } catch (error) {
    return formError(error);
  }
}
