import "server-only";
import { eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { options } from "@/db/schema";
import { installedThemes } from "@/themes";
import { getSettings, SETTINGS_TAG } from "../options";
import type { ThemeDefinition, ThemeOptions } from "./types";

export function getTheme(slug: string): ThemeDefinition | null {
  return installedThemes.find((t) => t.slug === slug) ?? null;
}

// The active theme; falls back to the first installed one if the saved
// theme was removed from the codebase.
export async function activeTheme(): Promise<ThemeDefinition> {
  const { theme } = await getSettings();
  return getTheme(theme) ?? installedThemes[0];
}

export function listThemes() {
  return installedThemes;
}

const optionName = (slug: string) => `theme:${slug}`;

export async function getThemeOptions(slug: string): Promise<ThemeOptions> {
  "use cache";
  cacheTag(SETTINGS_TAG);
  cacheLife("max");

  const theme = getTheme(slug);
  const defaults = Object.fromEntries(
    (theme?.settings ?? []).flatMap((f) =>
      f.default === undefined ? [] : [[f.key, f.default]],
    ),
  ) as ThemeOptions;
  const [row] = await db
    .select()
    .from(options)
    .where(eq(options.name, optionName(slug)));
  return { ...defaults, ...((row?.value as ThemeOptions | undefined) ?? {}) };
}

export async function saveThemeOptions(slug: string, values: ThemeOptions) {
  await db
    .insert(options)
    .values({ name: optionName(slug), value: values })
    .onConflictDoUpdate({ target: options.name, set: { value: values } });
}
