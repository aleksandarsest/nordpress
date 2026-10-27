"use server";

import { APIError } from "better-auth/api";
import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth, createUserWithPassword } from "@/lib/auth";
import { email, type FormState, formError, password, str } from "@/lib/form";
import { installSite, isInstalled } from "@/lib/install";
import { getSettings, SETTINGS_TAG } from "@/lib/options";
import { POSTS_TAG } from "@/lib/posts";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { TERMS_TAG } from "@/lib/terms";

// Only same-site paths: browsers read "/\host" like "//host"
function safeRedirect(target: string) {
  return /^\/(?![/\\])/.test(target) ? target : "/admin";
}

export async function login(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  // Server-side sign-in skips Better Auth's HTTP rate limits, so limit here:
  // per address (spraying) and per account (guessing one password)
  const h = await headers();
  const account = str(formData, "email").trim().toLowerCase();
  const [byIp, byAccount] = await Promise.all([
    rateLimit(`login:ip:${clientIp(h)}`, 20, 15 * 60_000),
    account
      ? rateLimit(`login:account:${account}`, 10, 15 * 60_000)
      : Promise.resolve({ ok: true, retryAfterMs: 0 }),
  ]);
  if (!byIp.ok || !byAccount.ok) {
    const minutes = Math.ceil(
      Math.max(byIp.retryAfterMs, byAccount.retryAfterMs) / 60_000,
    );
    return {
      error: `Too many login attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }
  try {
    await auth.api.signInEmail({
      body: {
        email: str(formData, "email"),
        password: str(formData, "password"),
        rememberMe: formData.get("remember") === "on",
      },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) {
      return { error: "The email address or password is incorrect." };
    }
    return formError(error);
  }
  redirect(safeRedirect(str(formData, "redirect_to")));
}

export async function logout() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login?loggedout=1");
}

const registerSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name."),
  email,
  password,
});

export async function register(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const settings = await getSettings();
  if (!settings.usersCanRegister)
    return { error: "User registration is currently not allowed." };
  try {
    const input = registerSchema.parse(Object.fromEntries(formData));
    await createUserWithPassword({ ...input, role: settings.defaultRole });
    await auth.api.signInEmail({ body: input, headers: await headers() });
  } catch (error) {
    return formError(error);
  }
  // e.g. back to /members after signing up to join
  redirect(safeRedirect(str(formData, "redirect_to") || "/admin"));
}

const installSchema = z.object({
  title: z.string().trim().min(1, "Please enter a site title."),
  name: z.string().trim().min(1, "Please enter a username."),
  email,
  password,
});

export async function install(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  if (await isInstalled()) redirect("/login");
  try {
    const input = installSchema.parse(Object.fromEntries(formData));
    await installSite({
      ...input,
      blogPublic: formData.get("blog_public") !== "on",
    });
    await auth.api.signInEmail({
      body: { email: input.email, password: input.password },
      headers: await headers(),
    });
  } catch (error) {
    return formError(error);
  }
  updateTag(SETTINGS_TAG);
  updateTag(POSTS_TAG);
  updateTag(TERMS_TAG);
  redirect("/admin/setup?installed=1");
}

const RESET_SENT =
  "If an account exists for that address, we've emailed a link to reset the password. Check your inbox (and spam folder).";

export async function requestPasswordReset(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const address = str(formData, "email").trim().toLowerCase();
  if (!email.safeParse(address).success)
    return { error: "Please enter a valid email address." };

  const h = await headers();
  const ip = clientIp(h);
  // Same answer either way, so the form can't be used to find accounts
  if (
    !(await rateLimit(`reset:${ip}`, 5, 15 * 60_000)).ok ||
    !(await rateLimit(`reset:${address}`, 3, 60 * 60_000)).ok
  ) {
    return { message: RESET_SENT };
  }
  try {
    await auth.api.requestPasswordReset({
      body: { email: address, redirectTo: "/reset-password" },
      headers: h,
    });
  } catch (error) {
    console.error("[auth] password reset request failed:", error);
  }
  return { message: RESET_SENT };
}

export async function resetPassword(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = str(formData, "token");
  const newPassword = str(formData, "password");
  if (newPassword !== str(formData, "confirm"))
    return { error: "The passwords don't match." };
  const parsed = password.safeParse(newPassword);
  if (!parsed.success) return formError(parsed.error);
  try {
    await auth.api.resetPassword({ body: { newPassword, token } });
  } catch (error) {
    if (error instanceof APIError) {
      return {
        error:
          "This reset link is invalid or has expired. Please request a new one.",
      };
    }
    return formError(error);
  }
  redirect("/login?reset=1");
}
