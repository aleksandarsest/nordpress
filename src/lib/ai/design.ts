import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { designSchema, FONT_PAIRINGS, type SiteDesign } from "../design";
import {
  AiError,
  aiContext,
  fallbackParams,
  REFUSAL_MESSAGE,
  recordUsage,
  toAiError,
} from "./client";

const DesignChoice = designSchema.omit({ preset: true });

const SYSTEM = `You are a web designer choosing a design for a small website from a fixed set of options. The owner describes the look and feel they want; pick the options that fit best.

- brand: one hex color (#rrggbb) that suits the description. A clear, confident color; the system keeps text readable whatever you pick.
- mode: "dark" only when the owner asks for dark, moody or night-time; otherwise "light".
- tint: "warm" for cozy, natural, food, craft; "cool" for calm, clean, tech, health; "brand" for playful or colorful; "neutral" for minimal or corporate.
- header: "plain" for minimal, "brand" for bold and colorful, "contrast" for a strong, classic look.
- fonts: ${Object.entries(FONT_PAIRINGS)
  .map(([k, v]) => `"${k}" (${v.label})`)
  .join(", ")}.
- radius: "none" for sharp, editorial or luxury; "soft" for most; "round" for friendly or playful. buttons: "solid", "outline" (elegant) or "pill" (friendly).
- width: "narrow" for writing, "wide" for visual or busy sites; size "l" for elegant or easy reading, "s" for dense information.
- headerLayout: "split" for most, "centered" for boutique, personal or events, "stacked" for editorial.
- density: "airy" for premium and calm, "compact" for information-heavy; posts: "cards", "list" or "magazine" (news, many images).`;

export async function designFromDescription(
  description: string,
  current: SiteDesign,
  userId: string,
): Promise<SiteDesign> {
  if (description.trim().length < 5)
    throw new AiError(
      "Describe the look in a few words, e.g. “warm and handmade”.",
    );
  let model = "";
  try {
    const ctx = await aiContext();
    model = ctx.model;
    const response = await ctx.client.beta.messages.parse({
      model: ctx.model,
      max_tokens: 2000,
      output_config: {
        effort: "low",
        format: betaZodOutputFormat(DesignChoice),
      },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `<site>${ctx.settings.title}: ${ctx.settings.siteAbout || ctx.settings.tagline}</site>\n<current_brand_color>${current.brand}</current_brand_color>\n<wanted_look>${description.slice(0, 1000)}</wanted_look>\nKeep the current brand color unless the wanted look asks for a different one.`,
        },
      ],
      ...fallbackParams(ctx.model),
    });
    await recordUsage({
      userId,
      feature: "design",
      model: response.model,
      usage: response.usage,
      outcome: response.stop_reason === "refusal" ? "refused" : "ok",
    });
    if (response.stop_reason === "refusal") throw new AiError(REFUSAL_MESSAGE);
    const choice = response.parsed_output;
    if (!choice)
      throw new AiError(
        "The AI returned an unexpected answer. Please try again.",
      );
    // Checked again: the model's answer is untrusted input like any other
    return designSchema.parse({ ...choice, preset: "custom" });
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (model)
      await recordUsage({ userId, feature: "design", model, outcome: "error" });
    throw toAiError(error);
  }
}
