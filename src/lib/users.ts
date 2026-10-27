import "server-only";
import { and, asc, count, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { posts, type Role, roleEnum, user } from "@/db/schema";

export const ROLES = roleEnum.enumValues;

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export async function listUsers(q: { role?: Role; search?: string }) {
  const where: SQL[] = [];
  if (q.role) where.push(eq(user.role, q.role));
  if (q.search) {
    const pattern = `%${q.search}%`;
    where.push(
      or(ilike(user.name, pattern), ilike(user.email, pattern)) as SQL,
    );
  }
  const [items, roleCounts] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        postCount: db.$count(
          posts,
          and(eq(posts.authorId, user.id), eq(posts.type, "post")),
        ),
      })
      .from(user)
      .where(and(...where))
      .orderBy(asc(user.name)),
    db.select({ role: user.role, n: count() }).from(user).groupBy(user.role),
  ]);
  return {
    items,
    counts: Object.fromEntries(roleCounts.map((r) => [r.role, r.n])) as Partial<
      Record<Role, number>
    >,
  };
}

export async function getUser(id: string) {
  const [row] = await db.select().from(user).where(eq(user.id, id));
  return row ?? null;
}

export async function countAdministrators() {
  return db.$count(user, eq(user.role, "administrator"));
}

export async function updateUserProfile(
  id: string,
  values: {
    name: string;
    email: string;
    bio: string;
    website: string;
    role?: Role;
  },
) {
  const email = values.email.trim().toLowerCase();
  const [clash] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));
  if (clash && clash.id !== id) {
    throw new Error("That email address is already used by another account.");
  }
  const [row] = await db
    .update(user)
    .set({ ...values, email })
    .where(eq(user.id, id))
    .returning();
  return row;
}

// Deletes a user, handing their content to another user like WordPress does.
export async function deleteUser(id: string, reassignTo: string | null) {
  await db.transaction(async (tx) => {
    if (reassignTo) {
      await tx
        .update(posts)
        .set({ authorId: reassignTo })
        .where(eq(posts.authorId, id));
    } else {
      await tx.delete(posts).where(eq(posts.authorId, id));
    }
    await tx.delete(user).where(eq(user.id, id));
  });
}
