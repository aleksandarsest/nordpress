import { z } from "zod";
import { FIELD_TYPES } from "../forms/fields";

// A starter site: what the setup wizard proposes and, once approved, creates.
// The same shape comes from a template or from Claude.

export const sitePlanSchema = z.object({
  title: z.string().max(200).describe("The site's name"),
  tagline: z.string().max(200).describe("One short line under the name"),
  site_about: z
    .string()
    .max(4000)
    .describe(
      "Two to four sentences on who runs the site, what it offers and for whom, for the AI features' context",
    ),
  brand_voice: z
    .string()
    .max(4000)
    .describe(
      "A short style guide: tone, audience, a few do's and don'ts, as plain lines",
    ),
  homepage: z
    .enum(["page", "posts"])
    .describe("page: a static home page; posts: the latest posts"),
  pages: z
    .array(
      z.object({
        role: z.enum(["home", "about", "services", "contact", "other"]),
        title: z.string().max(200),
        content: z.string().max(20_000).describe("The page body in Markdown"),
        in_menu: z.boolean(),
      }),
    )
    .max(8),
  posts: z
    .array(
      z.object({
        title: z.string().max(200),
        excerpt: z.string().max(500),
        content: z.string().max(20_000).describe("The post body in Markdown"),
      }),
    )
    .max(3),
  contact_form: z.object({
    include: z.boolean(),
    fields: z
      .array(
        z.object({
          label: z.string().max(200),
          type: z.enum(FIELD_TYPES),
          required: z.boolean(),
          placeholder: z.string().max(200),
          help: z.string().max(500),
          options: z.array(z.string().max(200)).max(20),
        }),
      )
      .max(12),
  }),
  theme: z.enum(["classic", "nord"]),
  accent: z
    .enum(["frost", "green", "purple", "orange", "red"])
    .describe("Accent color for the Nord theme"),
});

export type SitePlan = z.infer<typeof sitePlanSchema>;

export const SITE_KINDS = {
  business: "Business or service",
  blog: "Blog or publication",
  portfolio: "Portfolio",
  organization: "Organization, club or nonprofit",
} as const;

export type SiteKind = keyof typeof SITE_KINDS;
