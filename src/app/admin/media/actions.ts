"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { hasCap } from "@/lib/capabilities";
import { type FormState, formError, str } from "@/lib/form";
import {
  deleteMedia,
  getMedia,
  listMedia,
  mediaUrl,
  updateMedia,
} from "@/lib/media";
import { POSTS_TAG } from "@/lib/posts";
import { assertCap, PermissionError } from "@/lib/session";

// Authors manage their own uploads; editors and above manage everyone's.
async function assertCanManage(id: number) {
  const viewer = await assertCap("upload_files");
  const item = await getMedia(id);
  if (!item) throw new Error("This media item no longer exists.");
  if (item.uploaderId !== viewer.id && !hasCap(viewer, "edit_others_posts")) {
    throw new PermissionError();
  }
  return item;
}

export type PickerItem = {
  id: number;
  url: string;
  title: string;
  alt: string;
  width: number | null;
  height: number | null;
};

export async function pickMediaAction(
  search: string,
  page = 1,
): Promise<{ items: PickerItem[]; pages: number }> {
  await assertCap("upload_files");
  const list = await listMedia({ search, type: "image", page, perPage: 30 });
  return {
    pages: list.pages,
    items: list.items.map((m) => ({
      id: m.id,
      url: mediaUrl(m.path),
      title: m.title,
      alt: m.alt,
      width: m.width,
      height: m.height,
    })),
  };
}

export async function updateMediaAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCanManage(Number(formData.get("id")));
    await updateMedia(Number(formData.get("id")), {
      title: str(formData, "title"),
      alt: str(formData, "alt"),
      caption: str(formData, "caption"),
    });
    updateTag(POSTS_TAG);
    refresh();
    return { message: "Media file updated." };
  } catch (error) {
    return formError(error);
  }
}

export async function deleteMediaAction(formData: FormData) {
  await assertCanManage(Number(formData.get("id")));
  await deleteMedia(Number(formData.get("id")));
  updateTag(POSTS_TAG);
  redirect("/admin/media?deleted=1");
}
