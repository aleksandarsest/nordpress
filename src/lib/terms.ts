import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { posts, postTerms, type Term, terms } from "@/db/schema";
import { slugify, uniqueSlug } from "./slug";

export const TAXONOMIES = {
  category: {
    label: "Categories",
    singular: "Category",
    hierarchical: true,
    base: "category",
  },
  post_tag: {
    label: "Tags",
    singular: "Tag",
    hierarchical: false,
    base: "tag",
  },
} as const;

export type Taxonomy = keyof typeof TAXONOMIES;

export const TERMS_TAG = "terms";

export function isTaxonomy(value: string): value is Taxonomy {
  return value in TAXONOMIES;
}

export type TermWithCount = Term & { count: number };

export async function listTerms(taxonomy: Taxonomy): Promise<TermWithCount[]> {
  "use cache";
  cacheTag(TERMS_TAG);
  cacheLife("max");

  const count = sql<number>`count(${posts.id}) filter (where ${posts.status} = 'publish')`;
  const rows = await db
    .select({ term: terms, count: count.mapWith(Number) })
    .from(terms)
    .leftJoin(postTerms, eq(postTerms.termId, terms.id))
    .leftJoin(posts, eq(posts.id, postTerms.postId))
    .where(eq(terms.taxonomy, taxonomy))
    .groupBy(terms.id)
    .orderBy(asc(terms.name));
  return rows.map((r) => ({ ...r.term, count: r.count }));
}

export async function getTermBySlug(taxonomy: Taxonomy, slug: string) {
  "use cache";
  cacheTag(TERMS_TAG);
  cacheLife("max");

  const [term] = await db
    .select()
    .from(terms)
    .where(and(eq(terms.taxonomy, taxonomy), eq(terms.slug, slug)));
  return term ?? null;
}

export async function getTerm(id: number) {
  const [term] = await db.select().from(terms).where(eq(terms.id, id));
  return term ?? null;
}

async function freeSlug(taxonomy: Taxonomy, base: string, excludeId?: number) {
  return uniqueSlug(base, async (slug) => {
    const [hit] = await db
      .select({ id: terms.id })
      .from(terms)
      .where(and(eq(terms.taxonomy, taxonomy), eq(terms.slug, slug)));
    return !!hit && hit.id !== excludeId;
  });
}

export type TermInput = {
  name: string;
  slug?: string;
  description?: string;
  parentId?: number | null;
};

export async function createTerm(taxonomy: Taxonomy, input: TermInput) {
  const name = input.name.trim();
  if (!name) throw new Error("A name is required.");
  const [term] = await db
    .insert(terms)
    .values({
      taxonomy,
      name,
      slug: await freeSlug(taxonomy, input.slug || name),
      description: input.description ?? "",
      parentId: TAXONOMIES[taxonomy].hierarchical ? input.parentId : null,
    })
    .returning();
  return term;
}

export async function updateTerm(id: number, input: TermInput) {
  const existing = await getTerm(id);
  if (!existing) throw new Error("Term not found.");
  const taxonomy = existing.taxonomy as Taxonomy;
  const name = input.name.trim();
  if (!name) throw new Error("A name is required.");
  if (input.parentId === id)
    throw new Error("A term cannot be its own parent.");

  const [term] = await db
    .update(terms)
    .set({
      name,
      slug:
        input.slug && slugify(input.slug) !== existing.slug
          ? await freeSlug(taxonomy, input.slug, id)
          : existing.slug,
      description: input.description ?? existing.description,
      parentId: TAXONOMIES[taxonomy].hierarchical ? input.parentId : null,
    })
    .where(eq(terms.id, id))
    .returning();
  return term;
}

export async function deleteTerm(id: number, defaultCategoryId: number | null) {
  if (id === defaultCategoryId) {
    throw new Error("The default category cannot be deleted.");
  }
  await db.transaction(async (tx) => {
    // Re-parent children so the hierarchy stays intact
    const [term] = await tx.select().from(terms).where(eq(terms.id, id));
    if (!term) return;
    await tx
      .update(terms)
      .set({ parentId: term.parentId })
      .where(eq(terms.parentId, id));
    await tx.delete(terms).where(eq(terms.id, id));
  });
}

// Resolves tag names to ids, creating any that don't exist yet.
export async function ensureTags(names: string[]): Promise<number[]> {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const ids: number[] = [];
  for (const name of wanted) {
    const [hit] = await db
      .select({ id: terms.id })
      .from(terms)
      .where(
        and(
          eq(terms.taxonomy, "post_tag"),
          sql`lower(${terms.name}) = lower(${name})`,
        ),
      );
    ids.push(hit ? hit.id : (await createTerm("post_tag", { name })).id);
  }
  return ids;
}

export async function getPostTerms(postIds: number[]) {
  if (postIds.length === 0) return new Map<number, Term[]>();
  const rows = await db
    .select({ postId: postTerms.postId, term: terms })
    .from(postTerms)
    .innerJoin(terms, eq(terms.id, postTerms.termId))
    .where(inArray(postTerms.postId, postIds))
    .orderBy(asc(terms.name));
  const byPost = new Map<number, Term[]>();
  for (const { postId, term } of rows) {
    byPost.set(postId, [...(byPost.get(postId) ?? []), term]);
  }
  return byPost;
}
