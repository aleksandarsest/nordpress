import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { doAction } from "./plugins";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Accounts are created by the installer, by administrators, or by
    // open registration (see registerUser), never by the raw endpoint.
    disableSignUp: true,
    minPasswordLength: 8,
  },
  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "subscriber" },
    },
  },
  plugins: [nextCookies()],
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
