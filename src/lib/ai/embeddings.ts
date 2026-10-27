import "server-only";
import { createHash } from "node:crypto";
import {
  and,
  count,
  countDistinct,
  eq,
  inArray,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { cacheLife } from "next/cache";
import { after } from "next/server";
import { VoyageAIClient } from "voyageai";
import { db } from "@/db";
import { EMBEDDING_DIMENSIONS, postChunks, posts } from "@/db/schema";
import { chunkPost } from "./chunk";
import { recordUsage } from "./client";

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "voyage-4";
const BATCH_SIZE = 64;

export function embeddingsConfigured() {
  return !!process.env.VOYAGE_API_KEY;
}

let voyage: VoyageAIClient | undefined;
function client() {
  voyage ??= new VoyageAIClient({
    apiKey: process.env.VOYAGE_API_KEY,
    // Optional override, e.g. for a proxy or a local test double
    baseUrl: process.env.VOYAGE_BASE_URL || undefined,
  });
  return voyage;
}

async function embed(texts: string[], inputType: "query" | "document") {
  const vectors: number[][] = [];
  let tokens = 0;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const res = await client().embed({
      input: texts.slice(i, i + BATCH_SIZE),
      model: EMBEDDING_MODEL,
      inputType,
      outputDimension: EMBEDDING_DIMENSIONS,
    });
    const data = [...(res.data ?? [])].sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0),
    );
    for (const item of data) {
      if (!item.embedding)
        throw new Error("Voyage returned an empty embedding.");
      vectors.push(item.embedding);
    }
    tokens += res.usage?.totalTokens ?? 0;
  }
  await recordUsage({
    userId: null,
    feature: inputType === "query" ? "embed_query" : "embed_index",
    model: EMBEDDING_MODEL,
    usage: { input_tokens: tokens },
  });
  return vectors;
}

// Search queries repeat a lot; cache their embeddings.
export async function embedQuery(query: string): Promise<number[]> {
  "use cache";
  cacheLife("days");
  const [vector] = await embed([query.slice(0, 2000)], "query");
  return vector;
}

const hash = (content: string) =>
  createHash("sha256").update(`${EMBEDDING_MODEL}\n${content}`).digest("hex");

// Published and scheduled public content is indexed; search filters out
// scheduled posts until they go live.
const indexable = and(
  inArray(posts.type, ["post", "page"]),
  inArray(posts.status, ["publish", "future"]),
  sql`${posts.password} is null`,
);

// Brings one post's passages up to date, embedding only what changed.
export async function indexPost(postId: number) {
  const [post] = await db
    .select({
      id: posts.id,
      title: posts.title,
      contentText: posts.contentText,
      excerpt: posts.excerpt,
    })
    .from(posts)
    .where(and(eq(posts.id, postId), indexable));
  if (!post) {
    await db.delete(postChunks).where(eq(postChunks.postId, postId));
    return { chunks: 0, embedded: 0 };
  }

  const body = [post.excerpt, post.contentText].filter(Boolean).join("\n\n");
  const chunks = chunkPost(post.title, body).map((c) => ({
    ...c,
    hash: hash(c.content),
  }));
  const existing = await db
    .select({ hash: postChunks.contentHash, embedding: postChunks.embedding })
    .from(postChunks)
    .where(eq(postChunks.postId, postId));
  const known = new Map(existing.map((e) => [e.hash, e.embedding]));

  const missing = chunks.filter((c) => !known.has(c.hash));
  const fresh = missing.length
    ? await embed(
        missing.map((c) => c.content),
        "document",
      )
    : [];
  for (const [i, c] of missing.entries()) known.set(c.hash, fresh[i]);

  await db.transaction(async (tx) => {
    await tx.delete(postChunks).where(eq(postChunks.postId, postId));
    if (chunks.length) {
      await tx.insert(postChunks).values(
        chunks.map((c) => ({
          postId,
          chunkIndex: c.index,
          content: c.content,
          contentHash: c.hash,
          model: EMBEDDING_MODEL,
          embedding: known.get(c.hash) as number[],
        })),
      );
    }
  });
  return { chunks: chunks.length, embedded: missing.length };
}

// Keeps the index in step with content changes, after the response is sent.
export function queueIndex(postId: number) {
  if (!embeddingsConfigured()) return;
  after(async () => {
    try {
      await indexPost(postId);
    } catch (error) {
      console.error(
        `[ai] indexing post ${postId} failed:`,
        (error as Error).message,
      );
    }
  });
}

let rebuilding = false;

// Re-indexes everything that should be searchable and drops the rest.
export async function rebuildIndex() {
  if (rebuilding) return { started: false };
  rebuilding = true;
  try {
    await db
      .delete(postChunks)
      .where(
        or(
          notInArray(
            postChunks.postId,
            db.select({ id: posts.id }).from(posts).where(indexable),
          ),
          sql`${postChunks.model} <> ${EMBEDDING_MODEL}`,
        ),
      );
    const ids = await db.select({ id: posts.id }).from(posts).where(indexable);
    let failed = 0;
    for (const { id } of ids) {
      try {
        await indexPost(id);
      } catch (error) {
        failed++;
        console.error(
          `[ai] indexing post ${id} failed:`,
          (error as Error).message,
        );
        // A bad key or quota fails every post the same way; stop early
        if (failed >= 3) break;
      }
    }
    return { started: true, failed };
  } finally {
    rebuilding = false;
  }
}

export function isRebuilding() {
  return rebuilding;
}

export async function indexStatus() {
  const [[{ indexed, chunks }], [{ total }]] = await Promise.all([
    db
      .select({ indexed: countDistinct(postChunks.postId), chunks: count() })
      .from(postChunks)
      .where(eq(postChunks.model, EMBEDDING_MODEL)),
    db.select({ total: count() }).from(posts).where(indexable),
  ]);
  return { indexed, total, chunks, model: EMBEDDING_MODEL, rebuilding };
}
