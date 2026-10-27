// A small in-memory sliding-window limiter. Limits are per server process,
// which is enough to blunt abuse from one visitor; use a shared store (Redis,
// Postgres) when running several instances.

const hits = new Map<string, number[]>();
let lastSweep = 0;

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
) {
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
