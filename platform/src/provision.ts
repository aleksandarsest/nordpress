import postgres from "postgres";
import { config, siteUrl } from "./config.ts";
import { type Site, sql } from "./db.ts";
import { envFile, npSite } from "./host.ts";
import { resourceNames, sitePort } from "./names.ts";
import { forget, wake } from "./wake.ts";

// Creating, upgrading and removing hosted sites. Each site runs as its own
// Linux user (a systemd service, nordpress-site@<name>) with its own folder
// and its own database, so no site can see another's data. They all start
// from one shared build, made from an empty site; a site clears that
// build's cached pages when it starts.

const admin = () =>
  postgres(config.adminDatabaseUrl, { max: 1, onnotice: () => {} });
export const internalUrl = (site: Site) =>
  `http://127.0.0.1:${sitePort(site.id)}`;

/** A database every site's is copied from, with pgvector already in it (see the README). */
const TEMPLATE_DATABASE = "np_template";

// Database identifiers come from resourceNames (letters, digits and
// underscores only) and passwords from randomSecret (URL-safe base64), so
// they can be written into the statements directly.
const safe = (s: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error("Unsafe identifier.");
  return s;
};

async function createDatabase(sub: string, password: string) {
  const { database, role } = resourceNames(sub);
  const db = admin();
  try {
    await db.unsafe(
      `create role ${safe(role)} login password '${safe(password)}'`,
    );
    // Without being a superuser, the platform must belong to a role to give it a database
    await db.unsafe(`grant ${safe(role)} to current_user`);
    await db.unsafe(
      `create database ${safe(database)} owner ${safe(role)} template ${TEMPLATE_DATABASE}`,
    );
  } finally {
    await db.end();
  }
}

async function dropDatabase(sub: string) {
  const { database, role } = resourceNames(sub);
  const db = admin();
  try {
    await db.unsafe(`drop database if exists ${safe(database)} with (force)`);
    await db.unsafe(`drop role if exists ${safe(role)}`);
  } finally {
    await db.end();
  }
}

/** A site's settings; `url` is its own domain once that's connected. */
export function siteEnv(site: Site, url = siteUrl(site.subdomain)) {
  const { database, role, dir } = resourceNames(site.subdomain);
  return {
    PORT: String(sitePort(site.id)),
    DATABASE_URL: `postgres://${role}:${site.db_password}@127.0.0.1:5432/${database}`,
    SITE_URL: url,
    BETTER_AUTH_URL: url,
    BETTER_AUTH_SECRET: site.auth_secret,
    INTERNAL_TOKEN: site.internal_token,
    CRON_SECRET: site.cron_secret,
    SITE_NAME: site.title,
    UPLOADS_DIR: `${dir}/storage/uploads`,
    BACKUP_DIR: `${dir}/storage/backups`,
    NODE_OPTIONS: `--max-old-space-size=${config.siteHeapMb}`,
    ...(config.smtpUrl && { SMTP_URL: config.smtpUrl }),
    ...(config.mailFrom && { MAIL_FROM: config.mailFrom }),
  };
}

async function waitUntilUp(site: Site, seconds = 120) {
  for (let i = 0; i < seconds; i++) {
    try {
      const res = await fetch(`${internalUrl(site)}/login`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.status < 500) return;
    } catch {
      // Still starting
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("The site didn't start in time.");
}

const step = (site: Site, message: string) =>
  sql`update sites set error = ${message} where id = ${site.id}`;

/** Creates a site end to end. Runs in the background after signup. */
export async function provisionSite(
  site: Site,
  owner: { name: string; email: string; password: string },
) {
  try {
    await step(site, "Creating the database");
    await createDatabase(site.subdomain, site.db_password);
    await step(site, "Preparing the files");
    await npSite("create", site.subdomain, envFile(siteEnv(site)));
    await step(site, "Starting the site");
    await wake(site.subdomain);
    await waitUntilUp(site);
    await step(site, "Creating your account");
    const res = await fetch(`${internalUrl(site)}/api/internal/install`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${site.internal_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: site.title, ...owner }),
    });
    if (!res.ok && res.status !== 409)
      throw new Error(
        `Installing failed: ${(await res.json().catch(() => ({}))).error ?? res.status}`,
      );
    await sql`update sites set status = 'active', error = null where id = ${site.id}`;
    // HTTPS at name.<domain> right away (domains.ts imports this file, hence the late import)
    await import("./domains.ts").then((d) => d.secureSites()).catch(() => {});
  } catch (error) {
    console.error(`[provision] ${site.subdomain}`, error);
    await sql`update sites set status = 'failed', error = ${(error as Error).message} where id = ${site.id}`;
  }
}

async function removeResources(site: Site) {
  forget(site.subdomain);
  await npSite("remove", site.subdomain);
  await dropDatabase(site.subdomain);
}

/** Removes a site and everything it stored. */
export async function deleteSite(site: Site) {
  await sql`update sites set status = 'deleting' where id = ${site.id}`;
  await removeResources(site);
  await sql`delete from sites where id = ${site.id}`;
}

/** Starts a failed site over from nothing. */
export async function retrySite(
  site: Site,
  owner: { name: string; email: string; password: string },
) {
  await sql`update sites set status = 'creating', error = null where id = ${site.id}`;
  try {
    await removeResources(site);
  } catch (error) {
    console.error(`[provision] ${site.subdomain} cleanup`, error);
    await sql`update sites set status = 'failed', error = ${(error as Error).message} where id = ${site.id}`;
    return;
  }
  await provisionSite(site, owner);
}

/** Downloads the build for the version checked out on the server. */
export const fetchBuild = () => npSite("template");

/** After a new build: every site gets it on its next start (its data stays). */
export async function upgradeSites() {
  const sites = await sql<Site[]>`select * from sites where status = 'active'`;
  for (const site of sites) {
    forget(site.subdomain);
    await npSite("update", site.subdomain);
    console.log(`[upgrade] ${site.subdomain} will start on the new build`);
  }
}

export const restartSite = (site: Site) => npSite("restart", site.subdomain);
