import { createHmac, timingSafeEqual } from "node:crypto";

// Links in newsletter emails (confirm, unsubscribe) carry a signature of the
// subscriber id, so nothing extra is stored and links can't be guessed.

export type TokenPurpose = "confirm" | "unsubscribe";

export function subscriberToken(
  secret: string,
  id: number,
  purpose: TokenPurpose,
) {
  return createHmac("sha256", secret)
    .update(`newsletter:${purpose}:${id}`)
    .digest("base64url")
    .slice(0, 32);
}

export function checkSubscriberToken(
  secret: string,
  id: number,
  purpose: TokenPurpose,
  token: string,
) {
  const expected = Buffer.from(subscriberToken(secret, id, purpose));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
