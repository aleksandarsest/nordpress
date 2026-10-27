import "server-only";
import { and, cosineDistance, desc, eq, inArray, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db";
import { postChunks, posts } from "@/db/schema";
import { notMembersOnly } from "../members/sql";
import { getSettings } from "../options";
import { postPath } from "../permalinks";
import {
  getPageTree,
  LIVE_POST_SQL,
  POSTS_TAG,
  publishedSummaries,
} from "../posts";
import { siteUrl } from "../site-url";
import { fuseRankings } from "./chunk";
import { embeddingsConfigured, embedQuery } from "./embeddings";

const CANDIDATES = 60;
// Passages farther than this (cosine distance) are treated as unrelated
const MAX_DISTANCE = 0.75;

const tsQuery = (query: string) =>
  sql`websearch_to_tsquery('english', ${query})`;

async function keywordRanking(query: string, types: string[]) {
  const rows = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(
        inArray(posts.type, types),
        LIVE_POST_SQL,
        sql`${posts.searchVector} @@ ${tsQuery(query)}`,
      ),
    )
    .orderBy(desc(sql`ts_rank(${posts.searchVector}, ${tsQuery(query)})`))
    .limit(CANDIDATES);
  return rows.map((r) => r.id);
}

async function nearestChunks(vector: number[], types: string[], limit: number) {
  const distance = cosineDistance(postChunks.embedding, vector);
  return db
    .select({
      postId: postChunks.postId,
      content: postChunks.content,
      title: posts.title,
      type: posts.type,
      slug: posts.slug,
      publishedAt: posts.publishedAt,
      distance: sql<number>`${distance}`.mapWith(Number),
    })
    .from(postChunks)
    .innerJoin(posts, eq(posts.id, postChunks.postId))
    .where(
      and(
        inArray(posts.type, types),
        LIVE_POST_SQL,
        notMembersOnly,
        sql`${distance} < ${MAX_DISTANCE}`,
      ),
    )
    .orderBy(distance)
    .limit(limit);
}

// Ranks live content by meaning and keywords together. Without an embeddings
// key it degrades to keyword search.
export async function hybridSearch(
  query: string,
  page: number,
  perPage: number,
  types = ["post"],
) {
  "use cache";
  cacheTag(POSTS_TAG);
  cacheLife("hours");

  const q = query.trim();
  if (!q) return { items: [], total: 0, page, pages: 1, semantic: false };

  const semantic = embeddingsConfigured();
  let ranking: number[];
  if (semantic) {
    const [keyword, chunks] = await Promise.all([
      keywordRanking(q, types),
      embedQuery(q).then((v) => nearestChunks(v, types, CANDIDATES)),
    ]);
    // Best passage per post decides the post's semantic rank
    const semanticIds = [...new Set(chunks.map((c) => c.postId))];
    ranking = fuseRankings([semanticIds, keyword]);
  } else {
    ranking = await keywordRanking(q, types);
  }

  const total = ranking.length;
  const pageIds = ranking.slice((page - 1) * perPage, page * perPage);
  return {
    items: await publishedSummaries(pageIds),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    semantic,
  };
}

export type RetrievedPassage = {
  postId: number;
  title: string;
  url: string;
  text: string;
};

// Finds the passages most relevant to a question, for grounding chat answers.
export async function retrievePassages(
  question: string,
  limit = 8,
): Promise<RetrievedPassage[]> {
  const settings = await getSettings();
  const tree = await getPageTree();
  const urlFor = (p: {
    postId: number;
    type: string;
    slug: string;
    publishedAt: Date | null;
  }) =>
    siteUrl(
      postPath(
        {
          id: p.postId,
          type: p.type,
          slug: p.slug,
          publishedAt: p.publishedAt,
        },
        settings.permalinkStructure,
        tree.find((t) => t.id === p.postId)?.path,
      ),
    );

  if (embeddingsConfigured()) {
    const chunks = await nearestChunks(
      await embedQuery(question),
      ["post", "page"],
      limit,
    );
    if (chunks.length) {
      return chunks.map((c) => ({
        postId: c.postId,
        title: c.title,
        url: urlFor(c),
        text: c.content,
      }));
    }
  }

  // Keyword fallback: the opening of the best-matching posts
  const ids = (await keywordRanking(question, ["post", "page"])).slice(
    0,
    Math.min(limit, 5),
  );
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      postId: posts.id,
      title: posts.title,
      type: posts.type,
      slug: posts.slug,
      publishedAt: posts.publishedAt,
      text: posts.contentText,
    })
    .from(posts)
    .where(and(inArray(posts.id, ids), notMembersOnly));
  return ids.flatMap((id) => {
    const r = rows.find((row) => row.postId === id);
    return r
      ? [
          {
            postId: r.postId,
            title: r.title,
            url: urlFor(r),
            text: `${r.title}\n\n${r.text.slice(0, 2400)}`,
          },
        ]
      : [];
  });
}
