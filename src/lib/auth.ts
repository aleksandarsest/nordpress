import "server-only";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { sendPasswordResetMail } from "./mail";
import { doAction } from "./plugins";
import { siteUrl } from "./site-url";

// Settings are async and auth is configured once at startup, so the
// authenticator label comes from the environment (falling back to the host)
const siteName = () =>
  process.env.SITE_NAME || new URL(siteUrl()).hostname || "Nordpress";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      rateLimit: schema.rateLimit,
      twoFactor: schema.twoFactor,
      passkey: schema.passkey,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Accounts are created by the installer, by administrators, or by
    // open registration (see registerUser), never by the raw endpoint.
    disableSignUp: true,
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: 60 * 60,
    // Signs out every device once the password changes
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Not awaited, so the response time doesn't reveal whether an
      // account exists for the address
      void sendPasswordResetMail(user, url).catch((error) =>
        console.error("[mail] password reset email failed:", error),
      );
    },
  },
  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "subscriber" },
    },
  },
  // Limits for requests to /api/auth/*, stored in Postgres so they're shared
  // by every server instance (on by default in production only)
  rateLimit: {
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 15 * 60, max: 5 },
      "/reset-password": { window: 15 * 60, max: 10 },
    },
  },
  plugins: [
    twoFactor({
      // The name authenticator apps show next to the code
      issuer: siteName(),
      // Off: a person types a code from the app before it's switched on
      skipVerificationOnEnable: false,
      backupCodeOptions: { amount: 10 },
    }),
    passkey({
      // Fixed from the site address, never taken from the request
      rpID: new URL(siteUrl()).hostname,
      rpName: siteName(),
      origin: new URL(siteUrl()).origin,
    }),
    // Must come last, so cookies set by the plugins above reach the browser
    nextCookies(),
  ],
});

export async function createUserWithPassword(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
}) {
  const ctx = await auth.$context;
  const email = input.email.trim().toLowerCase();

  if (await ctx.internalAdapter.findUserByEmail(email)) {
    throw new Error("A user with that email address already exists.");
  }

  const created = await ctx.internalAdapter.createUser(
    { name: input.name, email, role: input.role },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    providerId: "credential",
    accountId: created.id,
    userId: created.id,
    password: await ctx.password.hash(input.password),
  });
  await doAction("user.created", {
    id: created.id,
    name: created.name,
    email: created.email,
    role: input.role,
  });
  return created;
}

export async function setUserPassword(userId: string, password: string) {
  const ctx = await auth.$context;
  await ctx.internalAdapter.updatePassword(
    userId,
    await ctx.password.hash(password),
  );
}
