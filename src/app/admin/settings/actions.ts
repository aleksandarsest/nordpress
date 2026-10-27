"use server";

import { refresh, updateTag } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { embeddingsConfigured, rebuildIndex } from "@/lib/ai/embeddings";
import { COMMENTS_TAG } from "@/lib/comments";
import { email, type FormState, formError, optionalId, str } from "@/lib/form";
import {
  AI_MODELS,
  type AiModel,
  PERMALINK_STRUCTURES,
  SETTINGS_TAG,
  saveSettings,
} from "@/lib/options";
import { POSTS_TAG } from "@/lib/posts";
import { assertCap } from "@/lib/session";
import { ROLES } from "@/lib/users";

const general = z.object({
  title: z.string().trim().min(1, "The site title cannot be empty."),
  tagline: z.string().trim(),
  adminEmail: email,
  usersCanRegister: z.boolean(),
  defaultRole: z.enum(ROLES),
  timezone: z
    .string()
    .refine(
      (tz) => Intl.supportedValuesOf("timeZone").includes(tz) || tz === "UTC",
      "Unknown timezone.",
    ),
  dateFormat: z.string().trim().min(1),
});

const reading = z.object({
  showOnFront: z.enum(["posts", "page"]),
  pageOnFront: z.number().nullable(),
  pageForPosts: z.number().nullable(),
  postsPerPage: z.number().int().min(1).max(100),
  blogPublic: z.boolean(),
});

const discussion = z.object({
  defaultCommentStatus: z.enum(["open", "closed"]),
  requireNameEmail: z.boolean(),
  commentRegistration: z.boolean(),
  commentModeration: z.boolean(),
  commentPreviouslyApproved: z.boolean(),
  threadDepth: z.number().int().min(1).max(10),
  closeCommentsDaysOld: z.number().int().min(0).max(3650),
});

const permalinks = z.object({
  permalinkStructure: z.enum(
    Object.keys(PERMALINK_STRUCTURES) as [keyof typeof PERMALINK_STRUCTURES],
  ),
});

async function save(values: Parameters<typeof saveSettings>[0]) {
  await assertCap("manage_options");
  await saveSettings(values);
  updateTag(SETTINGS_TAG);
  updateTag(POSTS_TAG);
}

export async function saveGeneralAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await save(
      general.parse({
        title: str(formData, "title"),
        tagline: str(formData, "tagline"),
        adminEmail: str(formData, "admin_email"),
        usersCanRegister: formData.get("users_can_register") === "on",
        defaultRole: str(formData, "default_role"),
        timezone: str(formData, "timezone"),
        dateFormat: str(formData, "date_format"),
      }),
    );
    return { message: "Settings saved." };
  } catch (error) {
    return formError(error);
  }
}

export async function saveReadingAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const values = reading.parse({
      showOnFront: str(formData, "show_on_front"),
      pageOnFront: optionalId(formData, "page_on_front"),
      pageForPosts: optionalId(formData, "page_for_posts"),
      postsPerPage: Number(str(formData, "posts_per_page")),
      blogPublic: formData.get("blog_public") !== "on",
    });
    if (values.showOnFront === "page" && !values.pageOnFront) {
      throw new Error("Choose a page to show as the homepage.");
    }
    if (values.pageOnFront && values.pageOnFront === values.pageForPosts) {
      throw new Error(
        "The homepage and the posts page must be different pages.",
      );
    }
    await save(values);
    return { message: "Settings saved." };
  } catch (error) {
    return formError(error);
  }
}

export async function savePermalinksAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await save(
      permalinks.parse({
        permalinkStructure: str(formData, "permalink_structure"),
      }),
    );
    return { message: "Permalink structure updated." };
  } catch (error) {
    return formError(error);
  }
}

export async function saveDiscussionAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const on = (key: string) => formData.get(key) === "on";
  try {
    await save(
      discussion.parse({
        defaultCommentStatus: on("default_comment_status") ? "open" : "closed",
        requireNameEmail: on("require_name_email"),
        commentRegistration: on("comment_registration"),
        commentModeration: on("comment_moderation"),
        commentPreviouslyApproved: on("comment_previously_approved"),
        threadDepth: Number(str(formData, "thread_depth")),
        closeCommentsDaysOld: on("close_comments")
          ? Number(str(formData, "close_comments_days_old"))
          : 0,
      }),
    );
    updateTag(COMMENTS_TAG);
    return { message: "Settings saved." };
  } catch (error) {
    return formError(error);
  }
}

const ai = z.object({
  aiEnabled: z.boolean(),
  aiAutoAltText: z.boolean(),
  aiModel: z.enum(Object.keys(AI_MODELS) as [AiModel, ...AiModel[]]),
  chatEnabled: z.boolean(),
  chatDailyLimit: z.number().int().min(1).max(100_000),
});

export async function saveAiAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await save(
      ai.parse({
        aiEnabled: formData.get("ai_enabled") === "on",
        aiAutoAltText: formData.get("ai_auto_alt_text") === "on",
        aiModel: str(formData, "ai_model"),
        chatEnabled: formData.get("chat_enabled") === "on",
        chatDailyLimit: Number(str(formData, "chat_daily_limit")),
      }),
    );
    return { message: "Settings saved." };
  } catch (error) {
    return formError(error);
  }
}

export async function rebuildIndexAction() {
  await assertCap("manage_options");
  if (!embeddingsConfigured()) return;
  // Can take a while on large sites; the settings page shows progress
  after(() => rebuildIndex());
  refresh();
}
