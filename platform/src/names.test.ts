import { describe, expect, it } from "vitest";
import {
  hashPassword,
  readSession,
  sessionToken,
  verifyPassword,
} from "./auth.ts";
import {
  checkSubdomain,
  reservedNames,
  resourceNames,
  siteFromHost,
  suggestSubdomain,
} from "./names.ts";

const reserved = reservedNames("dora, novak wiener");

describe("subdomains", () => {
  it("accepts good names and normalizes them", () => {
    expect(checkSubdomain("  Pekara-Sunce ", reserved)).toBe("pekara-sunce");
  });

  it("refuses bad, short, long and reserved names", () => {
    for (const bad of [
      "ab",
      "a_b",
      "-abc",
      "abc-",
      "a--b",
      "x".repeat(30),
      "www",
      "admin",
      "dora",
      "Novak",
    ])
      expect(() => checkSubdomain(bad, reserved), bad).toThrow();
  });

  it("suggests a name from a title", () => {
    expect(suggestSubdomain("Pekara Šunce & Co!")).toBe("pekara-sunce-co");
  });

  it("finds the site a request is for", () => {
    expect(siteFromHost("pekara.aleksa.me", "aleksa.me")).toBe("pekara");
    expect(siteFromHost("Pekara.Aleksa.me:443", "aleksa.me")).toBe("pekara");
    expect(siteFromHost("aleksa.me", "aleksa.me")).toBeNull();
    expect(siteFromHost("www.aleksa.me", "aleksa.me")).toBeNull();
    expect(siteFromHost("evil.com", "aleksa.me")).toBeNull();
    expect(siteFromHost("a.b.aleksa.me", "aleksa.me")).toBeNull();
    expect(siteFromHost("pekaraaleksa.me", "aleksa.me")).toBeNull();
  });

  it("names a site's resources safely", () => {
    expect(resourceNames("pekara-sunce")).toEqual({
      user: "np-pekara-sunce",
      dir: "/var/lib/nordpress/sites/pekara-sunce",
      database: "np_site_pekara_sunce",
      role: "np_site_pekara_sunce",
    });
    // The longest name still makes a valid Linux user name
    const longest = checkSubdomain("x".repeat(29), reserved);
    expect(resourceNames(longest).user.length).toBeLessThanOrEqual(32);
  });
});

describe("accounts", () => {
  it("hashes and checks passwords", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^scrypt\$/);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("signs sessions and rejects tampering and expiry", () => {
    const token = sessionToken("secret", 42);
    expect(readSession("secret", token)).toBe(42);
    expect(readSession("other", token)).toBeNull();
    expect(readSession("secret", token.replace(/^42/, "43"))).toBeNull();
    expect(readSession("secret", sessionToken("secret", 42, -1))).toBeNull();
    expect(readSession("secret", undefined)).toBeNull();
  });
});
