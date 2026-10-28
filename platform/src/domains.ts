import { Resolver } from "node:dns/promises";
import { config, siteUrl } from "./config.ts";
import { type Domain, type Site, sql } from "./db.ts";
import { envFile, npSite } from "./host.ts";
import { siteEnv } from "./provision.ts";
import { forget } from "./wake.ts";

// A site's own domain (pekara.me instead of pekara.aleksa.me). The owner
// adds DNS records where they bought the domain; once those point here,
// the domain gets a certificate and becomes the site's address, and the
// old address redirects to it.

// Public resolvers, so a record that was just added is seen
const resolver = new Resolver({ timeout: 5000, tries: 2 });
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

const lookup = (name: string, kind: "A" | "AAAA") =>
  (kind === "A" ? resolver.resolve4(name) : resolver.resolve6(name)).catch(
    () => [] as string[],
  );

export type DnsCheck = {
  /** The domain points here, and nothing sends visitors elsewhere. */
  ready: boolean;
  /** www.<domain> points here too, so it can redirect to the domain. */
  www: boolean;
  /** What to fix, in plain words, when not ready. */
  problem: string | null;
};

export async function checkDns(domain: string): Promise<DnsCheck> {
  const [a, aaaa, wwwA] = await Promise.all([
    lookup(domain, "A"),
    lookup(domain, "AAAA"),
    lookup(`www.${domain}`, "A"),
  ]);
  const www = wwwA.includes(config.publicIp);
  if (a.length === 0)
    return {
      ready: false,
      www,
      problem: `${domain} has no A record yet. Add the records above; they can take a few minutes to show up.`,
    };
  if (!a.includes(config.publicIp))
    return {
      ready: false,
      www,
      problem: `${domain} points to ${a.join(", ")}, not to ${config.publicIp}. Change its A record to ${config.publicIp}.`,
    };
  if (a.length > 1)
    return {
      ready: false,
      www,
      problem: `${domain} has more than one A record. Remove all but ${config.publicIp}.`,
    };
  // Certificate checks prefer IPv6, so a stray AAAA record breaks them
  if (aaaa.length && !aaaa.includes(config.publicIp6))
    return {
      ready: false,
      www,
      problem: `${domain} also has an AAAA (IPv6) record pointing elsewhere. Remove it.`,
    };
  return { ready: true, www, problem: null };
}

/** Points the site at the given URL and restarts it. */
async function moveSite(site: Site, url: string) {
  await npSite("env", site.subdomain, envFile(siteEnv(site, url)));
  forget(site.subdomain);
  await npSite("stop", site.subdomain);
}

/**
 * Checks the domain's DNS and, once it points here, gets its certificate
 * and makes it the site's address. Safe to call again.
 */
export async function connectDomain(site: Site, domain: Domain) {
  const dns = await checkDns(domain.domain);
  if (!dns.ready) {
    await sql`update domains set error = ${dns.problem} where domain = ${domain.domain}`;
    return false;
  }
  try {
    await npSite(
      "domain-add",
      domain.domain,
      undefined,
      dns.www ? ["www"] : [],
    );
  } catch (error) {
    console.error(`[domains] ${domain.domain}`, error);
    await sql`update domains set error = ${"The domain points here, but getting its certificate failed. We'll try again in a few minutes."} where domain = ${domain.domain}`;
    return false;
  }
  await moveSite(site, `https://${domain.domain}`);
  await sql`update domains set status = 'active', www = ${dns.www}, error = null where domain = ${domain.domain}`;
  console.log(`[domains] ${site.subdomain} is now at ${domain.domain}`);
  return true;
}

export async function removeDomain(site: Site, domain: Domain) {
  if (domain.status === "active") await moveSite(site, siteUrl(site.subdomain));
  await npSite("domain-remove", domain.domain).catch((error) =>
    console.error(`[domains] removing ${domain.domain}`, error),
  );
  await sql`delete from domains where domain = ${domain.domain}`;
}

/** Connects domains whose DNS has since been set up. Every few minutes. */
export async function connectPendingDomains() {
  const pending = await sql<(Domain & { site: Site })[]>`
    select d.*, to_jsonb(s) as site from domains d join sites s on s.id = d.site_id
    where d.status = 'pending' and s.status = 'active'
      and d.created_at > now() - interval '7 days'`;
  for (const d of pending) await connectDomain(d.site, d);
}

/**
 * Gives each live site HTTPS at name.<domain>: a certificate of its own,
 * once the name resolves to this server (a *.<domain> DNS record covers
 * every site). Nothing to do where a wildcard certificate is set up.
 */
export async function secureSites() {
  if (!config.publicIp) return;
  const sites = await sql<Site[]>`
    select * from sites where status = 'active' and not https order by id`;
  for (const site of sites) {
    const name = `${site.subdomain}.${config.domain}`;
    const a = await lookup(name, "A");
    if (!a.includes(config.publicIp)) continue;
    try {
      await npSite("site-cert", site.subdomain);
      await sql`update sites set https = true where id = ${site.id}`;
      console.log(`[domains] ${name} has HTTPS`);
    } catch (error) {
      console.error(`[domains] ${name}`, error);
    }
  }
}
