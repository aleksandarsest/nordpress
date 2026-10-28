"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { formError, str } from "@/lib/form";
import {
  NewsletterError,
  subscribe,
  unsubscribe,
  unsubscribeEmail,
} from "@/lib/newsletter";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getViewer } from "@/lib/session";

export type SubscribeState = { ok?: boolean; error?: string } | null;

export async function subscribeAction(
  _: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  // Bots fill in every field; people never see this one
  if (str(formData, "_hp")) return { ok: true };
  const ip = clientIp(await headers());
  if (!(await rateLimit(`newsletter-ip:${ip}`, 10, 60 * 60 * 1000)).ok)
    return { error: "Too many attempts. Please try again later." };
  try {
    await subscribe({
      email: str(formData, "email"),
      name: str(formData, "name"),
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof NewsletterError) return { error: error.message };
    return formError(error);
  }
}

export async function unsubscribeAction(formData: FormData) {
  const ok = await unsubscribe(
    Number(str(formData, "s")) || 0,
    str(formData, "t"),
  );
  redirect(ok ? "/newsletter?unsubscribed=1" : "/newsletter?invalid=1");
}

// From the account page, for the signed-in reader's own address
export async function accountSubscribeAction() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  await subscribe({
    email: viewer.email,
    name: viewer.name,
    source: "account",
  });
  redirect("/account?newsletter=pending");
}

export async function accountUnsubscribeAction() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  await unsubscribeEmail(viewer.email);
  redirect("/account?newsletter=off");
}
