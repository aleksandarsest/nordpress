export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

// Appends -2, -3, … until `isTaken` reports the slug is free.
export async function uniqueSlug(
  base: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || "untitled";
  let candidate = root;
  for (let n = 2; await isTaken(candidate); n++) candidate = `${root}-${n}`;
  return candidate;
}
