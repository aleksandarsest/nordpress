import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  SITE_KINDS,
  type SiteAnswers,
  type SiteKind,
  type SitePlan,
  sitePlanSchema,
} from "../setup/plan";
import {
  AiError,
  aiContext,
  fallbackParams,
  REFUSAL_MESSAGE,
  recordUsage,
  toAiError,
} from "./client";

const SYSTEM = `You set up new websites. From the owner's description you plan a complete starter site: its name and tagline, a short description and style guide for later AI writing, the pages with their full copy, a few first posts if it suits the site, a contact form, and a theme.

Rules for the copy:
- Write real, specific, useful copy from what the owner told you, in their language, in the voice that suits their audience.
- Use every fact the owner gave (address, hours, phone, email, services, products, dates) where it belongs, exactly as written.
- Never invent facts: no prices, addresses, phone numbers, opening hours, team names, client names, awards, statistics or testimonials the owner didn't give. When a detail is missing, write around it so the page reads as finished; never leave placeholders in brackets.
- Pages: a home page (role "home") unless it is a blog that should show its latest posts on the front; an about page; a contact page (role "contact") if visitors should get in touch. Add a services/products page or one or two others only when the description calls for it. Keep each page focused: 80 to 300 words.
- Posts: none, or up to three short first posts that make sense for this site (e.g. a welcome or an introduction to a topic). Blogs should get at least one.
- Link between pages with relative links such as [Contact us](/contact).
- Contact form: only the fields this business needs, usually name, email and message, plus at most two specific questions.
- Products: only for shops, only the ones the owner listed, with the price they gave (or empty), and a one-sentence summary that doesn't invent details. Otherwise an empty list.
- Contact page: link to it with its slug, the page title in lowercase with hyphens (e.g. [Book a table](/reservations) for a page titled "Reservations").
- Theme: "nord" (calm, modern, card grid; good for businesses and organizations) or "classic" (simple reading layout; good for writing and portfolios). Pick the accent color that fits the brand.
- Markdown only: headings start at ##, no HTML, no images.`;

export async function draftSitePlan(
  input: { description: string; kind: SiteKind; answers: SiteAnswers },
  userId: string,
): Promise<SitePlan> {
  const description = input.description.trim();
  const a = input.answers;
  const facts = [
    a.offer && `What they do: ${a.offer}`,
    a.about && `About them: ${a.about}`,
    a.location && `Location: ${a.location}`,
    a.date && `Date: ${a.date}`,
    a.hours && `Opening hours:\n${a.hours}`,
    a.phone && `Phone: ${a.phone}`,
    a.email && `Email: ${a.email}`,
    a.items.length &&
      `Listed items:\n${a.items.map((i) => `- ${i}`).join("\n")}`,
  ].filter(Boolean);
  if (description.length < 15 && facts.length < 2)
    throw new AiError(
      "Tell the assistant a bit more: what the site is for and who it's for.",
    );

  let model = "";
  try {
    const ctx = await aiContext();
    model = ctx.model;
    const response = await ctx.client.beta.messages.parse({
      model: ctx.model,
      max_tokens: 32000,
      output_config: {
        effort: "medium",
        format: betaZodOutputFormat(sitePlanSchema),
      },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `<site_name>${a.title}</site_name>\n<kind_of_site>${SITE_KINDS[input.kind]}</kind_of_site>\n<facts>\n${facts.join("\n")}\n</facts>\n<description>\n${description || "(none beyond the facts)"}\n</description>`,
        },
      ],
      ...fallbackParams(ctx.model),
    });
    await recordUsage({
      userId,
      feature: "site_setup",
      model: response.model,
      usage: response.usage,
      outcome: response.stop_reason === "refusal" ? "refused" : "ok",
    });
    if (response.stop_reason === "refusal") throw new AiError(REFUSAL_MESSAGE);
    const plan = response.parsed_output;
    if (!plan?.pages.length && !plan?.posts.length)
      throw new AiError("The AI returned an empty plan. Please try again.");
    return plan;
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (model)
      await recordUsage({
        userId,
        feature: "site_setup",
        model,
        outcome: "error",
      });
    throw toAiError(error);
  }
}
