import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  hashPassword,
  randomSecret,
  readSession,
  sessionToken,
  verifyPassword,
} from "./auth.ts";
import { config } from "./config.ts";
import { type Account, migrate, type Site, sql } from "./db.ts";
import { checkSubdomain, NameError, siteFromHost } from "./names.ts";
import {
  accountPage,
  homePage,
  loginPage,
  notFoundSite,
  signupPage,
} from "./pages.ts";
import {
  deleteSite,
  provisionSite,
  retrySite,
  runSiteCrons,
} from "./provision.ts";
import { proxyToSite } from "./proxy.ts";

// The platform: the home page and signup at <domain>, and every
// name.<domain> request forwarded to that site's container. nginx in front
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
) => {
  res.writeHead(303, { Location: to, ...headers });
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
  const sites = await sql<
    Site[]
  >`select * from sites where account_id = ${account.id} order by id`;

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
    await deleteSite(site);
    return redirect(res, "/account");
  }

  send(res, 404, homePage(true));
}

const server = createServer(async (req, res) => {
  try {
    const sub = siteFromHost(req.headers.host, config.domain);
    if (sub) {
      const [site] = await sql<
        Site[]
      >`select status from sites where subdomain = ${sub}`;
      if (!site) return send(res, 404, notFoundSite(sub));
      // Only the platform talks to a site's internal endpoints, from inside
      const path = new URL(req.url ?? "/", "http://site").pathname;
      if (/^\/+api\/+internal/i.test(decodeURIComponent(path)))
        return send(res, 404, "Not found");
      return proxyToSite(sub, req, res);
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

// Each site's scheduled work: newsletters every 10 minutes, checks and
// backups once a day
let lastDaily = "";
setInterval(
  () => {
    void runSiteCrons("frequent");
    const today = new Date().toISOString().slice(0, 10);
    if (today !== lastDaily) {
      lastDaily = today;
      void runSiteCrons("daily");
    }
  },
  10 * 60 * 1000,
);
