import "server-only";
import { and, desc, eq, gte, inArray, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { trafficDaily } from "@/db/schema";
import type { TrafficSource } from "./classify";

// Counting is one upsert per page view, after the response has been sent.
export async function recordHit(hit: {
  path: string;
  source: TrafficSource;
  agent: string;
}) {
  const day = new Date().toISOString().slice(0, 10);
  await db
    .insert(trafficDaily)
    .values({
      day,
      path: hit.path,
      source: hit.source,
      agent: hit.agent,
      hits: 1,
    })
    .onConflictDoUpdate({
      target: [
        trafficDaily.day,
        trafficDaily.path,
        trafficDaily.source,
        trafficDaily.agent,
      ],
      set: { hits: sql`${trafficDaily.hits} + 1` },
    });
}

const HUMAN: TrafficSource[] = [
  "ai_referral",
  "search",
  "social",
  "referral",
  "internal",
  "direct",
];

export async function insightsSummary(days = 30) {
  const since = sql`current_date - ${days - 1}::int`;
  const inRange = gte(trafficDaily.day, since);
  const total = sum(trafficDaily.hits).mapWith(Number);

  const [
    bySource,
    aiReferrers,
    aiCrawlers,
    crawledPages,
    citedPages,
    daily,
    formats,
  ] = await Promise.all([
    db
      .select({ source: trafficDaily.source, hits: total })
      .from(trafficDaily)
      .where(inRange)
      .groupBy(trafficDaily.source),
    db
      .select({ agent: trafficDaily.agent, hits: total })
      .from(trafficDaily)
      .where(and(inRange, eq(trafficDaily.source, "ai_referral")))
      .groupBy(trafficDaily.agent)
      .orderBy(desc(total)),
    db
      .select({ agent: trafficDaily.agent, hits: total })
      .from(trafficDaily)
      .where(and(inRange, eq(trafficDaily.source, "ai_crawler")))
      .groupBy(trafficDaily.agent)
      .orderBy(desc(total)),
    db
      .select({ path: trafficDaily.path, hits: total })
      .from(trafficDaily)
      .where(and(inRange, eq(trafficDaily.source, "ai_crawler")))
      .groupBy(trafficDaily.path)
      .orderBy(desc(total))
      .limit(10),
    db
      .select({ path: trafficDaily.path, hits: total })
      .from(trafficDaily)
      .where(and(inRange, eq(trafficDaily.source, "ai_referral")))
      .groupBy(trafficDaily.path)
      .orderBy(desc(total))
      .limit(10),
    db
      .select({
        day: trafficDaily.day,
        crawls:
          sql<number>`coalesce(sum(${trafficDaily.hits}) filter (where ${trafficDaily.source} = 'ai_crawler'), 0)`.mapWith(
            Number,
          ),
        referrals:
          sql<number>`coalesce(sum(${trafficDaily.hits}) filter (where ${trafficDaily.source} = 'ai_referral'), 0)`.mapWith(
            Number,
          ),
        views:
          sql<number>`coalesce(sum(${trafficDaily.hits}) filter (where ${inArray(trafficDaily.source, HUMAN)}), 0)`.mapWith(
            Number,
          ),
      })
      .from(trafficDaily)
      .where(inRange)
      .groupBy(trafficDaily.day),
    // How much AI crawlers use the Markdown copies and llms.txt
    db
      .select({
        machine:
          sql<number>`coalesce(sum(${trafficDaily.hits}) filter (where ${trafficDaily.path} like '%.md' or ${trafficDaily.path} like '/llms%'), 0)`.mapWith(
            Number,
          ),
        all: total,
      })
      .from(trafficDaily)
      .where(and(inRange, eq(trafficDaily.source, "ai_crawler"))),
  ]);

  const count = (sources: string[]) =>
    bySource
      .filter((r) => sources.includes(r.source))
      .reduce((n, r) => n + (r.hits ?? 0), 0);

  // Every day in the range, including quiet ones
  const byDay = new Map(daily.map((d) => [String(d.day), d]));
  const series = Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.now() - (days - 1 - i) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const d = byDay.get(date);
    return {
      day: date,
      crawls: d?.crawls ?? 0,
      referrals: d?.referrals ?? 0,
      views: d?.views ?? 0,
    };
  });

  return {
    days,
    totals: {
      views: count(HUMAN),
      aiReferrals: count(["ai_referral"]),
      search: count(["search"]),
      aiCrawls: count(["ai_crawler"]),
      searchCrawls: count(["search_crawler"]),
      machineReadable: formats[0]?.machine ?? 0,
    },
    aiReferrers: aiReferrers.map((r) => ({
      label: r.agent,
      hits: r.hits ?? 0,
    })),
    aiCrawlers: aiCrawlers.map((r) => ({ label: r.agent, hits: r.hits ?? 0 })),
    crawledPages: crawledPages.map((r) => ({
      label: r.path,
      hits: r.hits ?? 0,
    })),
    citedPages: citedPages.map((r) => ({ label: r.path, hits: r.hits ?? 0 })),
    series,
  };
}
