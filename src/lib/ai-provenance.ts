// Records where AI-written text entered a post, so editors and (when the
// site chooses) readers can see it. Stored in posts.meta.ai. Pure.

export const AI_SOURCES = {
  "writing-assistant": "the writing assistant",
  assistant: "the admin assistant",
  inbox: "the AI inbox",
  agent: "an AI agent",
  "site-setup": "AI site setup",
  translation: "AI translation",
  "page-draft": "AI page drafting",
} as const;

export type AiSource = keyof typeof AI_SOURCES;

export type AiProvenance = {
  sources: AiSource[];
  firstAt: string;
  lastAt: string;
};

export function aiProvenance(meta: unknown): AiProvenance | null {
  const ai = (meta as { ai?: AiProvenance } | null)?.ai;
  return ai && Array.isArray(ai.sources) && ai.sources.length ? ai : null;
}

export function withAiSource(
  meta: Record<string, unknown> | null | undefined,
  source: AiSource,
  at = new Date(),
): Record<string, unknown> {
  const previous = aiProvenance(meta);
  const iso = at.toISOString();
  return {
    ...(meta ?? {}),
    ai: {
      sources: [...new Set([...(previous?.sources ?? []), source])],
      firstAt: previous?.firstAt ?? iso,
      lastAt: iso,
    } satisfies AiProvenance,
  };
}

/** "the writing assistant and an AI agent" */
export function describeAiSources(sources: AiSource[]) {
  const names = sources.map((s) => AI_SOURCES[s] ?? s);
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
    : (names[0] ?? "");
}
