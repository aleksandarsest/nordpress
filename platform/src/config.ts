import { reservedNames } from "./names.ts";

// The platform's settings, all from the environment (see platform/README.md).

function need(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

export const config = {
  /** Sites live at name.<domain>; the platform itself at <domain>. */
  domain: process.env.PLATFORM_DOMAIN ?? "aleksa.me",
  port: Number(process.env.PORT ?? 3100),
  /** Signs session cookies. */
  secret: need("PLATFORM_SECRET"),
  /** The platform's own tables. */
  databaseUrl: need("PLATFORM_DATABASE_URL"),
  /** A role that may create roles and databases, for each site's own. */
  adminDatabaseUrl: need("ADMIN_DATABASE_URL"),
  /** The root helper the platform runs through sudo. */
  helper: process.env.NP_SITE_HELPER ?? "/usr/local/sbin/np-site",
  /** At most this many sites in all, while in beta. */
  maxSites: Number(process.env.MAX_SITES ?? 10),
  sitesPerAccount: Number(process.env.SITES_PER_ACCOUNT ?? 1),
  /** At most this many sites running at once; the least recently visited sleeps. */
  maxAwake: Number(process.env.MAX_AWAKE ?? 2),
  /** A site sleeps after this many minutes without visitors. */
  idleMinutes: Number(process.env.IDLE_MINUTES ?? 15),
  /** Node's heap limit per site, in megabytes. */
  siteHeapMb: Number(process.env.SITE_HEAP_MB ?? 160),
  /** The server's public addresses, which people point their own domains at. */
  publicIp: process.env.PUBLIC_IP ?? "",
  publicIp6: process.env.PUBLIC_IP6 ?? "",
  reserved: reservedNames(process.env.RESERVED_SUBDOMAINS ?? ""),
  /** Email for the sites (password resets, forms, newsletters), shared. */
  smtpUrl: process.env.SMTP_URL ?? "",
  mailFrom: process.env.MAIL_FROM ?? "",
};

export const siteUrl = (sub: string) => `https://${sub}.${config.domain}`;
export const platformUrl = (path = "/") => `https://${config.domain}${path}`;
