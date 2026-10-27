import type { JSONContent } from "@tiptap/core";

// Turns a stored editor document into Markdown for AI agents and other
// text-first readers. Pure: URLs are made absolute by the caller's function.

export type MarkdownOptions = {
  /** Makes site-relative links and image sources absolute. */
  absolute: (url: string) => string;
  /** Where agents can read and submit an embedded form. */
  formUrl: (id: number) => string;
};

const ESCAPE = /([\\`*_[\]])/g;

function inline(nodes: JSONContent[] | undefined, o: MarkdownOptions): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "hardBreak") return "\\\n";
      if (node.type !== "text" || !node.text) return "";
      const marks = node.marks ?? [];
      const has = (type: string) => marks.some((m) => m.type === type);
      if (has("code")) {
        // Use a fence longer than any backtick run inside the code
        const ticks = "`".repeat(
          Math.max(0, ...(node.text.match(/`+/g) ?? []).map((m) => m.length)) +
            1,
        );
        const pad = node.text.startsWith("`") || node.text.endsWith("`");
        return pad
          ? `${ticks} ${node.text} ${ticks}`
          : `${ticks}${node.text}${ticks}`;
      }
      let text = node.text.replace(ESCAPE, "\\$1");
      // Emphasis markers can't wrap surrounding whitespace
      const [, lead, core, trail] = text.match(/^(\s*)([\s\S]*?)(\s*)$/) ?? [];
      text = core;
      if (text) {
        if (has("strike")) text = `~~${text}~~`;
        if (has("italic")) text = `_${text}_`;
        if (has("bold")) text = `**${text}**`;
        const link = marks.find((m) => m.type === "link");
        if (link?.attrs?.href)
          text = `[${text}](${o.absolute(String(link.attrs.href))})`;
      }
      return `${lead}${text}${trail}`;
    })
    .join("");
}

const indent = (text: string, prefix: string, first = prefix) =>
  text
    .split("\n")
    .map((line, i) => (line ? (i === 0 ? first : prefix) + line : line))
    .join("\n");

function block(node: JSONContent, o: MarkdownOptions): string {
  const children = () => blocks(node.content, o);
  switch (node.type) {
    case "paragraph":
      return inline(node.content, o);
    case "heading":
      return `${"#".repeat(Number(node.attrs?.level) || 2)} ${inline(node.content, o)}`;
    case "blockquote":
      return children()
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    case "bulletList":
      return (node.content ?? [])
        .map((item) => indent(blocks(item.content, o), "  ", "- "))
        .join("\n");
    case "orderedList": {
      const start = Number(node.attrs?.start) || 1;
      return (node.content ?? [])
        .map((item, i) => {
          const marker = `${start + i}. `;
          return indent(
            blocks(item.content, o),
            " ".repeat(marker.length),
            marker,
          );
        })
        .join("\n");
    }
    case "codeBlock": {
      const code = (node.content ?? []).map((n) => n.text ?? "").join("");
      const fence = code.includes("```") ? "~~~~" : "```";
      return `${fence}${node.attrs?.language ?? ""}\n${code}\n${fence}`;
    }
    case "horizontalRule":
      return "---";
    case "image": {
      const src = node.attrs?.src;
      if (!src) return "";
      const alt = String(node.attrs?.alt ?? "").replace(ESCAPE, "\\$1");
      return `![${alt}](${o.absolute(String(src))})`;
    }
    case "formEmbed": {
      const id = Number(node.attrs?.formId);
      if (!id) return "";
      const title = String(node.attrs?.title || "Form").replace(ESCAPE, "\\$1");
      return `[Form: ${title}](${o.formUrl(id)}) (JSON Schema and submission endpoint)`;
    }
    default:
      return children();
  }
}

function blocks(nodes: JSONContent[] | undefined, o: MarkdownOptions): string {
  return (nodes ?? [])
    .map((n) => block(n, o))
    .filter((text) => text.trim() !== "")
    .join("\n\n");
}

export function docToMarkdown(
  doc: JSONContent | null | undefined,
  options: MarkdownOptions,
): string {
  return blocks(doc?.content, options);
}
