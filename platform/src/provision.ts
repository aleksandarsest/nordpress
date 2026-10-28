import postgres from "postgres";
import { config, siteUrl } from "./config.ts";
import { type Site, sql } from "./db.ts";
import {
  createContainer,
  createVolume,
  removeContainer,
  removeVolume,
  restartContainer,
  runToCompletion,
  startContainer,
} from "./docker.ts";
import { resourceNames } from "./names.ts";

// Creating, upgrading and removing hosted sites. Each site gets its own
// database, its own container and its own volumes, so no site can see
// another's data. They all run one shared build, made from an empty
// template site; a site clears the template's cached pages when it starts.

const admin = () => postgres(config.adminDatabaseUrl, { max: 1 });
const internalUrl = (sub: string) =>
  `http://${resourceNames(sub).container}:3000`;

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
    await db.unsafe(`create database ${safe(database)} owner ${safe(role)}`);
  } finally {
    await db.end();
  }
  // Extensions need a superuser, inside the new database
  const url = new URL(config.adminDatabaseUrl);
  url.pathname = `/${database}`;
  const site = postgres(url.toString(), { max: 1 });
  try {
    await site`create extension if not exists vector`;
  } finally {
    await site.end();
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

function siteEnv(site: Site) {
  const { database, role } = resourceNames(site.subdomain);
  const url = siteUrl(site.subdomain);
  return {
    DATABASE_URL: `postgres://${role}:${site.db_password}@${config.sitesDatabaseHost}:5432/${database}`,
    SITE_URL: url,
    BETTER_AUTH_URL: url,
    BETTER_AUTH_SECRET: site.auth_secret,
    INTERNAL_TOKEN: site.internal_token,
    CRON_SECRET: site.cron_secret,
    SITE_NAME: site.title,
    UPLOADS_DIR: "/app/storage/uploads",
    BACKUP_DIR: "/app/storage/backups",
    NODE_OPTIONS: `--max-old-space-size=${Math.max(128, config.siteMemoryMb - 150)}`,
    ...(config.smtpUrl && { SMTP_URL: config.smtpUrl }),
    ...(config.mailFrom && { MAIL_FROM: config.mailFrom }),
  };
}

/** Copies the shared build into a site's own build volume. */
async function copyTemplate(sub: string) {
  const { nextVolume } = resourceNames(sub);
  const code = await runToCompletion({
    name: `np-copy-${sub}`,
    image: config.image,
    entrypoint: [
      "sh",
      "-c",
      "rm -rf /app/.next/* && cp -a /template/. /app/.next/",
    ],
    env: {},
    mounts: [
      { volume: config.templateVolume, target: "/template", readOnly: true },
      { volume: nextVolume, target: "/app/.next" },
    ],
    network: config.network,
  });
  if (code !== 0) throw new Error("Couldn't copy the site template.");
}

async function waitUntilUp(sub: string, seconds = 180) {
  for (let i = 0; i < seconds; i++) {
    try {
      const res = await fetch(`${internalUrl(sub)}/login`, {
        signal: AbortSignal.timeout(3000),
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
  const r = resourceNames(site.subdomain);
  try {
    await step(site, "Creating the database");
    await createDatabase(site.subdomain, site.db_password);
    await step(site, "Preparing the files");
    await createVolume(r.nextVolume, { "nordpress.site": site.subdomain });
    await createVolume(r.uploadsVolume, { "nordpress.site": site.subdomain });
    await copyTemplate(site.subdomain);
    await step(site, "Starting the site");
    await createContainer({
      name: r.container,
      image: config.image,
      env: siteEnv(site),
      mounts: [
        { volume: r.nextVolume, target: "/app/.next" },
        { volume: r.uploadsVolume, target: "/app/storage" },
      ],
      network: config.network,
      memoryMb: config.siteMemoryMb,
      restart: true,
      labels: { "nordpress.site": site.subdomain },
    });
    await startContainer(r.container);
    await waitUntilUp(site.subdomain);
    await step(site, "Creating your account");
    const res = await fetch(
      `${internalUrl(site.subdomain)}/api/internal/install`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${site.internal_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: site.title, ...owner }),
      },
    );
    if (!res.ok && res.status !== 409)
      throw new Error(
        `Installing failed: ${(await res.json().catch(() => ({}))).error ?? res.status}`,
      );
    await sql`update sites set status = 'active', error = null where id = ${site.id}`;
  } catch (error) {
    console.error(`[provision] ${site.subdomain}`, error);
    await sql`update sites set status = 'failed', error = ${(error as Error).message} where id = ${site.id}`;
  }
}

async function removeResources(site: Site) {
  const r = resourceNames(site.subdomain);
  await removeContainer(r.container);
  await removeVolume(r.nextVolume);
  await removeVolume(r.uploadsVolume);
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

/** Makes the shared build from an empty template site. After each upgrade. */
export async function buildTemplate() {
  const password = "template";
  const db = admin();
  try {
    const [exists] =
      await db`select 1 from pg_roles where rolname = ${resourceNames("template").role}`;
    if (!exists) await createDatabase("template", password);
  } finally {
    await db.end();
  }
  const { database, role } = resourceNames("template");
  await createVolume(config.templateVolume);
  const code = await runToCompletion({
    name: "np-template-build",
    image: config.image,
    entrypoint: [
      "sh",
      "-c",
      "node scripts/migrate.mjs && pnpm build && cp .source-hash .next/.source-hash",
    ],
    env: {
      DATABASE_URL: `postgres://${role}:${password}@${config.sitesDatabaseHost}:5432/${database}`,
      BETTER_AUTH_SECRET: "template-build-only",
      SITE_URL: `https://template.${config.domain}`,
    },
    mounts: [{ volume: config.templateVolume, target: "/app/.next" }],
    network: config.network,
  });
  if (code !== 0)
    throw new Error("The template build failed; see the Docker logs.");
}

/** After a new build: every site gets it and restarts (its data stays). */
export async function upgradeSites() {
  const sites = await sql<Site[]>`select * from sites where status = 'active'`;
  for (const site of sites) {
    await removeContainer(resourceNames(site.subdomain).container);
    await copyTemplate(site.subdomain);
    const r = resourceNames(site.subdomain);
    await createContainer({
      name: r.container,
      image: config.image,
      env: siteEnv(site),
      mounts: [
        { volume: r.nextVolume, target: "/app/.next" },
        { volume: r.uploadsVolume, target: "/app/storage" },
      ],
      network: config.network,
      memoryMb: config.siteMemoryMb,
      restart: true,
      labels: { "nordpress.site": site.subdomain },
    });
    await startContainer(r.container);
    console.log(`[upgrade] ${site.subdomain} restarted on the new build`);
  }
}

export const restartSite = (site: Site) =>
  restartContainer(resourceNames(site.subdomain).container);

/** The scheduled work each site expects from a cron. */
export async function runSiteCrons(kind: "frequent" | "daily") {
  const sites = await sql<Site[]>`select * from sites where status = 'active'`;
  const paths =
    kind === "frequent"
      ? ["/api/cron/newsletter"]
      : ["/api/cron/site-checks", "/api/cron/backup"];
  for (const site of sites)
    for (const path of paths)
      await fetch(`${internalUrl(site.subdomain)}${path}`, {
        headers: { Authorization: `Bearer ${site.cron_secret}` },
        signal: AbortSignal.timeout(60_000),
      }).catch(() => {});
}
