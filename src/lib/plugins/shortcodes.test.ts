import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  expandShortcodes,
  parseShortcodeAttrs,
} from "./shortcodes";

const echo = (attrs: Record<string, string>, content: string | null) =>
  `<x>${JSON.stringify(attrs)}|${content ?? "null"}</x>`;

describe("shortcodes", () => {
  it("parses quoted, unquoted and positional attributes", () => {
    expect(
      parseShortcodeAttrs(` ids="1,2" Size='large' columns=3 "a.mp4" loop`),
    ).toEqual({
      ids: "1,2",
      size: "large",
      columns: "3",
      0: "a.mp4",
      1: "loop",
    });
  });

  it("decodes the entities and curly quotes editors produce", () => {
    expect(parseShortcodeAttrs(" title=&quot;Tom &amp; Jerry&quot;")).toEqual({
      title: "Tom & Jerry",
    });
    expect(parseShortcodeAttrs(" title=“Hi”")).toEqual({ title: "Hi" });
  });

  it("expands self-closing and enclosing forms", async () => {
    const run = (html: string) => expandShortcodes(html, { b: echo }, null);
    expect(await run(`<p>A [b x="1"] and [b/] end</p>`)).toBe(
      `<p>A <x>{"x":"1"}|null</x> and <x>{}|null</x> end</p>`,
    );
    expect(await run(`<p>A [b]<em>in</em>[/b] end</p>`)).toBe(
      `<p>A <x>{}|<em>in</em></x> end</p>`,
    );
    // As in WordPress, an unclosed [b] before a [b]...[/b] encloses up to it
    expect(await run("[b] x [b]y[/b]")).toBe(`<x>{}| x [b]y</x>`);
  });

  it("unwraps a shortcode alone in its paragraph", async () => {
    const html = await expandShortcodes(
      `<p>[box]</p><p>inside</p><p>[/box]</p>`,
      { box: (_a, content) => `<div>${content}</div>` },
      null,
    );
    expect(html).toBe(`<div><p>inside</p></div>`);
  });

  it("leaves [[escaped]] shortcodes, unknown tags and longer names alone", async () => {
    const html = await expandShortcodes(
      `[[b]] [unknown] [b-wide] [bold]`,
      { b: () => "B" },
      null,
    );
    expect(html).toBe(`[b] [unknown] [b-wide] [bold]`);
  });

  it("passes context and supports async handlers", async () => {
    const html = await expandShortcodes(
      "[who]",
      { who: async (_a, _c, ctx: { name: string }) => ctx.name },
      { name: "Ada" },
    );
    expect(html).toBe("Ada");
  });

  it("escapes HTML", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });
});
