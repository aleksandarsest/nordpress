import { describe, expect, it } from "vitest";
import { buildWriteMessage, stripFences } from "./write-prompts";

const base = {
  title: "Hello",
  documentText: "First.\n\nSecond.",
  selectionHtml: "",
};

describe("buildWriteMessage", () => {
  it("targets the selected passage when there is one", () => {
    const msg = buildWriteMessage({
      ...base,
      action: "shorter",
      selectionHtml: "<p>Second.</p>",
    });
    expect(msg).toContain("<passage>\n<p>Second.</p>\n</passage>");
    expect(msg).toContain("<task>Rewrite the passage to be about half as long");
  });

  it("targets the whole post without a selection", () => {
    const msg = buildWriteMessage({ ...base, action: "fix" });
    expect(msg).not.toContain("<passage>");
    expect(msg).toContain("in the whole post");
  });

  it("never sends a passage for continue or excerpt", () => {
    const msg = buildWriteMessage({
      ...base,
      action: "excerpt",
      selectionHtml: "<p>x</p>",
    });
    expect(msg).not.toContain("<passage>");
    expect(msg).toContain("plain text");
  });

  it("includes custom instructions", () => {
    const msg = buildWriteMessage({
      ...base,
      action: "custom",
      instruction: "Translate to German",
    });
    expect(msg).toContain(
      "Apply this instruction to the whole post: Translate to German",
    );
  });
});

describe("stripFences", () => {
  it("removes a wrapping code fence", () => {
    expect(stripFences("```html\n<p>Hi</p>\n```")).toBe("<p>Hi</p>");
    expect(stripFences("<p>Hi</p>")).toBe("<p>Hi</p>");
  });
});
