import "server-only";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { type MenuItem, menuItems, menus, posts, terms } from "@/db/schema";
import { type Move, moveItem, removeItem } from "./menu-tree";
import { getSettings, saveSettings } from "./options";
import { postPath, termPath } from "./permalinks";
import { getPageTree, LIVE_POST_SQL } from "./posts";

export const MENUS_TAG = "menus";

export class MenuError extends Error {}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function listMenus() {
  return db.select().from(menus).orderBy(asc(menus.name));
}

export async function getMenuForEdit(id: number) {
  const [menu] = await db.select().from(menus).where(eq(menus.id, id));
  if (!menu) return null;
  const items = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.menuId, id))
    .orderBy(asc(menuItems.position), asc(menuItems.id));

  // Show the current title of linked content next to custom labels
  const postIds = items
    .filter((i) => i.type === "post" && i.objectId)
    .map((i) => i.objectId as number);
  const termIds = items
    .filter((i) => i.type === "term" && i.objectId)
    .map((i) => i.objectId as number);
  const [linkedPosts, linkedTerms] = await Promise.all([
    postIds.length
      ? db
          .select({
            id: posts.id,
            title: posts.title,
            type: posts.type,
            status: posts.status,
          })
          .from(posts)
          .where(inArray(posts.id, postIds))
      : [],
    termIds.length
      ? db
          .select({ id: terms.id, name: terms.name, taxonomy: terms.taxonomy })
          .from(terms)
          .where(inArray(terms.id, termIds))
      : [],
  ]);
  return {
    menu,
    items: items.map((item) => {
      const post =
        item.type === "post"
          ? linkedPosts.find((p) => p.id === item.objectId)
          : undefined;
      const term =
        item.type === "term"
          ? linkedTerms.find((t) => t.id === item.objectId)
          : undefined;
      return {
        ...item,
        original: post?.title ?? term?.name ?? null,
        kind:
          item.type === "custom"
            ? "Custom link"
            : post
              ? post.type === "page"
                ? "Page"
                : "Post"
              : term
                ? term.taxonomy === "category"
                  ? "Category"
                  : "Tag"
                : "Missing",
        broken: item.type !== "custom" && !post && !term,
        unpublished: !!post && post.status !== "publish",
      };
    }),
  };
}

export async function createMenu(name: string) {
  const clean = name.trim();
  if (!clean) throw new MenuError("Give the menu a name.");
  const [menu] = await db.insert(menus).values({ name: clean }).returning();
  return menu;
}

export async function renameMenu(id: number, name: string) {
  const clean = name.trim();
  if (!clean) throw new MenuError("Give the menu a name.");
  await db.update(menus).set({ name: clean }).where(eq(menus.id, id));
}

export async function deleteMenu(id: number) {
  await db.delete(menus).where(eq(menus.id, id));
  const { menuLocations } = await getSettings();
  const kept = Object.fromEntries(
    Object.entries(menuLocations).filter(([, menuId]) => menuId !== id),
  );
  await saveSettings({ menuLocations: kept });
}

export async function setMenuLocations(menuId: number, locations: string[]) {
  const { menuLocations } = await getSettings();
  const next = Object.fromEntries(
    Object.entries(menuLocations).filter(([, id]) => id !== menuId),
  );
  for (const location of locations) next[location] = menuId;
  await saveSettings({ menuLocations: next });
}

export type NewMenuItem =
  | { type: "custom"; url: string; label: string }
  | { type: "post" | "term"; objectId: number };

// Blocks javascript: and other schemes that would run in visitors' browsers
export function isAllowedMenuUrl(url: string) {
  return /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(url.trim());
}

export async function addMenuItems(menuId: number, items: NewMenuItem[]) {
  if (items.length === 0) return;
  for (const item of items) {
    if (item.type === "custom") {
      if (!item.label.trim()) throw new MenuError("Custom links need a label.");
      if (!isAllowedMenuUrl(item.url)) {
        throw new MenuError(
          "Links must start with http://, https://, /, #, mailto: or tel:.",
        );
      }
    }
  }
  const [{ last }] = await db
    .select({ last: max(menuItems.position) })
    .from(menuItems)
    .where(eq(menuItems.menuId, menuId));
  let position = (last ?? -1) + 1;
  await db.insert(menuItems).values(
    items.map((item) => ({
      menuId,
      position: position++,
      type: item.type,
      objectId: item.type === "custom" ? null : item.objectId,
      url: item.type === "custom" ? item.url.trim() : "",
      label: item.type === "custom" ? item.label.trim() : "",
    })),
  );
}

