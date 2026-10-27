"use server";

import { refresh } from "next/cache";
import { type FormState, formError, optionalId, str } from "@/lib/form";
import { grantMembership, revokeMembership, savePlan } from "@/lib/members";
import { getSettings } from "@/lib/options";
import { assertCap } from "@/lib/session";
import { parseMoney } from "@/lib/shop/money";

const CAP = "manage_options";

export async function savePlanAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap(CAP);
    const { shopCurrency } = await getSettings();
    const raw = str(formData, "price").trim();
    const price = raw === "" ? 0 : parseMoney(raw, shopCurrency);
    if (price === null)
      throw new Error("Enter the price as a number, e.g. 5 or 49.90.");
    await savePlan(
      {
        name: str(formData, "name"),
        description: str(formData, "description"),
        priceCents: price,
        interval: str(formData, "interval") === "year" ? "year" : "month",
        active: formData.get("active") === "on",
      },
      optionalId(formData, "id") ?? undefined,
    );
  } catch (error) {
    return formError(error);
  }
  refresh();
  return { message: "Plan saved." };
}

export async function grantAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap(CAP);
    await grantMembership(
      str(formData, "email"),
      optionalId(formData, "plan_id") ?? 0,
    );
  } catch (error) {
    return formError(error);
  }
  refresh();
  return { message: "Membership granted." };
}

export async function revokeAction(formData: FormData) {
  await assertCap(CAP);
  await revokeMembership(str(formData, "user_id"));
  refresh();
}
