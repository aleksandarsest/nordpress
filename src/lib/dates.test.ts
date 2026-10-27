import { describe, expect, it } from "vitest";
import { formatInZone, parseInZone } from "./dates";

describe("formatInZone", () => {
  const instant = new Date("2026-03-01T23:30:00Z");

  it("formats in the requested timezone, not the server's", () => {
    expect(formatInZone(instant, "UTC", "yyyy-MM-dd HH:mm")).toBe(
      "2026-03-01 23:30",
    );
    expect(formatInZone(instant, "Europe/Belgrade", "yyyy-MM-dd HH:mm")).toBe(
      "2026-03-02 00:30",
    );
    expect(formatInZone(instant, "America/New_York", "MMMM d, yyyy")).toBe(
      "March 1, 2026",
    );
  });
});

describe("parseInZone", () => {
  it("reads wall-clock times in the site timezone", () => {
    expect(
      parseInZone("2026-07-01T12:00:00", "Europe/Belgrade")?.toISOString(),
    ).toBe("2026-07-01T10:00:00.000Z");
    expect(
      parseInZone("2026-01-15 08:30", "America/New_York")?.toISOString(),
    ).toBe("2026-01-15T13:30:00.000Z");
  });

  it("respects explicit offsets and rejects garbage", () => {
    expect(
      parseInZone("2026-07-01T12:00:00Z", "Asia/Tokyo")?.toISOString(),
    ).toBe("2026-07-01T12:00:00.000Z");
    expect(parseInZone("next tuesday", "UTC")).toBeNull();
  });
});
