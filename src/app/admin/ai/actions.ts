"use server";

import { refresh, updateTag } from "next/cache";
import { generateAltText, supportsAltText } from "@/lib/ai/alt-text";
import { AiError } from "@/lib/ai/client";
import {
  type PostSuggestions,
  suggestForPost,
  suggestSeo,
} from "@/lib/ai/suggest";
import { hasCap } from "@/lib/capabilities";
import { getMedia, listMedia, updateMedia } from "@/lib/media";
import { POSTS_TAG } from "@/lib/posts";
import { assertCap, PermissionError } from "@/lib/session";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  if (error instanceof AiError || error instanceof PermissionError)
    return { ok: false, error: error.message };
  console.error("[ai]", error);
  return { ok: false, error: "Something went wrong with the AI request." };
}

export async function suggestPostAction(input: {
  title: string;
  contentText: string;
}): Promise<Result<PostSuggestions>> {
  try {
    const viewer = await assertCap("edit_posts");
    return {
      ok: true,
      data: await suggestForPost(
        {
          title: String(input.title).slice(0, 1000),
          contentText: String(input.contentText).slice(0, 400_000),
        },
        viewer.id,
      ),
    };
  } catch (error) {
    return fail(error);
  }
}

export async function altTextAction(
  mediaId: number,
): Promise<Result<{ alt: string; caption: string; decorative: boolean }>> {
  try {
    const viewer = await assertCap("upload_files");
    const item = await getMedia(mediaId);
    if (!item) throw new AiError("This media item no longer exists.");
    if (item.uploaderId !== viewer.id && !hasCap(viewer, "edit_others_posts"))
      throw new PermissionError();
    return { ok: true, data: await generateAltText(item, viewer.id) };
  } catch (error) {
    return fail(error);
  }
}

const BULK_LIMIT = 20;

// Fills in alt text for images that have none, a batch at a time.
export async function bulkAltTextAction(): Promise<
  Result<{ updated: number; failed: number; remaining: boolean }>
> {
  try {
    const viewer = await assertCap("upload_files");
    const { items } = await listMedia({ type: "image", perPage: 500 });
    const mine = (m: (typeof items)[number]) =>
      m.uploaderId === viewer.id || hasCap(viewer, "edit_others_posts");
    const missing = items.filter(
      (m) => !m.alt && supportsAltText(m) && mine(m),
    );
    let updated = 0;
    let failed = 0;
    for (const item of missing.slice(0, BULK_LIMIT)) {
      try {
        const result = await generateAltText(item, viewer.id);
        if (result.alt) {
          await updateMedia(item.id, {
            title: item.title,
            alt: result.alt,
            caption: item.caption || result.caption,
          });
          updated++;
        }
      } catch (error) {
        // A setup problem fails every item the same way; stop early
        if (
          error instanceof AiError &&
          /set up|turned off|API key/i.test(error.message)
        )
          throw error;
        failed++;
      }
    }
    updateTag(POSTS_TAG);
    refresh();
    return {
      ok: true,
      data: { updated, failed, remaining: missing.length > BULK_LIMIT },
    };
  } catch (error) {
    return fail(error);
  }
}

export async function suggestSeoAction(input: {
  title: string;
  contentText: string;
}): Promise<Result<{ title: string; description: string }>> {
  try {
    const viewer = await assertCap("edit_posts");
    return {
      ok: true,
      data: await suggestSeo(
        {
          title: String(input.title).slice(0, 1000),
          contentText: String(input.contentText).slice(0, 400_000),
        },
        viewer.id,
      ),
    };
  } catch (error) {
    return fail(error);
  }
}
