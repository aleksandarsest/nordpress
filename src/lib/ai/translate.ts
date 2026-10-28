import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { languageName } from "../i18n";
import {
  AiError,
  aiContext,
  fallbackParams,
  REFUSAL_MESSAGE,
  recordUsage,
  toAiError,
} from "./client";
import { withGuidance } from "./voice";

const Translation = z.object({
  title: z.string(),
  excerpt: z.string().describe("Empty if the original has no excerpt"),
  content: z
    .string()
    .describe("The full body in Markdown, structure and links unchanged"),
});

const SYSTEM = `You translate website posts and pages. Translate the title, the excerpt and the Markdown body into the target language so it reads as if written in that language by the same author: natural phrasing, local conventions for dates, numbers and punctuation, the same tone.

Keep the Markdown structure exactly: headings, lists, emphasis, links and images. Translate link text but never URLs. Leave product names, brand names, code, anything in backticks and HTML tags such as <div data-form="3"></div> (embedded forms and videos) as they are. Don't add, drop or summarize content. If the site's style guide is in another language, apply its tone and rules, not its language.`;

export async function translatePost(
  input: {
    title: string;
    excerpt: string;
    markdown: string;
    to: string;
    from: string;
  },
  userId: string,
) {
  let model = "";
  try {
    const ctx = await aiContext();
    model = ctx.model;
    const response = await ctx.client.beta.messages
      .stream({
        model: ctx.model,
        max_tokens: 64000,
        output_config: {
          effort: "medium",
          format: betaZodOutputFormat(Translation),
        },
        system: withGuidance(SYSTEM, ctx.settings),
        messages: [
          {
            role: "user",
            content: `Translate from ${languageName(input.from, "en")} (${input.from}) into ${languageName(input.to, "en")} (${input.to}).\n\n<title>${input.title}</title>\n<excerpt>${input.excerpt}</excerpt>\n<body>\n${input.markdown}\n</body>`,
          },
        ],
        ...fallbackParams(ctx.model),
      })
      .finalMessage();
    await recordUsage({
      userId,
      feature: "translate",
      model: response.model,
      usage: response.usage,
      outcome: response.stop_reason === "refusal" ? "refused" : "ok",
    });
    if (response.stop_reason === "refusal") throw new AiError(REFUSAL_MESSAGE);
    if (response.stop_reason === "max_tokens")
      throw new AiError("This post is too long to translate in one go.");
    const text = response.content.find((b) => b.type === "text");
    const parsed = Translation.safeParse(
      text && "text" in text ? JSON.parse(text.text) : null,
    );
    if (!parsed.success)
      throw new AiError(
        "The AI returned an unexpected answer. Please try again.",
      );
    return parsed.data;
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (model)
      await recordUsage({
        userId,
        feature: "translate",
        model,
        outcome: "error",
      });
    throw toAiError(error);
  }
}
