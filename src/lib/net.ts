import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Guards for fetching URLs that come from content (imports, links in posts),
// so they can't be used to probe the server's own network.

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

export function isPrivateAddress(address: string) {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    return (
      a === "::1" ||
      a === "::" ||
      a.startsWith("fc") ||
      a.startsWith("fd") ||
      a.startsWith("fe80") ||
      a.startsWith("::ffff:127.") ||
      a.startsWith("::ffff:10.") ||
      a.startsWith("::ffff:192.168.")
    );
  }
  return PRIVATE_V4.some((r) => r.test(address));
}

/** Throws unless the URL is http(s) and resolves only to public addresses. */
export async function assertPublicUrl(url: string | URL) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error("only http(s) URLs are allowed");
  const addresses = await lookup(parsed.hostname, { all: true });
  if (addresses.some((a) => isPrivateAddress(a.address)))
    throw new Error("refusing a private network address");
  return parsed;
}
