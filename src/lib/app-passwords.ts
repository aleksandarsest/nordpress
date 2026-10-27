import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { appPasswords, type Role, user } from "@/db/schema";
import type { Viewer } from "./session";

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const hash = (secret: string) =>
  createHash("sha256").update(secret.replace(/\s+/g, "")).digest("hex");

// 24 random characters shown in groups of four, like WordPress.
function generateSecret() {
  const bytes = randomBytes(24);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join(
    "",
  );
  return chars.match(/.{4}/g)?.join(" ") ?? chars;
}

export async function createAppPassword(userId: string, name: string) {
  const label = name.trim();
  if (!label) throw new Error("Please give the application password a name.");
  const secret = generateSecret();
  const [row] = await db
    .insert(appPasswords)
    .values({ id: randomUUID(), userId, name: label, secretHash: hash(secret) })
    .returning({ id: appPasswords.id, name: appPasswords.name });
  return { ...row, secret };
}

export async function listAppPasswords(userId: string) {
  return db
    .select({
      id: appPasswords.id,
      name: appPasswords.name,
      createdAt: appPasswords.createdAt,
      lastUsedAt: appPasswords.lastUsedAt,
      lastIp: appPasswords.lastIp,
    })
    .from(appPasswords)
    .where(eq(appPasswords.userId, userId))
    .orderBy(desc(appPasswords.createdAt));
}

export async function revokeAppPassword(userId: string, id: string) {
  await db
    .delete(appPasswords)
    .where(and(eq(appPasswords.id, id), eq(appPasswords.userId, userId)));
}

// Resolves an `Authorization: Basic` header made of an email address and an
// application password. Regular account passwords are never accepted here.
export async function authenticateBasic(
  header: string | null,
  ip: string | null,
): Promise<Viewer | null> {
  return (await authenticateAppPassword(header, ip))?.viewer ?? null;
}

// Like authenticateBasic, but also says which application password was used.
export async function authenticateAppPassword(
  header: string | null,
  ip: string | null,
): Promise<{ viewer: Viewer; credential: string } | null> {
  if (!header?.startsWith("Basic ")) return null;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  if (sep < 1) return null;
  const login = decoded.slice(0, sep).trim().toLowerCase();
  const secret = decoded.slice(sep + 1);

  const [row] = await db
    .select({
      passwordId: appPasswords.id,
      passwordName: appPasswords.name,
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      image: user.image,
    })
    .from(appPasswords)
    .innerJoin(user, eq(user.id, appPasswords.userId))
    .where(
      and(eq(appPasswords.secretHash, hash(secret)), eq(user.email, login)),
    );
  if (!row) return null;

  await db
    .update(appPasswords)
    .set({ lastUsedAt: new Date(), lastIp: ip })
    .where(eq(appPasswords.id, row.passwordId));

  return {
    credential: row.passwordName,
    viewer: {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role as Role,
      image: row.image,
    },
  };
}
