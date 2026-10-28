// Site addresses on the platform: name.<domain>. Pure.

// Names people must not get: the platform's own, common infrastructure
// names, and anything else listed in RESERVED_SUBDOMAINS (e.g. subdomains
// the domain already uses elsewhere)
const BUILT_IN = [
  "www",
  "app",
  "api",
  "admin",
  "administrator",
  "account",
  "accounts",
  "auth",
  "login",
  "signup",
  "register",
  "dashboard",
  "mail",
  "email",
  "smtp",
  "imap",
  "pop",
  "webmail",
  "ftp",
  "ssh",
  "vpn",
  "ns",
  "ns1",
  "ns2",
  "dns",
  "mx",
  "cdn",
  "static",
  "assets",
  "media",
  "img",
  "images",
  "files",
  "status",
  "help",
  "support",
  "docs",
  "blog",
  "news",
  "shop",
  "store",
  "billing",
  "pay",
  "payments",
  "dev",
  "staging",
  "test",
  "demo",
  "beta",
  "internal",
  "root",
  "system",
  "nordpress",
  "platform",
  "cloud",
  "security",
  "template",
  "abuse",
  "postmaster",
  "hostmaster",
  "webmaster",
  "info",
];

export function reservedNames(extra = "") {
  return new Set([
    ...BUILT_IN,
    ...extra
      .split(/[\s,]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  ]);
}

export class NameError extends Error {}

/** A clean subdomain, or an error that says what's wrong. */
export function checkSubdomain(input: string, reserved: Set<string>) {
  const name = input.trim().toLowerCase();
  if (name.length < 3) throw new NameError("Use at least 3 characters.");
  // Each site runs as the Linux user np-<name>, and those stop at 32
  if (name.length > 29) throw new NameError("Use at most 29 characters.");
  if (!/^[a-z0-9-]+$/.test(name))
    throw new NameError("Use only letters, numbers and hyphens.");
  if (name.startsWith("-") || name.endsWith("-") || name.includes("--"))
    throw new NameError(
      "Hyphens can't start or end the name, or come in pairs.",
    );
  if (reserved.has(name)) throw new NameError("That name is taken.");
  return name;
}

/** A suggestion from a site title: "Pekara Sunce!" → "pekara-sunce". */
export function suggestSubdomain(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 29)
    .replace(/-+$/g, "");
}

/** The subdomain a request is for, or null for the platform's own pages. */
export function siteFromHost(host: string | undefined, domain: string) {
  if (!host) return null;
  const h = host.toLowerCase().replace(/:\d+$/, "");
  if (h === domain || h === `www.${domain}`) return null;
  if (!h.endsWith(`.${domain}`)) return null;
  const sub = h.slice(0, -(domain.length + 1));
  return /^[a-z0-9-]+$/.test(sub) ? sub : null;
}

/** System and Postgres names for a site; the subdomain is already checked. */
export function resourceNames(sub: string) {
  const id = sub.replace(/-/g, "_");
  return {
    user: `np-${sub}`,
    dir: `/var/lib/nordpress/sites/${sub}`,
    database: `np_site_${id}`,
    role: `np_site_${id}`,
  };
}

/** The local port a site listens on, from its id; clear of the 3000s and 4000s other apps use. */
export const sitePort = (id: number) => 6100 + Number(id);
