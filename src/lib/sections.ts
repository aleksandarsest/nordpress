import type { DOMOutputSpec } from "@tiptap/pm/model";
import { z } from "zod";

// Page sections: designed blocks (hero, features, gallery, testimonials, FAQ,
// pricing, call to action) stored as data on one editor node. The data is
// checked here on every way in (editor, HTML, REST, agents), and rendered to
// HTML, Markdown and plain text from it. Pure.

const text = (max: number) => z.string().trim().max(max).catch("");

// Same rule as menus: no javascript: or other schemes that run code
export function safeUrl(url: string) {
  const u = url.trim();
  return /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(u)
    ? u.slice(0, 1000)
    : "";
}
// Images come from the media library or another https address
export function safeImage(src: string) {
  const s = src.trim();
  return /^(\/uploads\/|https:\/\/)/i.test(s) && !/["'<>\s]/.test(s)
    ? s.slice(0, 1000)
    : "";
}

const link = z
  .object({ label: text(80), url: z.string().catch("").transform(safeUrl) })
  .catch({ label: "", url: "" });
const image = z
  .object({ src: z.string().catch("").transform(safeImage), alt: text(300) })
  .catch({ src: "", alt: "" });

const list = <T extends z.ZodType>(item: T, max: number) =>
  z
    .array(item)
    .catch([])
    .transform((items) => items.slice(0, max));

export const SECTION_SCHEMAS = {
  hero: z.object({
    eyebrow: text(80),
    heading: text(200),
    text: text(600),
    primary: link,
    secondary: link,
    image,
    layout: z.enum(["center", "split", "cover"]).catch("center"),
  }),
  features: z.object({
    heading: text(200),
    intro: text(600),
    items: list(z.object({ title: text(120), text: text(500) }), 12),
    columns: z.enum(["2", "3", "4"]).catch("3"),
  }),
  gallery: z.object({
    heading: text(200),
    images: list(image.and(z.object({ caption: text(200) })), 24),
  }),
  testimonials: z.object({
    heading: text(200),
    items: list(
      z.object({ quote: text(800), name: text(120), role: text(120) }),
      9,
    ),
  }),
  faq: z.object({
    heading: text(200),
    items: list(z.object({ question: text(300), answer: text(2000) }), 20),
  }),
  pricing: z.object({
    heading: text(200),
    intro: text(600),
    plans: list(
      z.object({
        name: text(80),
        price: text(40),
        period: text(40),
        features: list(text(200), 12),
        button: link,
        highlight: z.boolean().catch(false),
      }),
      4,
    ),
  }),
  cta: z.object({
    heading: text(200),
    text: text(600),
    button: link,
  }),
} as const;

export type SectionKind = keyof typeof SECTION_SCHEMAS;
export type SectionData<K extends SectionKind = SectionKind> = z.infer<
  (typeof SECTION_SCHEMAS)[K]
>;

export const SECTION_LABELS: Record<SectionKind, string> = {
  hero: "Hero",
  features: "Features or services",
  gallery: "Gallery",
  testimonials: "Testimonials",
  faq: "Questions and answers",
  pricing: "Pricing",
  cta: "Call to action",
};

export const isSectionKind = (k: unknown): k is SectionKind =>
  typeof k === "string" && k in SECTION_SCHEMAS;

/**
 * Section data from an HTML attribute: URL-encoded JSON as rendered, or
 * plain JSON as agents write it in Markdown.
 */
export function decodeSectionData(value: string | null): unknown {
  if (!value) return {};
  const v = value.trim();
  return JSON.parse(v.startsWith("%7B") ? decodeURIComponent(v) : v);
}

/** Clean data for a kind, whatever came in; never throws. */
export function cleanSection<K extends SectionKind>(
  kind: K,
  raw: unknown,
): SectionData<K> {
  const parsed = SECTION_SCHEMAS[kind].safeParse(raw ?? {});
  return (
    parsed.success ? parsed.data : SECTION_SCHEMAS[kind].parse({})
  ) as SectionData<K>;
}

/** Starting content when a section is added in the editor. */
export const SECTION_DEFAULTS: { [K in SectionKind]: SectionData<K> } = {
  hero: {
    eyebrow: "",
    heading: "A headline that says what you do",
    text: "One or two sentences on who it's for and why it's worth their time.",
    primary: { label: "Get in touch", url: "/contact" },
    secondary: { label: "", url: "" },
    image: { src: "", alt: "" },
    layout: "center",
  },
  features: {
    heading: "What we offer",
    intro: "",
    items: [
      { title: "First thing", text: "What it is and why it matters." },
      { title: "Second thing", text: "What it is and why it matters." },
      { title: "Third thing", text: "What it is and why it matters." },
    ],
    columns: "3",
  },
  gallery: { heading: "", images: [] },
  testimonials: {
    heading: "What people say",
    items: [{ quote: "Their words, in quotes.", name: "Name", role: "" }],
  },
  faq: {
    heading: "Questions and answers",
    items: [
      { question: "A question people ask?", answer: "A clear, short answer." },
    ],
  },
  pricing: {
    heading: "Prices",
    intro: "",
    plans: [
      {
        name: "Basic",
        price: "29",
        period: "per month",
        features: ["What's included"],
        button: { label: "Choose", url: "/contact" },
        highlight: false,
      },
      {
        name: "Plus",
        price: "59",
        period: "per month",
        features: ["Everything in Basic", "And more"],
        button: { label: "Choose", url: "/contact" },
        highlight: true,
      },
    ],
  },
  cta: {
    heading: "Ready to start?",
    text: "",
    button: { label: "Get in touch", url: "/contact" },
  },
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

type Spec = DOMOutputSpec;
const el = (tag: string, cls: string, ...children: Spec[]): Spec =>
  [tag, { class: cls }, ...children] as Spec;
const textEl = (tag: string, cls: string, value: string): Spec[] =>
  value ? [[tag, { class: cls }, value] as Spec] : [];

function button(l: { label: string; url: string }, cls: string): Spec[] {
  return l.label && l.url
    ? [["a", { class: cls, href: l.url }, l.label] as Spec]
    : [];
}

function img(i: { src: string; alt: string }, cls = ""): Spec[] {
  return i.src
    ? [["img", { src: i.src, alt: i.alt, loading: "lazy", class: cls }] as Spec]
    : [];
}

const header = (heading: string, intro = ""): Spec[] =>
  heading || intro
    ? [
        el(
          "div",
          "np-section-head",
          ...textEl("h2", "np-section-title", heading),
          ...textEl("p", "np-section-intro", intro),
        ),
      ]
    : [];

/** The section's HTML, without its wrapper. */
export function sectionBody(kind: SectionKind, raw: unknown): Spec[] {
  switch (kind) {
    case "hero": {
      const d = cleanSection("hero", raw);
      const actions = [
        ...button(d.primary, "np-button"),
        ...button(d.secondary, "np-button np-button-secondary"),
      ];
      return [
        el(
          "div",
          `np-hero np-hero-${d.layout}${d.image.src ? " np-has-image" : ""}`,
          el(
            "div",
            "np-hero-text",
            ...textEl("p", "np-eyebrow", d.eyebrow),
            ...textEl("h2", "np-hero-title", d.heading),
            ...textEl("p", "np-hero-lead", d.text),
            ...(actions.length ? [el("div", "np-actions", ...actions)] : []),
          ),
          ...(d.image.src ? [el("div", "np-hero-media", ...img(d.image))] : []),
        ),
      ];
    }
    case "features": {
      const d = cleanSection("features", raw);
      return [
        ...header(d.heading, d.intro),
        el(
          "div",
          `np-grid np-cols-${d.columns}`,
          ...d.items
            .filter((i) => i.title || i.text)
            .map((i) =>
              el(
                "div",
                "np-feature",
                ...textEl("h3", "np-feature-title", i.title),
                ...textEl("p", "np-feature-text", i.text),
              ),
            ),
        ),
      ];
    }
    case "gallery": {
      const d = cleanSection("gallery", raw);
      return [
        ...header(d.heading),
        el(
          "div",
          "np-gallery",
          ...d.images
            .filter((i) => i.src)
            .map((i) =>
              el(
                "figure",
                "np-gallery-item",
                ...img(i),
                ...textEl("figcaption", "", i.caption),
              ),
            ),
        ),
      ];
    }
    case "testimonials": {
      const d = cleanSection("testimonials", raw);
      return [
        ...header(d.heading),
        el(
          "div",
          "np-grid np-cols-3",
          ...d.items
            .filter((i) => i.quote)
            .map((i) =>
              el(
                "figure",
                "np-quote",
                ["blockquote", {}, ["p", {}, i.quote]] as Spec,
                el(
                  "figcaption",
                  "",
                  ...textEl("strong", "", i.name),
                  ...textEl("span", "np-quote-role", i.role),
                ),
              ),
            ),
        ),
      ];
    }
    case "faq": {
      const d = cleanSection("faq", raw);
      return [
        ...header(d.heading),
        el(
          "div",
          "np-faq",
          ...d.items
            .filter((i) => i.question)
            .map((i) =>
              el(
                "details",
                "np-faq-item",
                ["summary", {}, i.question] as Spec,
                ["p", {}, i.answer] as Spec,
              ),
            ),
        ),
      ];
    }
    case "pricing": {
      const d = cleanSection("pricing", raw);
      return [
        ...header(d.heading, d.intro),
        el(
          "div",
          `np-grid np-cols-${Math.min(3, Math.max(1, d.plans.length))}`,
          ...d.plans
            .filter((p) => p.name)
            .map((p) =>
              el(
                "div",
                `np-plan${p.highlight ? " np-plan-highlight" : ""}`,
                ...textEl("h3", "np-plan-name", p.name),
                el(
                  "p",
                  "np-plan-price",
                  ...textEl("span", "np-price", p.price),
                  ...textEl("span", "np-period", p.period),
                ),
                ...(p.features.length
                  ? [
                      el(
                        "ul",
                        "np-plan-features",
                        ...p.features
                          .filter(Boolean)
                          .map((f) => ["li", {}, f] as Spec),
                      ),
                    ]
                  : []),
                ...button(
                  p.button,
                  p.highlight ? "np-button" : "np-button np-button-secondary",
                ),
              ),
            ),
        ),
      ];
    }
    case "cta": {
      const d = cleanSection("cta", raw);
      return [
        el(
          "div",
          "np-cta",
          ...textEl("h2", "np-section-title", d.heading),
          ...textEl("p", "np-section-intro", d.text),
          ...(button(d.button, "np-button").length
            ? [el("div", "np-actions", ...button(d.button, "np-button"))]
            : []),
        ),
      ];
    }
  }
}

// ---------------------------------------------------------------------------
// Text projections
// ---------------------------------------------------------------------------

const lines = (...parts: string[]) => parts.filter(Boolean).join("\n\n");

/** Plain text, for search, excerpts and AI context. */
export function sectionText(kind: SectionKind, raw: unknown) {
  return sectionMarkdown(kind, raw, (u) => u)
    .replace(/[#*>_]|\[|\]\([^)]*\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Readable Markdown for AI agents and the .md copies of pages. */
export function sectionMarkdown(
  kind: SectionKind,
  raw: unknown,
  absolute: (url: string) => string,
): string {
  const a = (l: { label: string; url: string }) =>
    l.label && l.url ? `[${l.label}](${absolute(l.url)})` : "";
  switch (kind) {
    case "hero": {
      const d = cleanSection("hero", raw);
      return lines(
        d.heading && `## ${d.heading}`,
        d.text,
        [a(d.primary), a(d.secondary)].filter(Boolean).join(" · "),
      );
    }
    case "features": {
      const d = cleanSection("features", raw);
      return lines(
        d.heading && `## ${d.heading}`,
        d.intro,
        d.items
          .map((i) => `- **${i.title}**${i.text ? `: ${i.text}` : ""}`)
          .join("\n"),
      );
    }
    case "gallery": {
      const d = cleanSection("gallery", raw);
      return lines(
        d.heading && `## ${d.heading}`,
        d.images.map((i) => `![${i.alt}](${absolute(i.src)})`).join("\n"),
      );
    }
    case "testimonials": {
      const d = cleanSection("testimonials", raw);
      return lines(
        d.heading && `## ${d.heading}`,
        ...d.items.map(
          (i) =>
            `> ${i.quote}\n>\n> — ${[i.name, i.role].filter(Boolean).join(", ")}`,
        ),
      );
    }
    case "faq": {
      const d = cleanSection("faq", raw);
      return lines(
        d.heading && `## ${d.heading}`,
        ...d.items.map((i) => `### ${i.question}\n\n${i.answer}`),
      );
    }
    case "pricing": {
      const d = cleanSection("pricing", raw);
      return lines(
        d.heading && `## ${d.heading}`,
        d.intro,
        ...d.plans.map((p) =>
          lines(
            `### ${p.name}: ${[p.price, p.period].filter(Boolean).join(" ")}`,
            p.features.map((f) => `- ${f}`).join("\n"),
            a(p.button),
          ),
        ),
      );
    }
    case "cta": {
      const d = cleanSection("cta", raw);
      return lines(d.heading && `## ${d.heading}`, d.text, a(d.button));
    }
  }
}

/**
 * A section as an HTML tag inside Markdown, which the editor reads back:
 * how templates and agents put sections on a page.
 */
export function sectionTag<K extends SectionKind>(
  kind: K,
  data: SectionData<K>,
) {
  const json = JSON.stringify(cleanSection(kind, data))
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<section data-section="${kind}" data-content="${json}"></section>`;
}

/** Questions and answers on a page, for FAQ structured data. */
export function faqItems(
  doc: {
    content?: { type?: string; attrs?: Record<string, unknown> }[];
  } | null,
) {
  return (doc?.content ?? [])
    .filter((n) => n.type === "section" && n.attrs?.kind === "faq")
    .flatMap((n) => cleanSection("faq", n.attrs?.data).items)
    .filter((i) => i.question && i.answer);
}
