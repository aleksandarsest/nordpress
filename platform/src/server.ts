import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { posix } from "node:path";
import {
  hashPassword,
  randomSecret,
  readSession,
  sessionToken,
  verifyPassword,
} from "./auth.ts";
import { config } from "./config.ts";
import { type Account, type Domain, migrate, type Site, sql } from "./db.ts";
import {
  connectDomain,
  connectPendingDomains,
  removeDomain,
} from "./domains.ts";
import {
  checkDomain,
  checkSubdomain,
  NameError,
  siteFromHost,
  sitePort,
} from "./names.ts";
import {
  type AccountSite,
  accountPage,
  homePage,
  loginPage,
  notFoundSite,
  signupPage,
} from "./pages.ts";
import {
  deleteSite,
  internalUrl,
  provisionSite,
  retrySite,
} from "./provision.ts";
import { proxyToSite } from "./proxy.ts";
import { awakeSites, forget, serving, startSleeping, wake } from "./wake.ts";

// The platform: the home page and signup at <domain>, and every
// name.<domain> request forwarded to that site's server. nginx in front
// terminates TLS and sends both here.

const COOKIE = "np_session";

function send(
  res: ServerResponse,
  status: number,
  html: string,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...headers,
  });
  res.end(html);
}

const redirect = (
  res: ServerResponse,
  to: string,
  headers: Record<string, string> = {},
  status = 303,
) => {
  res.writeHead(status, { Location: to, ...headers });
  res.end();
};

function cookies(req: IncomingMessage) {
  return Object.fromEntries(
    (req.headers.cookie ?? "")
      .split(";")
      .map((c) => c.trim().split("="))
      .filter(([k]) => k)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]),
  );
}

const sessionCookie = (token: string, maxAge: number) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

async function form(req: IncomingMessage): Promise<Record<string, string>> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) throw new Error("Too much data.");
  }
  return Object.fromEntries(new URLSearchParams(body));
}

// Forms only count when they come from the platform's own pages
function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin ?? req.headers.referer ?? "";
  try {
    return new URL(origin).hostname === config.domain;
  } catch {
    return false;
  }
}

// A few attempts per minute per address, for signup and login
const attempts = new Map<string, number[]>();
function tooMany(req: IncomingMessage, limit = 10) {
  const ip = String(
    req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "",
  )
    .split(",")[0]
    .trim();
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length > limit;
}

async function currentAccount(req: IncomingMessage) {
  const id = readSession(config.secret, cookies(req)[COOKIE]);
  if (!id) return null;
  const [account] = await sql<
    Account[]
  >`select * from accounts where id = ${id}`;
  return account ?? null;
}

