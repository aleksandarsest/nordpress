"use server";

import { redirect } from "next/navigation";
import { optionalId } from "@/lib/form";
import {
  billingPortalUrl,
  joinPlan,
  leaveFreePlan,
  MembersError,
} from "@/lib/members";
import { getViewer } from "@/lib/session";
import { StripeError } from "@/lib/shop/stripe";

const fail = (error: unknown, to: string) => {
  if (error instanceof MembersError || error instanceof StripeError)
    redirect(`${to}?error=${encodeURIComponent(error.message)}`);
  throw error;
};

export async function joinPlanAction(formData: FormData) {
  const viewer = await getViewer();
  const planId = optionalId(formData, "plan_id") ?? 0;
  if (!viewer) redirect(`/login?redirect_to=${encodeURIComponent("/members")}`);
  let next: string;
  try {
    next = await joinPlan(viewer, planId);
  } catch (error) {
    return fail(error, "/members");
  }
  redirect(next);
}

export async function leaveAction() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  try {
    await leaveFreePlan(viewer);
  } catch (error) {
    return fail(error, "/account");
  }
  redirect("/account?left=1");
}

export async function billingAction() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  let url: string;
  try {
    url = await billingPortalUrl(viewer);
  } catch (error) {
    return fail(error, "/account");
  }
  redirect(url);
}
