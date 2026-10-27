import { describe, expect, it } from "vitest";
import { memoryRateLimit as rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit within the window, then blocks", () => {
    const t = 1_000_000;
    expect(rateLimit("a", 2, 1000, t).ok).toBe(true);
    expect(rateLimit("a", 2, 1000, t + 10).ok).toBe(true);
    const blocked = rateLimit("a", 2, 1000, t + 20);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(980);
  });

  it("frees capacity as the window slides and keeps keys separate", () => {
    const t = 2_000_000;
    rateLimit("b", 1, 1000, t);
    expect(rateLimit("b", 1, 1000, t + 500).ok).toBe(false);
    expect(rateLimit("c", 1, 1000, t + 500).ok).toBe(true);
    expect(rateLimit("b", 1, 1000, t + 1001).ok).toBe(true);
  });
});