const validEmail = (e: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

async function signup(req: IncomingMessage, res: ServerResponse) {
  const values = await form(req);
  const fail = (error: string) =>
    send(res, 400, signupPage({ ...values, password: "" }, error));
  if (tooMany(req)) return fail("Too many attempts. Please wait a minute.");
  const email = (values.email ?? "").trim().toLowerCase();
  const name = (values.name ?? "").trim().slice(0, 200);
  const title = (values.title ?? "").trim().slice(0, 200);
  const password = values.password ?? "";
  if (!validEmail(email)) return fail("That email address isn't valid.");
  if (password.length < 10)
    return fail("Use a password of at least 10 characters.");
  if (!name || !title) return fail("Fill in your name and the site's name.");
  let subdomain: string;
  try {
    subdomain = checkSubdomain(values.subdomain ?? "", config.reserved);
  } catch (error) {
    if (error instanceof NameError) return fail(error.message);
    throw error;
  }

  const [{ n }] = await sql<
    { n: number }[]
  >`select count(*)::int as n from sites`;
  if (n >= config.maxSites)
    return fail("The beta is full for now. We'll open more places soon.");

  const passwordHash = await hashPassword(password);
  let site: Site;
  try {
    site = await sql.begin(async (tx) => {
      const [invite] = await tx`
        update invites set uses_left = uses_left - 1
        where code = ${(values.invite ?? "").trim()} and uses_left > 0
        returning code`;
      if (!invite)
        throw new NameError("That invite code isn't valid or has been used.");
      const [taken] =
        await tx`select 1 from sites where subdomain = ${subdomain}`;
      if (taken) throw new NameError("That address is taken. Try another.");
      const [existing] =
        await tx`select 1 from accounts where email = ${email}`;
      if (existing)
        throw new NameError(
          "There's already an account with that email. Log in instead.",
        );
      const [account] = await tx<Account[]>`
        insert into accounts (email, name, password_hash) values (${email}, ${name}, ${passwordHash})
        returning *`;
      const [created] = await tx<Site[]>`
        insert into sites (account_id, subdomain, title, db_password, auth_secret, internal_token, cron_secret)
        values (${account.id}, ${subdomain}, ${title}, ${randomSecret(24)}, ${randomSecret()}, ${randomSecret()}, ${randomSecret()})
        returning *`;
      return created;
    });
  } catch (error) {
    if (error instanceof NameError) return fail(error.message);
    throw error;
  }
  // The password goes to the new site once, in memory; the platform keeps only its hash
  void provisionSite(site, { name, email, password });
  redirect(res, "/account", {
    "Set-Cookie": sessionCookie(
      sessionToken(config.secret, site.account_id),
      30 * 86_400,
    ),
  });
}

async function login(req: IncomingMessage, res: ServerResponse) {
  const values = await form(req);
  const email = (values.email ?? "").trim().toLowerCase();
  const wrong = () =>
    send(res, 400, loginPage(email, "The email or password is wrong."));
  if (tooMany(req))
    return send(
      res,
      429,
      loginPage(email, "Too many attempts. Please wait a minute."),
    );
  const [account] = await sql<
    Account[]
  >`select * from accounts where email = ${email}`;
  if (
    !account ||
    !(await verifyPassword(values.password ?? "", account.password_hash))
  )
    return wrong();
  redirect(res, "/account", {
    "Set-Cookie": sessionCookie(
      sessionToken(config.secret, account.id),
      30 * 86_400,
    ),
  });
}

async function platform(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `https://${config.domain}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const post = req.method === "POST";
  if (post && !sameOrigin(req)) return send(res, 403, "Forbidden");
  const account = await currentAccount(req);

  if (path === "/" && !post) return send(res, 200, homePage(!!account));
  if (path === "/signup")
    return post
      ? signup(req, res)
      : send(
          res,
          200,
          signupPage({ invite: url.searchParams.get("invite") ?? "" }),
        );
  if (path === "/login")
    return post ? login(req, res) : send(res, 200, loginPage());
  if (path === "/logout" && post)
    return redirect(res, "/", { "Set-Cookie": sessionCookie("", 0) });
  if (path === "/health") return send(res, 200, "ok");

  if (!account) return redirect(res, "/login");
  const sites = await sql<AccountSite[]>`
    select s.*, d.domain as own_domain, d.status as domain_status, d.error as domain_error
    from sites s left join domains d on d.site_id = s.id
    where s.account_id = ${account.id} order by s.id`;

  if (path === "/account")
    return send(res, 200, accountPage(account.email, sites));

  const status = path.match(/^\/sites\/([a-z0-9-]+)\/status$/);
  if (status) {
    const site = sites.find((s) => s.subdomain === status[1]);
    if (!site) return send(res, 404, "Not found");
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        status: site.status,
        step: site.status === "creating" ? site.error : null,
      }),
    );
  }

  const retry = path.match(/^\/sites\/([a-z0-9-]+)\/retry$/);
  if (retry && post) {
    const site = sites.find((s) => s.subdomain === retry[1]);
    const values = await form(req);
    if (site?.status !== "failed") return redirect(res, "/account");
    if (
      tooMany(req) ||
      !(await verifyPassword(values.password ?? "", account.password_hash))
    )
      return send(
        res,
        400,
        accountPage(account.email, sites, "That password is wrong."),
      );
    void retrySite(site, {
      name: account.name || account.email.split("@")[0],
      email: account.email,
      password: values.password,
    });
    return redirect(res, "/account");
  }

  const own = path.match(/^\/sites\/([a-z0-9-]+)\/domain(\/check|\/remove)?$/);
  if (own && post) {
    const site = sites.find((s) => s.subdomain === own[1]);
    const values = await form(req);
    if (site?.status !== "active") return redirect(res, "/account");
    const fail = (error: string) =>
      send(res, 400, accountPage(account.email, sites, error));
    const [current] = await sql<
      Domain[]
    >`select * from domains where site_id = ${site.id}`;
    if (own[2] === "/remove") {
      if (current) await removeDomain(site, current);
      return redirect(res, "/account");
    }
    if (own[2] === "/check") {
      if (current?.status === "pending") await connectDomain(site, current);
      return redirect(res, "/account");
    }
    if (current) return fail("Remove the current domain first.");
    let domain: string;
    try {
      domain = checkDomain(values.domain ?? "", config.domain);
    } catch (error) {
      if (error instanceof NameError) return fail(error.message);
      throw error;
    }
    if (!config.publicIp) return fail("Own domains aren't available yet.");
    const [added] = await sql<Domain[]>`
      insert into domains (domain, site_id) values (${domain}, ${site.id})
      on conflict do nothing returning *`;
    if (!added) return fail(`${domain} is already used by another site.`);
    // It may already point here: then it's connected right away
    await connectDomain(site, added);
    return redirect(res, "/account");
  }

  const del = path.match(/^\/sites\/([a-z0-9-]+)\/delete$/);
  if (del && post) {
    const site = sites.find((s) => s.subdomain === del[1]);
    const values = await form(req);
    if (!site) return send(res, 404, "Not found");
    if ((values.confirm ?? "").trim() !== site.subdomain)
      return send(
        res,
        400,
        accountPage(
          account.email,
          sites,
          `Type ${site.subdomain} to confirm deleting it.`,
        ),
      );
    const [current] = await sql<
      Domain[]
    >`select * from domains where site_id = ${site.id}`;
    if (current) await removeDomain(site, current);
    await deleteSite(site);
    return redirect(res, "/account");
  }

  send(res, 404, homePage(true));
}

const STARTING =
  '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>One moment</title><p style="font:17px system-ui;margin:4rem auto;max-width:30rem;padding:0 1rem">This site is being set up or restarted. Try again in a minute.</p>';

type Routed = {
  id: number;
  status: Site["status"];
  subdomain: string;
  own_domain: string | null;
};

/** The site a request is for: by name.<domain>, or by the site's own domain. */
async function routeHost(host: string) {
  const sub = siteFromHost(host, config.domain);
  if (sub) {
    const [site] = await sql<Routed[]>`
      select s.id, s.status, s.subdomain, d.domain as own_domain
      from sites s left join domains d on d.site_id = s.id and d.status = 'active'
      where s.subdomain = ${sub}`;
    return { sub, site };
  }
  if (host === config.domain || host === `www.${config.domain}`) return null;
  const [site] = await sql<Routed[]>`
    select s.id, s.status, s.subdomain, d.domain as own_domain
    from domains d join sites s on s.id = d.site_id
    where d.status = 'active' and d.domain = ${host.replace(/^www\./, "")}`;
  return site ? { sub: site.subdomain, site } : null;
}

const server = createServer(async (req, res) => {
  try {
    const host = (req.headers.host ?? "").toLowerCase().replace(/:\d+$/, "");
    const routed = await routeHost(host);
    if (routed) {
      const { sub, site } = routed;
      if (!site) return send(res, 404, notFoundSite(sub));
      // A site with its own domain lives there; other addresses redirect
      if (site.own_domain && host !== site.own_domain)
        return redirect(
          res,
          `https://${site.own_domain}${req.url ?? "/"}`,
          {},
          301,
        );
      if (site.status !== "active") return send(res, 503, STARTING);
      // Only the platform talks to a site's internal endpoints, from inside
      const path = posix.normalize(
        `/${decodeURIComponent((req.url ?? "/").split("?")[0])}`,
      );
      if (/^\/api\/internal/i.test(path)) return send(res, 404, "Not found");
      try {
        await wake(sub);
      } catch (error) {
        console.error(`[wake] ${sub}`, error);
        return send(res, 503, STARTING);
      }
      const finished = serving(sub);
      let settled = false;
      return proxyToSite(sitePort(site.id), req, res, (failed) => {
        if (settled) return;
        settled = true;
        finished();
        // Not answering: the next request starts it again
        if (failed) forget(sub);
      });
    }
    await platform(req, res);
  } catch (error) {
    console.error("[platform]", error);
    if (!res.headersSent)
      send(res, 500, "Something went wrong. Please try again.");
    else res.end();
  }
});

