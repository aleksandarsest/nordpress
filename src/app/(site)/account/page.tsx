import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatInZone } from "@/lib/dates";
import { getMembership } from "@/lib/members";
import { membershipGrantsAccess } from "@/lib/members/access";
import { getSettings } from "@/lib/options";
import { getViewer } from "@/lib/session";
import { billingAction, leaveAction } from "../members/actions";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false },
};

export const instant = false;

export default async function AccountPage({
  searchParams,
}: PageProps<"/account">) {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?redirect_to=${encodeURIComponent("/account")}`);
  const [membership, settings, query] = await Promise.all([
    getMembership(viewer.id),
    getSettings(),
    searchParams,
  ]);
  const active = membershipGrantsAccess(membership);
  const until = membership?.currentPeriodEnd
    ? formatInZone(
        membership.currentPeriodEnd,
        settings.timezone,
        settings.dateFormat,
      )
    : null;
  const error = typeof query.error === "string" ? query.error : null;

  return (
    <div className="mx-auto grid max-w-xl gap-6 text-sm">
      <h1 className="font-semibold text-3xl tracking-tight">Your account</h1>
      <p>
        Signed in as <strong>{viewer.name}</strong> ({viewer.email}).
      </p>
      {query.joined && (
        <p role="status" className="rounded-md bg-muted px-3 py-2">
          Welcome!{" "}
          {active
            ? "Your membership is active."
            : "We're confirming your payment; this takes a moment."}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-destructive"
        >
          {error}
        </p>
      )}
      <section className="grid gap-3 rounded-xl border p-5">
        <h2 className="font-semibold text-base">Membership</h2>
        {active && membership ? (
          <>
            <p>
              <strong>{membership.planName ?? "Member"}</strong>
              {membership.status === "past_due" &&
                " · payment failed, please update your card"}
              {until && ` · access until ${until}`}
            </p>
            <div className="flex flex-wrap gap-2">
              {membership.source === "stripe" ? (
                <form action={billingAction}>
                  <button
                    type="submit"
                    className="rounded-lg border px-4 py-2 font-medium"
                  >
                    Manage billing or cancel
                  </button>
                </form>
              ) : membership.source === "free" ? (
                <form action={leaveAction}>
                  <button
                    type="submit"
                    className="rounded-lg border px-4 py-2 font-medium"
                  >
                    Leave membership
                  </button>
                </form>
              ) : null}
              <a href="/members" className="rounded-lg px-4 py-2 underline">
                See plans
              </a>
            </div>
          </>
        ) : (
          <p>
            You're not a member.{" "}
            <a href="/members" className="underline">
              See memberships
            </a>
            .
          </p>
        )}
      </section>
    </div>
  );
}
