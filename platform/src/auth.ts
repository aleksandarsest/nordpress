import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Platform accounts: scrypt password hashes and signed session cookies.

const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const sign = (secret: string, value: string) =>
  createHmac("sha256", secret).update(value).digest("base64url");

/** A session cookie value: account id, expiry, and a signature over both. */
export function sessionToken(secret: string, accountId: number, days = 30) {
  const expires = Date.now() + days * 86_400_000;
  const value = `${accountId}.${expires}`;
  return `${value}.${sign(secret, value)}`;
}

/** The account id in a valid, unexpired session cookie, or null. */
export function readSession(secret: string, token: string | undefined) {
  if (!token) return null;
  const [id, expires, signature] = token.split(".");
  if (!id || !expires || !signature) return null;
  const expected = Buffer.from(sign(secret, `${id}.${expires}`));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return null;
  if (Number(expires) < Date.now()) return null;
  return Number(id) || null;
}

export const randomSecret = (bytes = 32) =>
  randomBytes(bytes).toString("base64url");
