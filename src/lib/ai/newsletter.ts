import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  AiError,
  aiContext,
  fallbackParams,
  REFUSAL_MESSAGE,
  recordUsage,
  toAiError,
} from "./client";
import { withGuidance } from "./voice";

const Subjects = z.object({
  subjects: z
    .array(z.string())
    .describe("Three different subject lines, at most 60 characters each"),
  preheader: z
    .string()
    .describe("Preview text shown after the subject, at most 100 characters"),
});

const SYSTEM = `You write email subject lines for a website's newsletter, which sends each new post to subscribers.

Write three different subject lines that make a subscriber want to open this post: specific to what it says, honest about it, in the post's language. No clickbait, no ALL CAPS, no emoji unless the site's style uses them, no "Newsletter:" prefixes. Also write a preheader: one sentence that adds to the subject instead of repeating it.`;

export async function suggestNewsletterSubjects(
  post: { title: string; excerpt: string; text: string },
  userId: string,
) {
  let model = "";
  try {
    const ctx = await aiContext();
    model = ctx.model;
    const response = await ctx.client.beta.messages.parse({
      model: ctx.model,
      max_tokens: 2000,
      output_config: { effort: "low", format: betaZodOutputFormat(Subjects) },
      system: withGuidance(SYSTEM, ctx.settings),
      messages: [
        {
          role: "user",
          content: `<title>${post.title}</title>\n<excerpt>${post.excerpt}</excerpt>\n<post>\n${post.text.slice(0, 20_000)}\n</post>`,
        },
      ],
      ...fallbackParams(ctx.model),
    });
    await recordUsage({
      userId,
      feature: "newsletter",
      model: response.model,
      usage: response.usage,
      outcome: response.stop_reason === "refusal" ? "refused" : "ok",
    });
    if (response.stop_reason === "refusal") throw new AiError(REFUSAL_MESSAGE);
    const parsed = response.parsed_output;
    if (!parsed)
      throw new AiError(
        "The AI returned an unexpected answer. Please try again.",
      );
    return {
      subjects: parsed.subjects
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3),
      preheader: parsed.preheader.trim(),
    };
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (model)
      await recordUsage({
        userId,
        feature: "newsletter",
        model,
        outcome: "error",
      });
    throw toAiError(error);
  }
}
