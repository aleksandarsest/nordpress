import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { after } from "next/server";
import { z } from "zod";
import type { Media } from "@/db/schema";
import { updateMedia } from "../media";
import { getSettings } from "../options";
import { storage } from "../storage";
import {
  AiError,
  aiConfigured,
  aiContext,
  fallbackParams,
  REFUSAL_MESSAGE,
  recordUsage,
  toAiError,
} from "./client";

// Image formats the model accepts, and the API's per-image size limit.
const VISION_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const MAX_BYTES = 5 * 1024 * 1024;

const AltSchema = z.object({
  alt: z
    .string()
    .describe(
      "Alt text: what the image shows, in one sentence of at most 125 characters",
    ),
  caption: z
    .string()
    .describe("An optional short caption; empty if the image needs none"),
  decorative: z
    .boolean()
    .describe(
      "True if the image is purely decorative and conveys no information",
    ),
});

const SYSTEM = `You write alternative text for images on a website, following accessibility best practice.

Describe what the image shows and what matters about it, concisely and concretely. Don't start with "Image of" or "Picture of". Transcribe short visible text that is important. Don't guess at people's identity, and don't describe sensitive personal characteristics unless they are clearly the point of the image. Write in English unless the page title is in another language.`;

export function supportsAltText(item: Pick<Media, "mimeType" | "size">) {
  return VISION_TYPES.has(item.mimeType) && item.size <= MAX_BYTES;
}

export async function generateAltText(
  item: Media,
  userId: string | null,
  context?: { pageTitle?: string },
) {
  if (!VISION_TYPES.has(item.mimeType)) {
    throw new AiError("AI alt text supports JPEG, PNG, GIF and WebP images.");
  }
  if (item.size > MAX_BYTES)
    throw new AiError(
      "This image is too large for AI alt text (5 MB maximum).",
    );
  const bytes = await storage().read(item.path);
  if (!bytes) throw new AiError("The image file is missing.");

  let model = "";
  try {
    const ctx = await aiContext();
    model = ctx.model;
    const data = Buffer.from(bytes).toString("base64");
    const response = await ctx.client.beta.messages.parse({
      model: ctx.model,
      max_tokens: 2000,
      output_config: { effort: "low", format: betaZodOutputFormat(AltSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: item.mimeType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data,
              },
            },
            {
              type: "text",
              text: [
                `File name: ${item.filename}`,
                item.title ? `Title: ${item.title}` : "",
                context?.pageTitle
                  ? `Used on a page titled: ${context.pageTitle}`
                  : "",
                "Write the alt text for this image.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
        },
      ],
      ...fallbackParams(ctx.model),
    });

    if (response.stop_reason === "refusal") {
      await recordUsage({
        userId,
        feature: "alt_text",
        model,
        usage: response.usage,
        outcome: "refused",
      });
      throw new AiError(REFUSAL_MESSAGE);
    }
    await recordUsage({
      userId,
      feature: "alt_text",
      model: response.model,
      usage: response.usage,
    });
    const parsed = response.parsed_output;
    if (!parsed)
      throw new AiError(
        "The AI returned an unexpected answer. Please try again.",
      );
    return {
      alt: parsed.decorative ? "" : parsed.alt.trim().slice(0, 250),
      caption: parsed.caption.trim(),
      decorative: parsed.decorative,
    };
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (model)
      await recordUsage({
        userId,
        feature: "alt_text",
        model,
        outcome: "error",
      });
    throw toAiError(error);
  }
}

// Fills in alt text for an image that has none; used after uploads.
export async function fillMissingAltText(item: Media, userId: string | null) {
  if (item.alt || !supportsAltText(item)) return;
  try {
    const result = await generateAltText(item, userId);
    if (result.alt)
      await updateMedia(item.id, {
        title: item.title,
        alt: result.alt,
        caption: item.caption,
      });
  } catch (error) {
    console.error(
      `[ai] automatic alt text failed for media ${item.id}:`,
      (error as Error).message,
    );
  }
}

// When enabled in Settings → AI, describes new uploads after the response has
// been sent, so uploading never waits on the model.
export async function queueAutoAltText(items: Media[], userId: string) {
  if (items.length === 0) return;
  const settings = await getSettings();
  if (!settings.aiEnabled || !settings.aiAutoAltText || !aiConfigured()) return;
  after(async () => {
    for (const item of items) await fillMissingAltText(item, userId);
  });
}