export async function updateMenuItem(
  id: number,
  values: { label: string; url?: string; openInNewTab: boolean },
) {
  const [item] = await db.select().from(menuItems).where(eq(menuItems.id, id));
  if (!item) throw new MenuError("That menu item no longer exists.");
  if (
    item.type === "custom" &&
    values.url !== undefined &&
    !/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(values.url.trim())
  ) {
    throw new MenuError(
      "Links must start with http://, https://, /, #, mailto: or tel:.",
    );
  }
  await db
    .update(menuItems)
    .set({
      label: values.label.trim(),
      openInNewTab: values.openInNewTab,
      ...(item.type === "custom" && values.url !== undefined
        ? { url: values.url.trim() }
        : {}),
    })
    .where(eq(menuItems.id, id));
  return item.menuId;
}

async function persistOrder(
  menuId: number,
  order: { id: number; parentId: number | null; position: number }[],
) {
  await db.transaction(async (tx) => {
    for (const o of order) {
      await tx
        .update(menuItems)
        .set({ parentId: o.parentId, position: o.position })
        .where(and(eq(menuItems.id, o.id), eq(menuItems.menuId, menuId)));
    }
  });
}

async function itemsOf(itemId: number) {
  const [item] = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.id, itemId));
  if (!item) throw new MenuError("That menu item no longer exists.");
  const all = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.menuId, item.menuId));
  return { menuId: item.menuId, all };
}

export async function moveMenuItem(itemId: number, move: Move) {
  const { menuId, all } = await itemsOf(itemId);
  await persistOrder(menuId, moveItem(all, itemId, move));
  return menuId;
}

export async function deleteMenuItem(itemId: number) {
  const { menuId, all } = await itemsOf(itemId);
  const order = removeItem(all, itemId);
  await db.transaction(async (tx) => {
    await tx.delete(menuItems).where(eq(menuItems.id, itemId));
  });
  await persistOrder(menuId, order);
  return menuId;
}

// ---------------------------------------------------------------------------
// Public rendering
// ---------------------------------------------------------------------------

export type ResolvedMenuItem = {
  id: number;
  label: string;
  url: string;
  newTab: boolean;
  children: ResolvedMenuItem[];
};

// The menu assigned to a theme location, with links resolved to current
// permalinks. Items pointing at unpublished or deleted content are dropped.
export async function getMenuAt(
  location: string,
): Promise<ResolvedMenuItem[] | null> {
  "use cache";
  cacheTag(MENUS_TAG);
  cacheTag("posts");
  cacheTag("terms");
  cacheLife("hours");

  const settings = await getSettings();
  const menuId = settings.menuLocations[location];
  if (!menuId) return null;

  const items = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.menuId, menuId))
    .orderBy(asc(menuItems.position), asc(menuItems.id));
  if (items.length === 0) return [];

  const postIds = items
    .filter((i) => i.type === "post" && i.objectId)
    .map((i) => i.objectId as number);
  const termIds = items
    .filter((i) => i.type === "term" && i.objectId)
    .map((i) => i.objectId as number);
  const [livePosts, linkedTerms, tree] = await Promise.all([
    postIds.length
      ? db
          .select({
            id: posts.id,
            title: posts.title,
            type: posts.type,
            slug: posts.slug,
            publishedAt: posts.publishedAt,
          })
          .from(posts)
          .where(and(inArray(posts.id, postIds), LIVE_POST_SQL))
      : [],
    termIds.length
      ? db.select().from(terms).where(inArray(terms.id, termIds))
      : [],
    getPageTree(),
  ]);

  const resolve = (item: MenuItem): { label: string; url: string } | null => {
    if (item.type === "custom") return { label: item.label, url: item.url };
    if (item.type === "post") {
      const post = livePosts.find((p) => p.id === item.objectId);
      if (!post) return null;
      const isFront =
        settings.showOnFront === "page" && settings.pageOnFront === post.id;
      const url = isFront
        ? "/"
        : postPath(
            post,
            settings.permalinkStructure,
            tree.find((t) => t.id === post.id)?.path,
          );
      return { label: item.label || post.title, url };
    }
    const term = linkedTerms.find((t) => t.id === item.objectId);
    return term
      ? {
          label: item.label || term.name,
          url: termPath(term.taxonomy, term.slug),
        }
      : null;
  };

  const nodes = new Map<number, ResolvedMenuItem>();
  const roots: ResolvedMenuItem[] = [];
  for (const item of items) {
    const resolved = resolve(item);
    if (!resolved) continue;
    const node = {
      id: item.id,
      ...resolved,
      newTab: item.openInNewTab,
      children: [],
    };
    nodes.set(item.id, node);
    // Children of a dropped item are dropped with it
    const parent = item.parentId ? nodes.get(item.parentId) : undefined;
    if (item.parentId && !parent) continue;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}
