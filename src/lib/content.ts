import type { JSONContent } from "@tiptap/core";
import { generateText } from "@tiptap/core";
import { generateHTML, generateJSON } from "@tiptap/html/server";
import { editorExtensions } from "./editor-extensions";

export const EMPTY_DOC: JSONContent = { type: "doc", content: [] };

// Turns the stored editor document into the HTML and plain-text projections
// used for rendering, feeds, excerpts and full-text search.
export function renderContent(doc: JSONContent | null | undefined) {
  if (!doc?.content?.length) return { html: "", text: "" };
  return {
    html: generateHTML(doc, editorExtensions),
    text: generateText(doc, editorExtensions, { blockSeparator: "\n\n" }),
  };
}

export function makeExcerpt(text: string, words = 55) {
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length <= words) return parts.join(" ");
  return `${parts.slice(0, words).join(" ")}…`;
}

// Parses HTML (e.g. from the REST API or an importer) into an editor
// document. Anything the schema doesn't know is dropped, which also strips
// scripts and event handlers.
export function htmlToDoc(html: string): JSONContent {
  if (!html.trim()) return EMPTY_DOC;
  return generateJSON(html, editorExtensions) as JSONContent;
}
