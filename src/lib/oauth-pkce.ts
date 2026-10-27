import { createHash, timingSafeEqual } from "node:crypto";

// PKCE (RFC 7636), S256 only: the client proves it started the flow by
// showing the verifier whose hash it sent with the authorization request.
export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function verifyPkce(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const expected = Buffer.from(pkceChallenge(verifier));
  const given = Buffer.from(challenge);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Redirect URIs clients may register: https, or http on loopback only. */
export function allowedRedirectUri(uri: string) {
  try {
    const url = new URL(uri);
    if (url.hash) return false;
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
