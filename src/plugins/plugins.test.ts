import { describe, expect, it } from "vitest";
import { findBlockedTerm } from "./comment-blocklist";
import { readingMinutes } from "./reading-time";
import { signPayload } from "./webhooks";

describe("bundled plugins", () => {
  it("estimates reading time, never below one minute", () => {
    expect(readingMinutes("word ".repeat(450), 225)).toBe(2);
    expect(readingMinutes("short", 225)).toBe(1);
  });

  it("matches blocklist terms case-insensitively, ignoring blank lines", () => {
    expect(findBlockedTerm("Buy CHEAP pills", "\ncheap\n")).toBe("cheap");
    expect(findBlockedTerm("hello", "\n\n")).toBeUndefined();
  });

  it("signs webhook bodies with HMAC-SHA256", () => {
    expect(signPayload("{}", "s")).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});
