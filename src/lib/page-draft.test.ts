import { describe, expect, it } from "vitest";
import { htmlToDoc } from "./content";
import { draftToHtml, type PageDraft } from "./page-draft";

const blocks: PageDraft["blocks"] = [
  {
    kind: "hero",
    eyebrow: "Since 1998",
    heading: "Bread baked every morning",
    text: "Sourdough, pastries and cakes from our oven in Kotor.",
    button_label: "See the menu",
    button_url: "/menu",
    layout: "center",
  },
  {
    kind: "features",
    heading: "What we bake",
    intro: "",
    items: [
      { title: "Sourdough", text: "48-hour rise." },
      { title: "Pastries", text: "Butter, never margarine." },
    ],
    columns: "2",
  },
  { kind: "text", markdown: "## Our story\n\nIt started with **one oven**." },
  {
    kind: "faq",
    heading: "Questions",
    items: [{ question: "Do you deliver?", answer: "Within Kotor, yes." }],
  },
  {
    kind: "pricing",
    heading: "Cakes",
    intro: "",
    plans: [
      {
        name: "Birthday cake",
        price: "€30",
        period: "",
        features: ["Serves 10"],
        button_label: "Order",
        button_url: "tel:+38269000000",
        highlight: true,
      },
    ],
  },
  {
    kind: "cta",
    heading: "Come by",
    text: "Open every day from 7.",
    button_label: "Directions",
    button_url: "/contact",
  },
];

describe("drafted pages", () => {
  it("turns blocks into sections and prose, in order", () => {
    const doc = htmlToDoc(draftToHtml({ blocks }));
    const kinds = (doc.content ?? []).map((n) =>
      n.type === "section" ? n.attrs?.kind : n.type,
    );
    expect(kinds).toEqual([
      "hero",
      "features",
      "heading",
      "paragraph",
      "faq",
      "pricing",
      "cta",
    ]);
    const hero = doc.content?.[0].attrs?.data;
    expect(hero.heading).toBe("Bread baked every morning");
    expect(hero.primary).toEqual({ label: "See the menu", url: "/menu" });
    const pricing = doc.content?.[5].attrs?.data;
    expect(pricing.plans[0].button.url).toBe("tel:+38269000000");
  });

  it("drops links that could run code, and HTML in prose", () => {
    const doc = htmlToDoc(
      draftToHtml({
        blocks: [
          {
            kind: "cta",
            heading: "Hi",
            text: "",
            button_label: "Click",
            button_url: "javascript:alert(1)",
          },
          {
            kind: "text",
            markdown:
              'Hello <script>alert(1)</script><img src=x onerror="alert(1)">',
          },
        ],
      }),
    );
    expect(doc.content?.[0].attrs?.data.button.url).toBe("");
    expect(JSON.stringify(doc)).not.toMatch(/script|onerror|<img/);
  });

  it("keeps at most twelve blocks", () => {
    const many = Array.from({ length: 20 }, () => blocks[5]);
    expect(htmlToDoc(draftToHtml({ blocks: many })).content).toHaveLength(12);
  });
});
