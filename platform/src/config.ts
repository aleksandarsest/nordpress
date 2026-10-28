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
  /** A superuser on the same server, for creating each site's database. */
  adminDatabaseUrl: need("ADMIN_DATABASE_URL"),
  /** How sites reach that server from their containers. */
  sitesDatabaseHost: process.env.SITES_DATABASE_HOST ?? "np-db",
  /** The Nordpress image every site runs. */
  image: process.env.NORDPRESS_IMAGE ?? "nordpress:latest",
  /** The Docker network the sites and the platform share. */
  network: process.env.SITES_NETWORK ?? "np-sites",
  /** Volume holding the shared build made from an empty template site. */
  templateVolume: process.env.TEMPLATE_VOLUME ?? "np-template",
  /** At most this many sites in all, while in beta. */
  maxSites: Number(process.env.MAX_SITES ?? 10),
  sitesPerAccount: Number(process.env.SITES_PER_ACCOUNT ?? 1),
  /** Memory limit per site container, in megabytes. */
  siteMemoryMb: Number(process.env.SITE_MEMORY_MB ?? 450),
  reserved: reservedNames(process.env.RESERVED_SUBDOMAINS ?? ""),
  /** Email for the sites (password resets, forms, newsletters), shared. */
  smtpUrl: process.env.SMTP_URL ?? "",
  mailFrom: process.env.MAIL_FROM ?? "",
};

export const siteUrl = (sub: string) => `https://${sub}.${config.domain}`;
export const platformUrl = (path = "/") => `https://${config.domain}${path}`;
