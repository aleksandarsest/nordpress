"use server";

import { refresh, updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth, createUserWithPassword, setUserPassword } from "@/lib/auth";
import { hasCap } from "@/lib/capabilities";
import { email, type FormState, formError, password, str } from "@/lib/form";
import { mailConfigured } from "@/lib/mail";
import { POSTS_TAG } from "@/lib/posts";
import { resetTwoFactor } from "@/lib/security";
import { assertCap, getViewer, PermissionError } from "@/lib/session";
import {
  countAdministrators,
  deleteUser,
  getUser,
  isRole,
  ROLES,
  updateUserProfile,
} from "@/lib/users";

const newUserSchema = z.object({
  name: z.string().trim().min(1, "Please enter a name."),
  email,
  password,
  role: z.enum(ROLES),
});

export async function createUserAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  let id: string;
  try {
    await assertCap("create_users");
    id = (
      await createUserWithPassword(
        newUserSchema.parse(Object.fromEntries(formData)),
      )
    ).id;
  } catch (error) {
    return formError(error);
  }
  redirect(`/admin/users/${id}?created=1`);
}

const profileSchema = z.object({
  name: z.string().trim().min(1, "Please enter a name."),
  email,
  bio: z.string().max(2000),
  website: z.union([z.literal(""), z.url("Please enter a valid website URL.")]),
});

export async function updateUserAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const viewer = await getViewer();
    if (!viewer) throw new PermissionError();
    const id = str(formData, "id");
    const self = id === viewer.id;
    if (!self && !hasCap(viewer, "edit_users")) throw new PermissionError();

    const target = await getUser(id);
    if (!target) throw new Error("User not found.");

    const profile = profileSchema.parse({
      name: str(formData, "name"),
      email: str(formData, "email"),
      bio: str(formData, "bio"),
      website: str(formData, "website").trim(),
    });

    let role = target.role;
    const requested = str(formData, "role");
    if (
      requested &&
      requested !== target.role &&
      hasCap(viewer, "promote_users")
    ) {
      if (!isRole(requested)) throw new Error("Unknown role.");
      if (
        target.role === "administrator" &&
        (await countAdministrators()) <= 1
      ) {
        throw new Error("The site needs at least one administrator.");
      }
      role = requested;
    }

    await updateUserProfile(id, { ...profile, role });

    const newPassword = str(formData, "new_password");
    if (newPassword) await setUserPassword(id, password.parse(newPassword));

    updateTag(POSTS_TAG);
    refresh();
    return { message: self ? "Profile updated." : "User updated." };
  } catch (error) {
    return formError(error);
  }
}

export async function deleteUserAction(formData: FormData) {
  const viewer = await assertCap("delete_users");
  const id = str(formData, "id");
  if (id === viewer.id)
    throw new PermissionError("You cannot delete your own account here.");
  const target = await getUser(id);
  if (!target) redirect("/admin/users");
  if (target.role === "administrator" && (await countAdministrators()) <= 1) {
    throw new Error("The site needs at least one administrator.");
  }
  const reassign = str(formData, "reassign");
  await deleteUser(id, reassign && reassign !== id ? reassign : null);
  updateTag(POSTS_TAG);
  redirect("/admin/users?deleted=1");
}

export async function sendPasswordResetAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap("edit_users");
    const target = await getUser(str(formData, "id"));
    if (!target) throw new Error("User not found.");
    await auth.api.requestPasswordReset({
      body: { email: target.email, redirectTo: "/reset-password" },
      headers: await headers(),
    });
    return {
      message: mailConfigured()
        ? `A password reset link was emailed to ${target.email}.`
        : "Email isn't set up (SMTP_URL), so the reset link was written to the server log instead.",
    };
  } catch (error) {
    return formError(error);
  }
}

export async function resetTwoFactorAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCap("edit_users");
    const target = await getUser(str(formData, "id"));
    if (!target) throw new Error("User not found.");
    await resetTwoFactor(target.id);
    refresh();
    return {
      message: `Two-step login is off for ${target.name}. They can sign in with their password and set it up again.`,
    };
  } catch (error) {
    return formError(error);
  }
}
