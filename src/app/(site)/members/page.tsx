import type { Metadata } from "next";
import { getMembership, listPlans } from "@/lib/members";
import { membershipGrantsAccess } from "@/lib/members/access";
import { getSettings } from "@/lib/options";
import { getViewer } from "@/lib/session";
import { formatMoney } from "@/lib/shop/money";
import { stripeConfigured } from "@/lib/shop/stripe";
import { activeTheme, getThemeOptions } from "@/lib/themes";
import { joinPlanAction } from "./actions";

export const metadata: Metadata = { title: "Membership" };

// Per visitor (their current plan), so it renders on each request
export const instant = false;

export default async function MembersPage({
  searchParams,
}: PageProps<"/members">) {
  const [plans, settings, viewer, theme, query] = await Promise.all([
    listPlans(true),
    getSettings(),
    getViewer(),
    activeTheme(),
    searchParams,
  ]);
  const options = await getThemeOptions(theme.slug);
  const membership = viewer ? await getMembership(viewer.id) : null;
  const current = membershipGrantsAccess(membership)
    ? membership?.planId
    : null;
  const { ArchiveHeader, Empty } = theme.components;
  const paidPossible = stripeConfigured();
  const offered = plans.filter((p) => p.priceCents === 0 || paidPossible);
  const error = typeof query.error === "string" ? query.error : null;

  return (
    <>
      <ArchiveHeader
        title="Membership"
        description="Members get the full posts and pages marked for members."
        options={options}
      />
      {error && (
        <p
          role="alert"
          className="mb-6 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm"
        >
          {error}
        </p>
      )}
      {offered.length === 0 ? (
        <Empty message="Memberships aren't open yet." />
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {offered.map((plan) => (
            <li
              key={plan.id}
              className="grid content-start gap-3 rounded-xl border p-6"
            >
              <h2 className="font-semibold text-xl">{plan.name}</h2>
              <p className="text-2xl">
                {plan.priceCents === 0
                  ? "Free"
                  : `${formatMoney(plan.priceCents, settings.shopCurrency)} / ${plan.interval}`}
              </p>
              {plan.description && (
                <p className="whitespace-pre-wrap text-muted-foreground text-sm">
                  {plan.description}
                </p>
              )}
              {current === plan.id ? (
                <a href="/account" className="text-sm underline">
                  You're a member · Your account
                </a>
              ) : (
                <form action={joinPlanAction}>
                  <input type="hidden" name="plan_id" value={plan.id} />
                  <button
                    type="submit"
                    className="h-10 rounded-lg bg-primary px-5 font-medium text-primary-foreground text-sm"
                  >
                    {viewer
                      ? plan.priceCents
                        ? "Join"
                        : "Join for free"
                      : "Log in to join"}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {!viewer && settings.usersCanRegister && (
        <p className="mt-8 text-muted-foreground text-sm">
          New here?{" "}
          <a href="/register?redirect_to=/members" className="underline">
            Create an account
          </a>{" "}
          first, then choose a plan.
        </p>
      )}
    </>
  );
}
