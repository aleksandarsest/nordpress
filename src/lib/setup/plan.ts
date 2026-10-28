import { z } from "zod";
import { PRESET_KEYS } from "../design";
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
  products: z
    .array(
      z.object({
        name: z.string().max(200),
        price: z
          .string()
          .max(20)
          .describe('A price like "19.90", or empty when the owner gave none'),
        summary: z.string().max(500),
      }),
    )
    .max(12)
    .describe(
      "Products for sale, only for shops and only ones the owner named",
    ),
  theme: z.enum(["studio", "classic", "nord"]),
  style: z
    .enum(PRESET_KEYS)
    .describe("The Studio design style that fits the site best"),
  accent: z
    .enum(["frost", "green", "purple", "orange", "red"])
    .describe("Accent color for the Nord theme"),
});

export type SitePlan = z.infer<typeof sitePlanSchema>;

export const SITE_KINDS = {
  business: "Business or service",
  shop: "Online shop",
  restaurant: "Restaurant, café or bar",
  freelancer: "Freelancer or consultant",
  portfolio: "Portfolio",
  blog: "Personal site or blog",
  organization: "Organization, club or nonprofit",
  event: "Event or wedding",
} as const;

export type SiteKind = keyof typeof SITE_KINDS;

/** What the setup wizard asks, so a starter site has real text from the start. */
export type SiteAnswers = {
  title: string;
  /** What you do or offer, in a line: "Sourdough bread and baking classes". */
  offer: string;
  /** A few sentences about you, your story or the event. */
  about: string;
  /** City or address; for events, the venue. */
  location: string;
  email: string;
  phone: string;
  /** Opening hours as the owner writes them, one line per day or range. */
  hours: string;
  /** For events: when it happens. */
  date: string;
  /**
   * Services, dishes, products, projects, topics or programme items, one per
   * line. Products may end in a price: "Sourdough loaf — 5.50".
   */
  items: string[];
};

export const EMPTY_ANSWERS: SiteAnswers = {
  title: "",
  offer: "",
  about: "",
  location: "",
  email: "",
  phone: "",
  hours: "",
  date: "",
  items: [],
};

/** Which questions each kind of site asks, and what its list is called. */
export const KIND_QUESTIONS: Record<
  SiteKind,
  {
    offer: string;
    items?: string;
    location?: string;
    hours?: boolean;
    date?: boolean;
    phone?: boolean;
  }
> = {
  business: {
    offer: "What do you do, and for whom?",
    items: "Your services, one per line",
    location: "Where are you?",
    hours: true,
    phone: true,
  },
  shop: {
    offer: "What do you sell?",
    items: "A few products, one per line (add a price: Candle — 18.00)",
    location: "Where are you based?",
  },
  restaurant: {
    offer: "What kind of place is it?",
    items: "Dishes or drinks people come for, one per line",
    location: "Address",
    hours: true,
    phone: true,
  },
  freelancer: {
    offer: "What do you do, and for whom?",
    items: "What you offer, one per line",
    location: "Where do you work from?",
  },
  portfolio: {
    offer: "What's your craft?",
    items: "Projects to show, one per line",
    location: "Where are you based?",
  },
  blog: {
    offer: "What will you write about?",
    items: "Topics, one per line",
  },
  organization: {
    offer: "What does your organization do?",
    items: "Activities or programmes, one per line",
    location: "Where do you meet?",
  },
  event: {
    offer: "What's the event?",
    items: "The programme, one per line (14:00 — Ceremony)",
    location: "Venue",
    date: true,
  },
};
