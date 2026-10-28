"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { AiError } from "@/lib/ai/client";
import { draftSitePlan } from "@/lib/ai/site-plan";
import { FORMS_TAG } from "@/lib/forms";
import { MENUS_TAG } from "@/lib/menus";
import { SETTINGS_TAG, saveSettings } from "@/lib/options";
import { POSTS_TAG } from "@/lib/posts";
import { assertCap } from "@/lib/session";
import { applySitePlan } from "@/lib/setup/apply";
import {
  SITE_KINDS,
  type SiteAnswers,
  type SitePlan,
  sitePlanSchema,
} from "@/lib/setup/plan";
import { templatePlan } from "@/lib/setup/templates";
import { SHOP_TAG } from "@/lib/shop";
import { TERMS_TAG } from "@/lib/terms";

const kind = z.enum(Object.keys(SITE_KINDS) as [keyof typeof SITE_KINDS]);

const text = (max: number) => z.string().trim().max(max).default("");
const answersSchema = z.object({
  title: text(200),
  offer: text(300),
  about: text(2000),
  location: text(300),
  email: z
    .union([z.literal(""), z.email("That email address isn't valid.")])
    .default(""),
  phone: text(50),
  hours: text(1000),
  date: text(100),
  items: z.array(z.string().trim().max(200)).max(12).default([]),
});

export async function draftPlanAction(input: {
  mode: "ai" | "template";
  kind: string;
  answers: SiteAnswers;
  description: string;
}): Promise<{ plan?: SitePlan; error?: string }> {
  try {
    const viewer = await assertCap("manage_options");
    const k = kind.parse(input.kind);
    const answers = answersSchema.parse(input.answers);
    answers.title ||= "My Site";
    answers.items = answers.items.filter(Boolean);
    if (input.mode === "template") return { plan: templatePlan(k, answers) };
    return {
      plan: await draftSitePlan(
        { kind: k, answers, description: input.description.slice(0, 4000) },
        viewer.id,
      ),
    };
  } catch (error) {
    if (error instanceof AiError) return { error: error.message };
    if (error instanceof z.ZodError)
      return { error: error.issues.map((i) => i.message).join(" ") };
    console.error("[setup] draft failed", error);
    return { error: "Couldn't draft the site. Please try again." };
  }
}

export async function applyPlanAction(
  plan: SitePlan,
  options: {
    trashSamples: boolean;
    aiDrafted: boolean;
    logoId: number | null;
  },
): Promise<{
  result?: Awaited<ReturnType<typeof applySitePlan>>;
  error?: string;
}> {
  try {
    const viewer = await assertCap("manage_options");
    // The plan comes back from the browser, so it is checked again in full
    const result = await applySitePlan(
      viewer,
      sitePlanSchema.parse(plan),
      options,
    );
    for (const tag of [
      SHOP_TAG,
      POSTS_TAG,
      SETTINGS_TAG,
      MENUS_TAG,
      FORMS_TAG,
      TERMS_TAG,
    ])
      updateTag(tag);
    refresh();
    return { result };
  } catch (error) {
    console.error("[setup] apply failed", error);
    return {
      error:
        error instanceof z.ZodError
          ? "The plan has invalid parts. Start over and try again."
          : error instanceof Error
            ? error.message
            : "Couldn't create the site.",
    };
  }
}

export async function dismissSetupAction() {
  await assertCap("manage_options");
  await saveSettings({ setupCompleted: true });
  updateTag(SETTINGS_TAG);
  refresh();
}
