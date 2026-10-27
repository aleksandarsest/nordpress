"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { type FormState, formError, optionalId, str } from "@/lib/form";
import type { Move } from "@/lib/menu-tree";
import {
  addMenuItems,
  createMenu,
  deleteMenu,
  deleteMenuItem,
  MENUS_TAG,
  moveMenuItem,
  type NewMenuItem,
  renameMenu,
  setMenuLocations,
  updateMenuItem,
} from "@/lib/menus";
import { SETTINGS_TAG, saveSettings } from "@/lib/options";
import { POSTS_TAG } from "@/lib/posts";
import { assertCap } from "@/lib/session";
import { parseSettingFields } from "@/lib/setting-fields";
import { activeTheme, getTheme, saveThemeOptions } from "@/lib/themes";

function invalidate() {
  updateTag(SETTINGS_TAG);
  updateTag(MENUS_TAG);
  updateTag(POSTS_TAG);
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

export async function activateThemeAction(formData: FormData) {
  await assertCap("manage_options");
  const theme = getTheme(str(formData, "slug"));
  if (!theme) throw new Error("That theme isn't installed.");
  await saveSettings({ theme: theme.slug });
  invalidate();
  refresh();
}

export async function saveThemeOptionsAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap("manage_options");
    const theme = await activeTheme();
    await saveThemeOptions(
      theme.slug,
      parseSettingFields(theme.settings ?? [], formData),
    );
    invalidate();
    return { message: "Changes published." };
  } catch (error) {
    return formError(error);
  }
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

export async function createMenuAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  let id: number;
  try {
    await assertCap("manage_options");
    id = (await createMenu(str(formData, "name"))).id;
  } catch (error) {
    return formError(error);
  }
  redirect(`/admin/appearance/menus?menu=${id}`);
}

export async function saveMenuSettingsAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap("manage_options");
    const id = optionalId(formData, "menu_id");
    if (!id) throw new Error("Menu not found.");
    const theme = await activeTheme();
    const locations = formData
      .getAll("location")
      .map(String)
      .filter((l) => l in theme.menuLocations);
    await renameMenu(id, str(formData, "name"));
    await setMenuLocations(id, locations);
    invalidate();
    refresh();
    return { message: "Menu saved." };
  } catch (error) {
    return formError(error);
  }
}

export async function deleteMenuAction(formData: FormData) {
  await assertCap("manage_options");
  const id = optionalId(formData, "menu_id");
  if (id) await deleteMenu(id);
  invalidate();
  redirect("/admin/appearance/menus");
}

export async function addMenuItemsAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap("manage_options");
    const menuId = optionalId(formData, "menu_id");
    if (!menuId) throw new Error("Menu not found.");
    const kind = str(formData, "kind");
    let items: NewMenuItem[];
    if (kind === "custom") {
      items = [
        {
          type: "custom",
          url: str(formData, "url"),
          label: str(formData, "label"),
        },
      ];
    } else if (kind === "post" || kind === "term") {
      items = formData
        .getAll("ids")
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0)
        .map((objectId) => ({ type: kind, objectId }));
      if (items.length === 0) throw new Error("Tick at least one item to add.");
    } else {
      throw new Error("Unknown item type.");
    }
    await addMenuItems(menuId, items);
    invalidate();
    refresh();
    return {
      message: `Added ${items.length} item${items.length === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return formError(error);
  }
}

export async function updateMenuItemAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap("manage_options");
    await updateMenuItem(Number(formData.get("item_id")), {
      label: str(formData, "label"),
      url: formData.has("url") ? str(formData, "url") : undefined,
      openInNewTab: formData.get("new_tab") === "on",
    });
    invalidate();
    refresh();
    return { message: "Saved." };
  } catch (error) {
    return formError(error);
  }
}

const MOVES: Move[] = ["up", "down", "in", "out"];

export async function moveMenuItemAction(formData: FormData) {
  await assertCap("manage_options");
  const move = str(formData, "move") as Move;
  if (!MOVES.includes(move)) throw new Error("Unknown move.");
  await moveMenuItem(Number(formData.get("item_id")), move);
  invalidate();
  refresh();
}

export async function deleteMenuItemAction(formData: FormData) {
  await assertCap("manage_options");
  await deleteMenuItem(Number(formData.get("item_id")));
  invalidate();
  refresh();
}
