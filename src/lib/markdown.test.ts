import { describe, expect, it } from "vitest";
import { htmlToDoc } from "./content";
import { docToMarkdown, markdownToHtml } from "./markdown";

const options = {
  absolute: (url: string) =>
    url.startsWith("/") ? `https://example.com${url}` : url,
  formUrl: (id: number) =>
    `https://example.com/wp-json/nordpress/v1/forms/${id}`,
};
const md = (html: string) => docToMarkdown(htmlToDoc(html), options);

describe("docToMarkdown", () => {
  it("converts headings, paragraphs and inline marks", () => {
    expect(
      md(
        '<h2>Intro</h2><p>Some <strong>bold</strong>, <em>italic</em>, <s>gone</s>, <code>a`b</code> and <a href="/about">a link</a>.</p>',
      ),
    ).toBe(
      "## Intro\n\nSome **bold**, _italic_, ~~gone~~, ``a`b`` and [a link](https://example.com/about).",
    );
  });

  it("escapes Markdown characters in text", () => {
    expect(md("<p>2 * 3 = [six] _ok_</p>")).toBe(
      "2 \\* 3 = \\[six\\] \\_ok\\_",
    );
  });

  it("keeps whitespace outside emphasis markers", () => {
    expect(md("<p>a<strong> b </strong>c</p>")).toBe("a **b** c");
  });

  it("nests lists and quotes", () => {
    expect(
      md(
        '<ul><li><p>One</p><ul><li><p>Inner</p></li></ul></li><li><p>Two</p></li></ul><ol start="3"><li><p>Three</p></li></ol><blockquote><p>Quote</p><p>More</p></blockquote>',
      ),
    ).toBe("- One\n\n  - Inner\n- Two\n\n3. Three\n\n> Quote\n>\n> More");
  });

  it("handles code blocks, rules, images, breaks and forms", () => {
    expect(
      md(
        '<pre><code class="language-ts">const a = 1;</code></pre><hr><img src="/uploads/a.png" alt="A [cat]"><p>line<br>break</p><div data-form="4" data-title="Contact"></div>',
      ),
    ).toBe(
      "```ts\nconst a = 1;\n```\n\n---\n\n![A \\[cat\\]](https://example.com/uploads/a.png)\n\nline\\\nbreak\n\n[Form: Contact](https://example.com/wp-json/nordpress/v1/forms/4) (JSON Schema and submission endpoint)",
    );
  });
});

describe("markdownToHtml", () => {
  it("round-trips through the editor schema", () => {
    const source =
      "## Title\n\nSome **bold** and [a link](https://example.com).\n\n- One\n- Two\n\n```js\nx()\n```";
    expect(docToMarkdown(htmlToDoc(markdownToHtml(source)), options)).toBe(
      source,
    );
  });

  it("drops scripts and unknown HTML", () => {
    const doc = htmlToDoc(
      markdownToHtml(
        'Hi <script>alert(1)</script><img src=x onerror="alert(1)">',
      ),
    );
    expect(JSON.stringify(doc)).not.toMatch(/script|onerror/);
  });

  it("keeps form and video embeds through an edit", () => {
    const html =
      '<p>Before</p><div data-form="7"></div><figure data-video="youtube" data-id="dQw4w9WgXcQ"></figure>';
    const editable = { ...options, editable: true };
    const once = docToMarkdown(htmlToDoc(html), editable);
    const doc = htmlToDoc(markdownToHtml(once));
    expect(doc.content?.map((n) => n.type)).toEqual([
      "paragraph",
      "formEmbed",
      "videoEmbed",
    ]);
    expect(docToMarkdown(doc, editable)).toBe(once);
  });
});
