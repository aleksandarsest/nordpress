import { makeExcerpt } from "../content";

// Members-only content: what everyone else sees instead. Pure.

export function isMembersOnly(meta: unknown) {
  return (meta as { membersOnly?: unknown } | null)?.membersOnly === true;
}

/** What non-members get: the excerpt, or the opening words. */
export function teaser(post: { excerpt: string; contentText: string }) {
  return post.excerpt.trim() || makeExcerpt(post.contentText, 55);
}

export type MembershipLike = {
  status: "active" | "past_due" | "cancelled";
  currentPeriodEnd: Date | null;
};

/**
 * Whether a membership grants access now. A payment that failed keeps access
 * while Stripe retries; a cancelled one lasts until the paid period ends.
 */
export function membershipGrantsAccess(
  m: MembershipLike | null | undefined,
  now = new Date(),
) {
  if (!m) return false;
  if (m.currentPeriodEnd && m.currentPeriodEnd <= now) return false;
  if (m.status === "cancelled") return !!m.currentPeriodEnd;
  return true;
}