await migrate();
server.listen(config.port, () =>
  console.log(`[platform] listening on ${config.port} for ${config.domain}`),
);

await startSleeping(
  (await sql<Site[]>`select subdomain from sites where status = 'active'`).map(
    (s) => s.subdomain,
  ),
);

async function cron(site: Site, path: string) {
  await fetch(`${internalUrl(site)}${path}`, {
    headers: { Authorization: `Bearer ${site.cron_secret}` },
    signal: AbortSignal.timeout(120_000),
  }).catch((error) => console.error(`[cron] ${site.subdomain}${path}`, error));
}

// Each site's scheduled work. Newsletters go out every 10 minutes from sites
// that are awake (sending starts while someone is publishing). Once a day
// every site wakes for its checks and backup, one at a time.
let lastDaily = "";
setInterval(
  async () => {
    await connectPendingDomains().catch((error) =>
      console.error("[domains]", error),
    );
    const sites = await sql<
      Site[]
    >`select * from sites where status = 'active'`;
    const up = new Set(awakeSites());
    for (const site of sites.filter((s) => up.has(s.subdomain))) {
      const done = serving(site.subdomain);
      await cron(site, "/api/cron/newsletter");
      done();
    }
    const today = new Date().toISOString().slice(0, 10);
    if (today === lastDaily) return;
    lastDaily = today;
    for (const site of sites) {
      try {
        await wake(site.subdomain);
      } catch (error) {
        console.error(`[cron] couldn't wake ${site.subdomain}`, error);
        continue;
      }
      const done = serving(site.subdomain);
      await cron(site, "/api/cron/site-checks");
      await cron(site, "/api/cron/backup");
      done();
    }
  },
  10 * 60 * 1000,
);
