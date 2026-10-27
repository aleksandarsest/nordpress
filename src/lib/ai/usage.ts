import "server-only";
import { and, count, desc, gte, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";

// List prices in USD per million tokens (input, output, cache read).
const PRICES: Record<
  string,
  { input: number; output: number; cacheRead: number }
> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export const FEATURE_LABELS: Record<string, string> = {
  write: "Writing assistant",
  suggest: "Titles, tags & excerpts",
  alt_text: "Image alt text",
  chat: "Site chat",
  form_draft: "Form drafting",
  assistant: "Admin assistant",
  form_triage: "Form spam triage",
  embed_index: "Search indexing (Voyage)",
  embed_query: "Search queries (Voyage)",
};

export async function usageSummary(days = 30) {
  const since = sql`now() - make_interval(days => ${days})`;
  const rows = await db
    .select({
      feature: aiUsage.feature,
      model: aiUsage.model,
      calls: count(),
      refused: count(sql`case when ${aiUsage.outcome} = 'refused' then 1 end`),
      failed: count(sql`case when ${aiUsage.outcome} = 'error' then 1 end`),
      input: sum(aiUsage.inputTokens).mapWith(Number),
      output: sum(aiUsage.outputTokens).mapWith(Number),
      cacheRead: sum(aiUsage.cacheReadTokens).mapWith(Number),
      cacheWrite: sum(aiUsage.cacheWriteTokens).mapWith(Number),
    })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, since))
    .groupBy(aiUsage.feature, aiUsage.model)
    .orderBy(desc(count()));

  return rows.map((r) => {
    const price = PRICES[r.model];
    // Cache writes cost about 1.25x input; unknown models get no estimate
    const cost = price
      ? ((r.input ?? 0) * price.input +
          (r.cacheWrite ?? 0) * price.input * 1.25 +
          (r.cacheRead ?? 0) * price.cacheRead +
          (r.output ?? 0) * price.output) /
        1_000_000
      : null;
    return { ...r, cost };
  });
}

export async function recentFailures(limit = 5) {
  return db
    .select({
      feature: aiUsage.feature,
      outcome: aiUsage.outcome,
      createdAt: aiUsage.createdAt,
    })
    .from(aiUsage)
    .where(
      and(
        gte(aiUsage.createdAt, sql`now() - interval '7 days'`),
        sql`${aiUsage.outcome} <> 'ok'`,
      ),
    )
    .orderBy(desc(aiUsage.createdAt))
    .limit(limit);
}
