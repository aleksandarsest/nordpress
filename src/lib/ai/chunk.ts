// Splits a post into passages for embedding. Passages follow paragraph
// boundaries, stay under `maxChars` (about 600 tokens by default), and each
// repeats the title so it is understandable on its own.

export type Chunk = { index: number; content: string };

export function chunkPost(
  title: string,
  text: string,
  {
    maxChars = 2400,
    overlap = 1,
  }: { maxChars?: number; overlap?: number } = {},
): Chunk[] {
  const heading = title.trim() ? `${title.trim()}\n\n` : "";
  const budget = Math.max(200, maxChars - heading.length);
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap((p) => splitLong(p, budget));

  if (paragraphs.length === 0) {
    return heading ? [{ index: 0, content: heading.trim() }] : [];
  }

  const groups: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const para of paragraphs) {
    if (current.length && size + para.length + 2 > budget) {
      groups.push(current);
      // Carry the last paragraph(s) over so ideas spanning a boundary survive
      current = overlap
        ? current
            .slice(-overlap)
            .filter((p) => p.length + para.length + 2 <= budget)
        : [];
      size = current.reduce((n, p) => n + p.length + 2, 0);
    }
    current.push(para);
    size += para.length + 2;
  }
  groups.push(current);

  return groups.map((group, index) => ({
    index,
    content: `${heading}${group.join("\n\n")}`,
  }));
}

// Breaks a paragraph that alone exceeds the budget at sentence boundaries,
// falling back to hard cuts for text without punctuation.
function splitLong(paragraph: string, budget: number): string[] {
  if (paragraph.length <= budget) return [paragraph];
  const sentences = paragraph.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [
    paragraph,
  ];
  const out: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (sentence.length > budget) {
      if (current) out.push(current.trim());
      for (let i = 0; i < sentence.length; i += budget)
        out.push(sentence.slice(i, i + budget).trim());
      current = "";
    } else if (current.length + sentence.length > budget) {
      out.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

// Reciprocal rank fusion: merges ranked id lists into one ranking without
// needing comparable scores. `k` dampens the weight of top positions.
export function fuseRankings<T>(lists: T[][], k = 60): T[] {
  const scores = new Map<T, number>();
  for (const list of lists) {
    for (const [rank, id] of list.entries()) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    }
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
