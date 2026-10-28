import { describe, expect, it } from "vitest";
import { htmlToDoc, renderContent } from "./content";
import { docToMarkdown, markdownToHtml } from "./markdown";
import {
  cleanSection,
  faqItems,
  SECTION_DEFAULTS,
  SECTION_SCHEMAS,
  type SectionKind,
} from "./sections";

const options = {
  absolute: (u: string) => (u.startsWith("/") ? `https://example.com${u}` : u),
  formUrl: (id: number) => `https://example.com/forms/${id}`,
};
const kinds = Object.keys(SECTION_SCHEMAS) as SectionKind[];
const doc = (kind: SectionKind, data: unknown) => ({
  type: "doc",
  content: [{ type: "section", attrs: { kind, data } }],
});

describe("sections", () => {
  for (const kind of kinds) {
    it(`${kind} survives rendering and an agent's edit`, () => {
      const start = doc(kind, SECTION_DEFAULTS[kind]);
      const { html, text } = renderContent(start);
      expect(html).toContain(`data-section="${kind}"`);
      // The rendered HTML parses back to the same section
      expect(htmlToDoc(html).content?.[0]).toEqual(start.content[0]);
      // So does the editable Markdown agents read and write
      const md = docToMarkdown(start, { ...options, editable: true });
      expect(htmlToDoc(markdownToHtml(md)).content?.[0]).toEqual(
        start.content[0],
      );
      // Readable Markdown and text for everyone else
      expect(docToMarkdown(start, options)).not.toContain("<section");
      if (kind !== "gallery") expect(text.length).toBeGreaterThan(0);
    });
  }

  it("fills in what's missing and drops what's not allowed", () => {
    const hero = cleanSection("hero", {
      heading: "Hi",
      layout: "sideways",
      primary: { label: "Go", url: "javascript:alert(1)" },
      image: { src: "data:image/png;base64,xx", alt: "x" },
      extra: "ignored",
    });
    expect(hero.heading).toBe("Hi");
    expect(hero.layout).toBe("center");
    expect(hero.primary.url).toBe("");
    expect(hero.image.src).toBe("");
    expect(hero).not.toHaveProperty("extra");
  });

  it("can't be used to inject markup", () => {
    const evil = '"><script>alert(1)</script><a href="javascript:x">';
    const { html } = renderContent(
      doc("features", {
        heading: evil,
        items: [{ title: evil, text: evil }],
      }),
    );
    expect(html).not.toMatch(/<script|<a href="javascript/i);
    // The data attribute carries no markup characters at all
    expect(html.match(/data-content="([^"]*)"/)?.[1]).toMatch(
      /^[\w%.!~*'()-]*$/,
    );
    const parsed = htmlToDoc(
      `<section data-section="hero" data-content='{"heading":"x","primary":{"label":"a","url":"javascript:alert(1)"}}'><script>alert(1)</script></section>`,
    );
    expect(JSON.stringify(parsed)).not.toMatch(/javascript|script/);
    // Unknown kinds are not sections at all
    expect(
      JSON.stringify(htmlToDoc('<section data-section="iframe"></section>')),
    ).not.toContain('"section"');
  });

  it("collects questions for FAQ structured data", () => {
    expect(faqItems(doc("faq", SECTION_DEFAULTS.faq))).toEqual([
      { question: "A question people ask?", answer: "A clear, short answer." },
    ]);
  });
});
