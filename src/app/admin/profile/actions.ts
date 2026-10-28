"use server";

import { APIError } from "better-auth/api";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { renderSVG } from "uqr";
import { createAppPassword, revokeAppPassword } from "@/lib/app-passwords";
import { auth } from "@/lib/auth";
import { formError, str } from "@/lib/form";
import { disconnectApp } from "@/lib/oauth";
import { getViewer, PermissionError } from "@/lib/session";

export type NewAppPasswordState = {
  error?: string;
  secret?: string;
  name?: string;
} | null;

export async function createAppPasswordAction(
  _: NewAppPasswordState,
  formData: FormData,
): Promise<NewAppPasswordState> {
  try {
    const viewer = await getViewer();
    if (!viewer) throw new PermissionError();
    const created = await createAppPassword(viewer.id, str(formData, "name"));
    refresh();
    return { secret: created.secret, name: created.name };
  } catch (error) {
    return { error: formError(error)?.error };
  }
}

export async function revokeAppPasswordAction(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) throw new PermissionError();
  await revokeAppPassword(viewer.id, str(formData, "id"));
  refresh();
}

export async function disconnectAppAction(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) throw new PermissionError();
  await disconnectApp(viewer.id, str(formData, "client_id"));
  refresh();
}

// ---------------------------------------------------------------------------
// Two-step login (the forms post to Better Auth with the user's session)
// ---------------------------------------------------------------------------

export type TwoFactorState = {
  error?: string;
  message?: string;
  /** Set up: the QR code as SVG and the same secret to type by hand. */
  qr?: string;
  secret?: string;
  backupCodes?: string[];
} | null;

const authError = (error: unknown, fallback: string) =>
  error instanceof APIError
    ? /password/i.test(error.message)
      ? "That password isn't right."
      : fallback
    : formError(error)?.error;

export async function startTwoFactorAction(
  _: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  try {
    const result = await auth.api.enableTwoFactor({
      body: { password: str(formData, "password"), method: "totp" },
      headers: await headers(),
    });
    if (result.method !== "totp") throw new Error("Couldn't start the setup.");
    const { totpURI, backupCodes } = result;
    return {
      qr: renderSVG(totpURI, { border: 2 }),
      secret: new URL(totpURI).searchParams.get("secret") ?? "",
      backupCodes,
    };
  } catch (error) {
    return { error: authError(error, "Couldn't start the setup.") };
  }
}

export async function confirmTwoFactorAction(
  prev: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  try {
    await auth.api.verifyTOTP({
      body: { code: str(formData, "code").replace(/\s+/g, "") },
      headers: await headers(),
    });
  } catch (error) {
    return {
      ...prev,
      error: authError(
        error,
        "That code isn't right. Check the time on your phone and try again.",
      ),
    };
  }
  // Turning it on replaces the session, so load the page fresh with the new
  // cookie rather than re-rendering this request with the old one
  redirect("/admin/profile?security=on");
}

export async function disableTwoFactorAction(
  _: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  try {
    await auth.api.disableTwoFactor({
      body: { password: str(formData, "password") },
      headers: await headers(),
    });
  } catch (error) {
    return { error: authError(error, "Couldn't turn it off.") };
  }
  redirect("/admin/profile?security=off");
}

export async function newBackupCodesAction(
  _: TwoFactorState,
  formData: FormData,
): Promise<TwoFactorState> {
  try {
    const { backupCodes } = await auth.api.generateBackupCodes({
      body: { password: str(formData, "password") },
      headers: await headers(),
    });
    return { backupCodes };
  } catch (error) {
    return { error: authError(error, "Couldn't make new codes.") };
  }
}

export async function deletePasskeyAction(formData: FormData) {
  await auth.api.deletePasskey({
    body: { id: str(formData, "id") },
    headers: await headers(),
  });
  refresh();
}
