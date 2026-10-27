// Request limits. By default counters live in Postgres so every server
// instance shares them; RATE_LIMIT_STORE=memory keeps them per process
// (fine for a single server, and used by tests).

export type LimitResult = { ok: boolean; retryAfterMs: number };

const hits = new Map<string, number[]>();
let lastSweep = 0;

// Sliding window kept in memory.
export function memoryRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): LimitResult {
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, times] of hits) {
      if (times.every((t) => now - t > windowMs)) hits.delete(k);
    }
  }
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterMs: windowMs - (now - recent[0]) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true, retryAfterMs: 0 };
}

// Fixed window in Postgres: one atomic upsert per check.
async function postgresRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<LimitResult> {
  const [{ db }, { rateLimits }, { sql, lt }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  const now = Date.now();
  const windowStart = now - (now % windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  // Occasionally drop windows older than a day
  if (Math.random() < 0.01) {
    await db
      .delete(rateLimits)
      .where(lt(rateLimits.windowStart, now - 86_400_000));
  }
  return row.count <= limit
    ? { ok: true, retryAfterMs: 0 }
    : { ok: false, retryAfterMs: windowStart + windowMs - now };
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<LimitResult> {
  if (process.env.RATE_LIMIT_STORE === "memory")
    return memoryRateLimit(key, limit, windowMs);
  try {
    return await postgresRateLimit(key, limit, windowMs);
  } catch (error) {
    // A database hiccup shouldn't lock everyone out; fall back to memory
    console.error("[rate-limit] postgres store failed, using memory:", error);
    return memoryRateLimit(key, limit, windowMs);
  }
}

// Client address as seen through a reverse proxy.
export function clientIp(headers: Headers) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
