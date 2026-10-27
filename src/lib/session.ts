import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import type { Role } from "@/db/schema";
import { auth } from "./auth";
import { type Capability, hasCap } from "./capabilities";

export type Viewer = {
  id: string;
  name: string;
  email: string;
  role: Role;
  image: string | null;
};

// The data access layer: every server-side permission check starts here.
export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Session checks compare expiry times, so they must run per request
  await connection();
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;
  const { id, name, email, role, image } = result.user;
  return { id, name, email, role: role as Role, image: image ?? null };
});

export async function requireViewer(cap: Capability = "read") {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!hasCap(viewer, cap)) redirect("/admin?denied=1");
  return viewer;
}

export class PermissionError extends Error {
  constructor(message = "Sorry, you are not allowed to do that.") {
    super(message);
  }
}

// For Server Actions: throw instead of redirecting so the form can show it.
export async function assertCap(cap: Capability) {
  const viewer = await getViewer();
  if (!viewer || !hasCap(viewer, cap)) throw new PermissionError();
  return viewer;
}
