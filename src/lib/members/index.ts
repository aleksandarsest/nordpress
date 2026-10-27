import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/db";
import {
  type Membership,
  membershipPlans,
  memberships,
  user,
} from "@/db/schema";
import { hasCap } from "../capabilities";
import { getSettings } from "../options";
import type { Viewer } from "../session";
import {
  createBillingPortal,
  createSubscriptionCheckout,
  stripeConfigured,
} from "../shop/stripe";
import { membershipGrantsAccess } from "./access";

export class MembersError extends Error {}

export { notMembersOnly } from "./sql";

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export async function getMembership(userId: string) {
  const [row] = await db
    .select({ membership: memberships, planName: membershipPlans.name })
    .from(memberships)
    .leftJoin(membershipPlans, eq(membershipPlans.id, memberships.planId))
    .where(eq(memberships.userId, userId));
  return row ? { ...row.membership, planName: row.planName } : null;
}

/** Staff can always read; others need a membership that's in force. */
export const hasMemberAccess = cache(async (viewer: Viewer | null) => {
  if (!viewer) return false;
  if (hasCap(viewer, "edit_posts")) return true;
  return membershipGrantsAccess(await getMembership(viewer.id));
});

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export const planInput = z.object({
  name: z.string().trim().min(1, "Give the plan a name.").max(100),
  description: z.string().trim().max(2000).default(""),
  priceCents: z.number().int().min(0).max(10_000_000),
  interval: z.enum(["month", "year"]).default("month"),
  active: z.boolean().default(true),
});

export async function listPlans(onlyActive = false) {
  const rows = await db
    .select()
    .from(membershipPlans)
    .orderBy(asc(membershipPlans.priceCents), asc(membershipPlans.id));
  return onlyActive ? rows.filter((p) => p.active) : rows;
}

export async function savePlan(input: z.input<typeof planInput>, id?: number) {
  const data = planInput.parse(input);
  if (id) {
    const [row] = await db
      .update(membershipPlans)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(membershipPlans.id, id))
      .returning();
    if (!row) throw new MembersError("That plan no longer exists.");
    return row;
  }
  const [row] = await db.insert(membershipPlans).values(data).returning();
  return row;
}

// ---------------------------------------------------------------------------
// Joining and leaving
// ---------------------------------------------------------------------------

async function setMembership(
  userId: string,
  values: Partial<Omit<Membership, "id" | "userId">>,
) {
  await db
    .insert(memberships)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: memberships.userId,
      set: { ...values, updatedAt: new Date() },
    });
}

/** Returns where to send the person next. */
export async function joinPlan(viewer: Viewer, planId: number) {
  const [plan] = await db
    .select()
    .from(membershipPlans)
    .where(eq(membershipPlans.id, planId));
  if (!plan?.active) throw new MembersError("That plan isn't available.");
  const current = await getMembership(viewer.id);
  if (current?.planId === plan.id && membershipGrantsAccess(current))
    return "/account";

  if (plan.priceCents === 0) {
    await setMembership(viewer.id, {
      planId: plan.id,
      status: "active",
      currentPeriodEnd: null,
      source: "free",
    });
    return "/account?joined=1";
  }
  if (!stripeConfigured())
    throw new MembersError("Paid plans aren't available yet.");
  if (current?.stripeSubscriptionId && membershipGrantsAccess(current))
    throw new MembersError(
      "You already have a paid membership. Change it from your account page.",
    );
  const { shopCurrency } = await getSettings();
  const session = await createSubscriptionCheckout({
    planId: plan.id,
    planName: plan.name,
    priceCents: plan.priceCents,
    currency: shopCurrency,
    interval: plan.interval,
    userId: viewer.id,
    email: viewer.email,
    customerId: current?.stripeCustomerId ?? null,
  });
  return session.url;
}

/** Leaving a free plan ends access now; paid plans are managed on Stripe. */
export async function leaveFreePlan(viewer: Viewer) {
  const current = await getMembership(viewer.id);
  if (!current || current.source === "stripe")
    throw new MembersError("Manage a paid membership through billing.");
  await setMembership(viewer.id, {
    status: "cancelled",
    currentPeriodEnd: null,
  });
}

export async function billingPortalUrl(viewer: Viewer) {
  const current = await getMembership(viewer.id);
  if (!current?.stripeCustomerId || !stripeConfigured())
    throw new MembersError("There's no billing account to manage.");
  return (await createBillingPortal(current.stripeCustomerId)).url;
}

// ---------------------------------------------------------------------------
// Stripe events
// ---------------------------------------------------------------------------

type Subscription = {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  cancel_at?: number | null;
  current_period_end?: number;
  items?: { data?: { current_period_end?: number }[] };
  metadata?: { user_id?: string; plan_id?: string };
};

export async function activateFromCheckout(session: {
  subscription?: string | null;
  customer?: string | null;
  metadata?: { user_id?: string; plan_id?: string };
}) {
  const userId = session.metadata?.user_id;
  const planId = Number(session.metadata?.plan_id);
  if (!userId || !planId || !session.subscription) return;
  await setMembership(userId, {
    planId,
    status: "active",
    currentPeriodEnd: null,
    stripeSubscriptionId: session.subscription,
    stripeCustomerId: session.customer ?? null,
    source: "stripe",
  });
}

export async function syncSubscription(sub: Subscription, deleted = false) {
  const userId = sub.metadata?.user_id;
  if (!userId) return;
  const periodEnd =
    sub.cancel_at ??
    sub.current_period_end ??
    sub.items?.data?.[0]?.current_period_end ??
    null;
  const status: Membership["status"] = deleted
    ? "cancelled"
    : ["active", "trialing"].includes(sub.status)
      ? "active"
      : ["past_due", "unpaid", "incomplete"].includes(sub.status)
        ? "past_due"
        : "cancelled";
  await setMembership(userId, {
    status,
    // Renewing memberships have no end; cancelled ones run to the period's end
    currentPeriodEnd: deleted
      ? new Date()
      : sub.cancel_at_period_end || status === "cancelled"
        ? periodEnd
          ? new Date(periodEnd * 1000)
          : new Date()
        : null,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: sub.customer,
    source: "stripe",
    ...(Number(sub.metadata?.plan_id) && {
      planId: Number(sub.metadata?.plan_id),
    }),
  });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function listMembers() {
  return db
    .select({
      membership: memberships,
      planName: membershipPlans.name,
      userName: user.name,
      email: user.email,
    })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .leftJoin(membershipPlans, eq(membershipPlans.id, memberships.planId))
    .orderBy(desc(memberships.updatedAt));
}

export async function grantMembership(email: string, planId: number) {
  const [person] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()));
  if (!person)
    throw new MembersError(
      "There's no account with that email. They need to register first.",
    );
  await setMembership(person.id, {
    planId,
    status: "active",
    currentPeriodEnd: null,
    source: "admin",
  });
}

export async function revokeMembership(userId: string) {
  const current = await getMembership(userId);
  if (current?.source === "stripe" && membershipGrantsAccess(current))
    throw new MembersError(
      "This is a paid subscription: cancel it in Stripe and access ends with it.",
    );
  await setMembership(userId, { status: "cancelled", currentPeriodEnd: null });
}
