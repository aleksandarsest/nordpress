import { describe, expect, it } from "vitest";
import { isMembersOnly, membershipGrantsAccess, teaser } from "./access";

const now = new Date("2026-06-01T00:00:00Z");
const later = new Date("2026-07-01T00:00:00Z");
const earlier = new Date("2026-05-01T00:00:00Z");

describe("members access", () => {
  it("reads the members-only flag", () => {
    expect(isMembersOnly({ membersOnly: true })).toBe(true);
    expect(isMembersOnly({ membersOnly: "yes" })).toBe(false);
    expect(isMembersOnly(null)).toBe(false);
  });

  it("shows the excerpt or the opening words as a teaser", () => {
    expect(teaser({ excerpt: " Short. ", contentText: "Long body" })).toBe(
      "Short.",
    );
    const words = Array.from({ length: 80 }, (_, i) => `w${i}`).join(" ");
    expect(teaser({ excerpt: "", contentText: words }).split(" ")).toHaveLength(
      55,
    );
  });

  it("grants access for active and grace-period memberships only", () => {
    expect(membershipGrantsAccess(null, now)).toBe(false);
    expect(
      membershipGrantsAccess({ status: "active", currentPeriodEnd: null }, now),
    ).toBe(true);
    expect(
      membershipGrantsAccess(
        { status: "past_due", currentPeriodEnd: later },
        now,
      ),
    ).toBe(true);
    expect(
      membershipGrantsAccess(
        { status: "active", currentPeriodEnd: earlier },
        now,
      ),
    ).toBe(false);
    // Cancelled but paid until later: keeps access until then
    expect(
      membershipGrantsAccess(
        { status: "cancelled", currentPeriodEnd: later },
        now,
      ),
    ).toBe(true);
    expect(
      membershipGrantsAccess(
        { status: "cancelled", currentPeriodEnd: null },
        now,
      ),
    ).toBe(false);
  });
});
