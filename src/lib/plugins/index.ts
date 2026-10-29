import "server-only";
import { eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import { options } from "@/db/schema";
import { installedPlugins } from "@/plugins";
import { getSettings, SETTINGS_TAG } from "../options";
import { HookRegistry, matchPath } from "./hook-registry";
import { expandShortcodes } from "./shortcodes";
import type {
  ActionHooks,
  ActionName,
  FilterHooks,
  FilterName,
  PluginApi,
  PluginDefinition,
  PluginRestRoute,
  PluginSettings,
} from "./types";

const hooks = new HookRegistry((plugin, hook, error) => {
  console.error(`[plugin:${plugin}] ${hook} failed:`, error);
});

let registered = false;

// Every installed plugin registers its hooks once per process; whether they
// run is decided per call from the active list, so (de)activation is instant.
function ensureRegistered() {
  if (registered) return;
  registered = true;
  for (const plugin of installedPlugins) {
    try {
      plugin.register(apiFor(plugin));
    } catch (error) {
      console.error(`[plugin:${plugin.slug}] failed to register:`, error);
    }
  }
}

function apiFor(plugin: PluginDefinition): PluginApi {
  return {
    addAction: (name, fn, priority) =>
      hooks.add("action", name, plugin.slug, fn as never, priority),
    addFilter: (name, fn, priority) =>
      hooks.add("filter", name, plugin.slug, fn as never, priority),
    // Priority 11, after other content filters, as WordPress runs do_shortcode
    addShortcode: (tag, fn) =>
      hooks.add(
        "filter",
        "post.contentHtml",
        plugin.slug,
        ((html: string, context: Parameters<typeof fn>[2]) =>
          expandShortcodes(html, { [tag]: fn }, context)) as never,
        11,
      ),
    settings: () => getPluginSettings(plugin.slug),
    defer: (fn) =>
      after(async () => {
        try {
          await fn();
        } catch (error) {
          console.error(`[plugin:${plugin.slug}] deferred task failed:`, error);
        }
      }),
    log: (...args) => console.log(`[plugin:${plugin.slug}]`, ...args),
  };
}

async function activeSet() {
  const installed = new Set(installedPlugins.map((p) => p.slug));
  return new Set(
    (await getSettings()).activePlugins.filter((s) => installed.has(s)),
  );
}

export async function doAction<N extends ActionName>(
  name: N,
  ...args: ActionHooks[N]
) {
  ensureRegistered();
  if (!hooks.has("action", name)) return;
  const active = await activeSet();
  await hooks.doAction(name, args, (p) => active.has(p));
}

export async function applyFilters<N extends FilterName>(
  name: N,
  value: FilterHooks[N][0],
  ...rest: FilterHooks[N] extends [unknown, ...infer R] ? R : never
): Promise<FilterHooks[N][0]> {
  ensureRegistered();
  if (!hooks.has("filter", name)) return value;
  const active = await activeSet();
  return hooks.applyFilters(name, value, rest, (p) => active.has(p));
}

// ---------------------------------------------------------------------------
// Management
// ---------------------------------------------------------------------------

export function getPlugin(slug: string) {
  return installedPlugins.find((p) => p.slug === slug) ?? null;
}

export async function listPlugins() {
  const active = await activeSet();
  return installedPlugins.map((p) => ({
    plugin: p,
    active: active.has(p.slug),
  }));
}

const optionName = (slug: string) => `plugin:${slug}`;

export async function getPluginSettings(slug: string): Promise<PluginSettings> {
  "use cache";
  cacheTag(SETTINGS_TAG);
  cacheLife("max");

  const plugin = getPlugin(slug);
  const defaults = Object.fromEntries(
    (plugin?.settings ?? []).flatMap((f) =>
      f.default === undefined ? [] : [[f.key, f.default]],
    ),
  ) as PluginSettings;
  const [row] = await db
    .select()
    .from(options)
    .where(eq(options.name, optionName(slug)));
  return { ...defaults, ...((row?.value as PluginSettings | undefined) ?? {}) };
}

export async function savePluginSettings(slug: string, values: PluginSettings) {
  await db
    .insert(options)
    .values({ name: optionName(slug), value: values })
    .onConflictDoUpdate({ target: options.name, set: { value: values } });
}

// Finds an active plugin's REST route for /wp-json/<slug>/v1/<path>.
export async function findRestRoute(
  namespace: string,
  method: string,
  path: string,
): Promise<{ route: PluginRestRoute; params: Record<string, string> } | null> {
  const plugin = getPlugin(namespace);
  if (!plugin?.rest || !(await activeSet()).has(plugin.slug)) return null;
  for (const route of plugin.rest) {
    if (route.method !== method) continue;
    const params = matchPath(route.path, path);
    if (params) return { route, params };
  }
  return null;
}

// REST namespaces of active plugins, for the /wp-json index.
export async function restNamespaces() {
  const active = await activeSet();
  return installedPlugins
    .filter((p) => p.rest?.length && active.has(p.slug))
    .map((p) => `${p.slug}/v1`);
}

// Admin pages of active plugins that `can` allows, for the Tools menu.
export async function toolPages(
  can: (cap: import("../capabilities").Capability) => boolean,
) {
  const active = await activeSet();
  return installedPlugins
    .filter((p) => active.has(p.slug))
    .flatMap((p) =>
      (p.adminPages ?? [])
        .filter((page) => can(page.cap))
        .map((page) => ({
          plugin: p.slug,
          path: page.path,
          title: page.title,
        })),
    );
}

export async function findAdminPage(slug: string, path: string) {
  const plugin = getPlugin(slug);
  if (!plugin || !(await activeSet()).has(slug)) return null;
  return plugin.adminPages?.find((p) => p.path === path) ?? null;
}
