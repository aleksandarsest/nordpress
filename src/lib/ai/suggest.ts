import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { slugify } from "../slug";
import { listTerms } from "../terms";
import {
  AiError,
  aiContext,
  fallbackParams,
  REFUSAL_MESSAGE,
  recordUsage,
  toAiError,
} from "./client";
import { withGuidance } from "./voice";

const SuggestionSchema = z.object({
  titles: z
    .array(z.string())
    .describe("Three alternative titles, each under 70 characters"),
  excerpt: z
    .string()
    .describe("A summary of at most 50 words for listings and search results"),
  slug: z
    .string()
    .describe("A short URL slug: lowercase words joined by hyphens"),
  category_ids: z
    .array(z.number().int())
    .describe("IDs of the best-fitting existing categories, at most 2"),
  tags: z
    .array(z.string())
    .describe("Three to six short tags, reusing existing tags where they fit"),
});

export type PostSuggestions = {
  titles: string[];
  excerpt: string;
  slug: string;
  categories: { id: number; name: string }[];
  tags: { name: string; isNew: boolean }[];
};

const SYSTEM = `You help authors publish posts on a website. Given a draft, you suggest metadata: alternative titles, an excerpt, a URL slug, categories and tags.

Categories must come from the provided list; return their IDs. Choose none if nothing fits. Reuse existing tags whenever one fits; propose new tags only for important topics no existing tag covers. Tags are short, lowercase topic names. Write titles and excerpt in the same language as the post.`;

const MAX_EXISTING_TAGS = 300;

export async function suggestForPost(
  input: { title: string; contentText: string },
  userId: string,
): Promise<PostSuggestions> {
  if (input.contentText.trim().length < 40 && input.title.trim().length < 5) {
    throw new AiError(
      "Write a little more first; there isn't enough content to analyze.",
    );
  }

  let model = "";
  try {
    const ctx = await aiContext();
    model = ctx.model;
    const [categories, tags] = await Promise.all([
      listTerms("category"),
      listTerms("post_tag"),
    ]);
    const popularTags = [...tags]
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_EXISTING_TAGS);

    const response = await ctx.client.beta.messages.parse({
      model: ctx.model,
      max_tokens: 4000,
      output_config: {
        effort: "low",
        format: betaZodOutputFormat(SuggestionSchema),
      },
      system: withGuidance(SYSTEM, ctx.settings),
      messages: [
        {
          role: "user",
          content: [
            `<categories>\n${categories.map((c) => `${c.id}: ${c.name}`).join("\n") || "(none)"}\n</categories>`,
            `<existing_tags>\n${popularTags.map((t) => t.name).join(", ") || "(none)"}\n</existing_tags>`,
            `<post_title>${input.title}</post_title>`,
            `<post>\n${input.contentText}\n</post>`,
          ].join("\n\n"),
        },
      ],
      ...fallbackParams(ctx.model),
    });

    if (response.stop_reason === "refusal") {
      await recordUsage({
        userId,
        feature: "suggest",
        model,
        usage: response.usage,
        outcome: "refused",
      });
      throw new AiError(REFUSAL_MESSAGE);
    }
    await recordUsage({
      userId,
      feature: "suggest",
      model: response.model,
      usage: response.usage,
    });
    const parsed = response.parsed_output;
    if (!parsed)
      throw new AiError(
        "The AI returned an unexpected answer. Please try again.",
      );

    // Never trust model output to reference real rows: filter to known ids
    const byId = new Map(categories.map((c) => [c.id, c]));
    const existingTags = new Map(
      tags.map((t) => [t.name.toLowerCase(), t.name]),
    );
    const seen = new Set<string>();
    return {
      titles: parsed.titles
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 3),
      excerpt: parsed.excerpt.trim(),
      slug: slugify(parsed.slug),
      categories: parsed.category_ids
        .map((id) => byId.get(id))
        .filter((c) => c !== undefined)
        .slice(0, 2)
        .map((c) => ({ id: c.id, name: c.name })),
      tags: parsed.tags
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t && t.length <= 40 && !seen.has(t) && seen.add(t))
        .slice(0, 6)
        .map((t) => ({
          name: existingTags.get(t) ?? t,
          isNew: !existingTags.has(t),
        })),
    };
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (model)
      await recordUsage({
        userId,
        feature: "suggest",
        model,
        outcome: "error",
      });
    throw toAiError(error);
  }
}
