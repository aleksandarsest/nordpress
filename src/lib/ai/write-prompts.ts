// Prompt construction for the writing assistant. Kept free of server-only
// imports so it can be unit tested.

export const WRITE_ACTIONS = {
  improve: "Improve writing",
  fix: "Fix spelling & grammar",
  shorter: "Make shorter",
  longer: "Make longer",
  simplify: "Simplify language",
  professional: "Make more professional",
  friendly: "Make more friendly",
  continue: "Continue writing",
  excerpt: "Write an excerpt",
  custom: "Ask AI…",
} as const;

export type WriteAction = keyof typeof WRITE_ACTIONS;

export function isWriteAction(value: string): value is WriteAction {
  return value in WRITE_ACTIONS;
}

export type WriteRequest = {
  action: WriteAction;
  title: string;
  /** The whole post as plain text, for context. */
  documentText: string;
  /** The selected passage as HTML; empty means "the whole post". */
  selectionHtml: string;
  /** Free-form instruction for the "custom" action. */
  instruction?: string;
};

export const WRITE_SYSTEM = `You are the writing assistant inside a website's content editor. An author asks you to write or revise part of a blog post or page.

Reply with only the requested text: no preamble, no explanation, no quotation marks around it, and no Markdown code fences.

Unless told to reply in plain text, reply with an HTML fragment using only these tags: p, h2, h3, h4, strong, em, s, code, a (with href), ul, ol, li, blockquote, pre, br. Never use other tags, attributes, scripts or styles.

Keep the author's language, voice and meaning. Preserve facts, names, numbers and links unless asked to change them. Do not invent facts, quotes or statistics.`;

const TASKS: Record<Exclude<WriteAction, "custom">, string> = {
  improve:
    "Improve the clarity, flow and word choice of the passage while keeping its meaning and length roughly the same.",
  fix: "Correct spelling, grammar and punctuation in the passage. Change nothing else.",
  shorter:
    "Rewrite the passage to be about half as long, keeping the key points.",
  longer:
    "Expand the passage with more detail, examples or explanation, roughly doubling its length. Stay consistent with the rest of the post.",
  simplify:
    "Rewrite the passage in plain language that a general audience can follow easily.",
  professional: "Rewrite the passage in a more professional, polished tone.",
  friendly: "Rewrite the passage in a warmer, more conversational tone.",
  continue:
    "Write the next one or two paragraphs that naturally continue the post from where it ends. Do not repeat what is already written.",
  excerpt:
    "Write a one or two sentence excerpt (at most 50 words) that summarizes the post for listings and search results. Reply in plain text, not HTML.",
};

// Wraps author content in tags so it reads as material to work on, not as
// instructions to follow.
export function buildWriteMessage(req: WriteRequest): string {
  const parts: string[] = [];
  if (req.title.trim())
    parts.push(`<post_title>${req.title.trim()}</post_title>`);
  parts.push(`<post>\n${req.documentText.trim() || "(empty)"}\n</post>`);

  const target = req.selectionHtml.trim();
  if (target && req.action !== "continue" && req.action !== "excerpt") {
    parts.push(`<passage>\n${target}\n</passage>`);
  }

  const scope = target ? "the passage" : "the whole post";
  const task =
    req.action === "custom"
      ? `Apply this instruction to ${scope}: ${req.instruction?.trim() || "Improve it."}`
      : target || req.action === "continue" || req.action === "excerpt"
        ? TASKS[req.action]
        : TASKS[req.action].replaceAll("the passage", "the whole post");
  parts.push(`<task>${task}</task>`);
  return parts.join("\n\n");
}

// Models occasionally wrap HTML in a code fence despite instructions.
export function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```[a-z]*\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}
