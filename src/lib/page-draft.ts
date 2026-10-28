import { z } from "zod";
import { markdownToHtml } from "./markdown";
import { sectionTag } from "./sections";

// A page drafted by AI from a description: the shape the model answers in,
// and how that becomes page content. Sections go through the same checks
// as every other way in (sectionTag → cleanSection), and the HTML through
// htmlToDoc where it's saved. Pure.

const s = (what: string) => z.string().describe(what);
const button = {
  button_label: s("Button text, or an empty string for no button"),
  button_url: s(
    "Where the button goes: a path from <site_pages>, an #anchor, or a mailto:/tel: link from the description; empty when none fits",
  ),
};

const Block = z.union([
  z.object({
    kind: z.enum(["hero"]),
    eyebrow: s("A few words above the heading, or an empty string"),
    heading: s("The page's main headline, under ten words"),
    text: s("One or two sentences under the headline"),
    ...button,
    layout: z.enum(["center", "split", "cover"]),
  }),
  z.object({
    kind: z.enum(["features"]),
    heading: s("Heading of the section"),
    intro: s("One sentence, or an empty string"),
    items: z
      .array(
        z.object({ title: s("Short title"), text: s("One or two sentences") }),
      )
      .describe("Two to nine services, benefits or steps"),
    columns: z.enum(["2", "3", "4"]),
  }),
  z.object({
    kind: z.enum(["faq"]),
    heading: s("Heading of the section"),
    items: z
      .array(
        z.object({
          question: s("A question visitors ask"),
          answer: s("Its answer"),
        }),
      )
      .describe("Three to eight questions"),
  }),
  z.object({
    kind: z.enum(["pricing"]),
    heading: s("Heading of the section"),
    intro: s("One sentence, or an empty string"),
    plans: z
      .array(
        z.object({
          name: s("Plan or package name"),
          price: s("The price exactly as given in the description"),
          period: s("Like “per month”, or an empty string"),
          features: z.array(s("What it includes")),
          ...button,
          highlight: z
            .boolean()
            .describe("True for at most one recommended plan"),
        }),
      )
      .describe("One to four plans"),
  }),
  z.object({
    kind: z.enum(["cta"]),
    heading: s("A short invitation to act"),
    text: s("One sentence, or an empty string"),
    ...button,
  }),
  z.object({
    kind: z.enum(["text"]),
    markdown: s(
      "Prose in Markdown: paragraphs, ## headings, lists, links. No HTML, no images",
    ),
  }),
]);

export const PageDraftSchema = z.object({
  title: s("The page title, as in a menu: one to four words"),
  description: s(
    "One or two sentences for search results and link previews, under 160 characters",
  ),
  blocks: z
    .array(Block)
    .describe("The page from top to bottom, three to eight blocks"),
});

export type PageDraft = z.infer<typeof PageDraftSchema>;

const link = (label: string, url: string) => ({ label, url });

/** The page as HTML with section tags, ready for htmlToDoc. */
export function draftToHtml(draft: Pick<PageDraft, "blocks">) {
  return draft.blocks
    .slice(0, 12)
    .map((b) => {
      switch (b.kind) {
        case "hero":
          return sectionTag("hero", {
            eyebrow: b.eyebrow,
            heading: b.heading,
            text: b.text,
            primary: link(b.button_label, b.button_url),
            secondary: link("", ""),
            image: { src: "", alt: "" },
            layout: b.layout,
          });
        case "features":
          return sectionTag("features", {
            heading: b.heading,
            intro: b.intro,
            items: b.items,
            columns: b.columns,
          });
        case "faq":
          return sectionTag("faq", { heading: b.heading, items: b.items });
        case "pricing":
          return sectionTag("pricing", {
            heading: b.heading,
            intro: b.intro,
            plans: b.plans.map((p) => ({
              name: p.name,
              price: p.price,
              period: p.period,
              features: p.features,
              button: link(p.button_label, p.button_url),
              highlight: p.highlight,
            })),
          });
        case "cta":
          return sectionTag("cta", {
            heading: b.heading,
            text: b.text,
            button: link(b.button_label, b.button_url),
          });
        case "text":
          return markdownToHtml(b.markdown);
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n");
}
