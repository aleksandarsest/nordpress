import { config } from "./config.ts";
import type { Site } from "./db.ts";

// The platform's pages, as plain HTML: the home page, signup, login and the
// account page. No client framework, so it runs light next to the sites.

export const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const STYLE = `
:root{--bg:#f7f8fb;--surface:#fff;--text:#16181d;--muted:#5b6170;--border:#e3e6ee;--accent:#4f6fae;--on-accent:#fff;--radius:14px;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#121419;--surface:#1a1d24;--text:#eceff4;--muted:#a3a9b8;--border:#2c313c;--accent:#88a6dd;--on-accent:#121419;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:17px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}main{max-width:64rem;margin:0 auto;padding:0 1.25rem 4rem}
header.top{max-width:64rem;margin:0 auto;padding:1.25rem;display:flex;justify-content:space-between;align-items:center;gap:1rem}
.brand{font-weight:800;font-size:1.25rem;letter-spacing:-.02em;color:var(--text);text-decoration:none}
.nav a{margin-left:1rem;text-decoration:none;color:var(--muted);font-weight:500}
.hero{text-align:center;padding:4rem 0 3rem}.hero h1{font-size:clamp(2.3rem,6vw,4rem);line-height:1.08;letter-spacing:-.03em;margin:0 0 1rem}
.hero p{color:var(--muted);font-size:1.2rem;max-width:40rem;margin:0 auto 2rem}
.button{display:inline-block;background:var(--accent);color:var(--on-accent);padding:.75rem 1.4rem;border-radius:999px;font-weight:700;text-decoration:none;border:0;font-size:1rem;cursor:pointer}
.button.secondary{background:transparent;color:var(--accent);border:2px solid var(--accent)}
.grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.4rem}
.card h3{margin:.2rem 0 .4rem;font-size:1.1rem}.card p{margin:0;color:var(--muted)}
.narrow{max-width:30rem;margin:2rem auto}.narrow h1{letter-spacing:-.02em}
label{display:grid;gap:.35rem;font-weight:600;font-size:.95rem;margin-bottom:1rem}
input{font:inherit;padding:.65rem .8rem;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);width:100%}
input:focus{outline:2px solid var(--accent);outline-offset:1px}
.hint{font-weight:400;color:var(--muted);font-size:.85rem}.suffix{display:flex;align-items:center;gap:.4rem}.suffix span{color:var(--muted);white-space:nowrap}
.error{background:#fde8e8;color:#9b1c1c;padding:.7rem 1rem;border-radius:10px;margin-bottom:1rem}
@media (prefers-color-scheme:dark){.error{background:#3b1717;color:#fca5a5}}
.site{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:1rem}
.status{color:var(--muted);font-size:.9rem}.small{font-size:.9rem;color:var(--muted)}
footer{max-width:64rem;margin:0 auto;padding:2rem 1.25rem;color:var(--muted);font-size:.9rem}
`;

function layout(title: string, body: string, signedIn = false) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="Your website, ready in a minute: designed by you, with AI built in.">
<style>${STYLE}</style></head><body>
<header class="top"><a class="brand" href="/">Nordpress</a><nav class="nav">${
    signedIn
      ? `<a href="/account">Your sites</a><form method="post" action="/logout" style="display:inline"><button class="button secondary" style="padding:.35rem .9rem;margin-left:1rem">Log out</button></form>`
      : `<a href="/login">Log in</a><a href="/signup">Sign up</a>`
  }</nav></header>
<main>${body}</main>
<footer>Nordpress is open source: <a href="https://github.com/aleksandarsest/nordpress">github.com/aleksandarsest/nordpress</a>. Free while in beta.</footer>
</body></html>`;
}

const FEATURES: [string, string][] = [
  [
    "Ready in a minute",
    "Pick what you're building, answer a few questions, and get a finished site with real pages, not placeholders.",
  ],
  [
    "Designed by you",
    "Colors, fonts and layout with a live preview. Every combination stays readable, on every screen.",
  ],
  [
    "AI built in",
    "Writing help, translations, alt text and a site assistant. Or connect your own Claude to manage the site.",
  ],
  [
    "Bring your site",
    "Copy your current site from WordPress, Wix or Squarespace, with redirects so old links keep working.",
  ],
  [
    "Sell and grow",
    "A shop, paid memberships and a newsletter, without plugins.",
  ],
  [
    "Yours to keep",
    "Open source, with one-click backups. Move to your own server any time.",
  ],
];

export function homePage(signedIn: boolean) {
  return layout(
    "Nordpress: your website, ready in a minute",
    `<section class="hero"><h1>Your website,<br>ready in a minute.</h1>
<p>A WordPress-style site with AI built in: for your business, your shop, your writing or your event. Free during the beta.</p>
<a class="button" href="${signedIn ? "/account" : "/signup"}">${signedIn ? "Go to your sites" : "Join the beta"}</a></section>
<section class="grid">${FEATURES.map(([t, d]) => `<div class="card"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join("")}</section>`,
    signedIn,
  );
}

export function signupPage(values: Record<string, string> = {}, error = "") {
  return layout(
    "Sign up · Nordpress",
    `<div class="narrow"><h1>Create your site</h1>
<p class="small">The beta is invite-only. Your site will live at <strong>name.${esc(config.domain)}</strong>; you can connect your own domain later.</p>
${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
<form method="post" action="/signup" class="card">
<label>Invite code<input name="invite" required value="${esc(values.invite)}" autocomplete="off"></label>
<label>Site name<input name="title" required maxlength="200" value="${esc(values.title)}" id="title"></label>
<label>Address<span class="suffix"><input name="subdomain" required maxlength="29" pattern="[a-zA-Z0-9-]{3,29}" value="${esc(values.subdomain)}" id="subdomain"><span>.${esc(config.domain)}</span></span><span class="hint">Letters, numbers and hyphens.</span></label>
<label>Your name<input name="name" required maxlength="200" autocomplete="name" value="${esc(values.name)}"></label>
<label>Email<input name="email" type="email" required autocomplete="email" value="${esc(values.email)}"></label>
<label>Password<input name="password" type="password" required minlength="10" autocomplete="new-password"><span class="hint">At least 10 characters. You'll use it for this page and to log in to your site.</span></label>
<button class="button" type="submit">Create my site</button></form></div>
<script>
const t=document.getElementById('title'),s=document.getElementById('subdomain');let edited=!!s.value;
s.addEventListener('input',()=>edited=true);
t.addEventListener('input',()=>{if(!edited)s.value=t.value.normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,29)});
</script>`,
  );
}

export function loginPage(email = "", error = "") {
  return layout(
    "Log in · Nordpress",
    `<div class="narrow"><h1>Log in</h1>${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
<form method="post" action="/login" class="card">
<label>Email<input name="email" type="email" required autocomplete="email" value="${esc(email)}"></label>
<label>Password<input name="password" type="password" required autocomplete="current-password"></label>
<button class="button" type="submit">Log in</button></form>
<p class="small">To work on your site, log in on the site itself (yoursite.${esc(config.domain)}/login) with the same email and password.</p></div>`,
  );
}

const STATUS: Record<Site["status"], string> = {
  creating: "Being created…",
  active: "Live",
  failed: "Something went wrong",
  deleting: "Being deleted…",
};

export function accountPage(email: string, sites: Site[], error = "") {
  const url = (s: Site) => `https://${s.subdomain}.${config.domain}`;
  return layout(
    "Your sites · Nordpress",
    `<div class="narrow" style="max-width:40rem"><h1>Your sites</h1><p class="small">Signed in as ${esc(email)}.</p>
${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
${
  sites.length === 0
    ? `<p>You don't have a site yet.</p>`
    : sites
        .map(
          (
            s,
          ) => `<div class="card" style="margin-bottom:1rem" data-site="${esc(s.subdomain)}" data-status="${esc(s.status)}">
<div class="site"><div><h3 style="margin:0">${esc(s.title)}</h3><a href="${esc(url(s))}">${esc(url(s).replace("https://", ""))}</a>
<div class="status">${esc(STATUS[s.status])}${s.status === "creating" && s.error ? `: ${esc(s.error)}` : ""}</div></div>
${s.status === "active" ? `<a class="button" href="${esc(url(s))}/login?redirect_to=/admin/setup">Open the dashboard</a>` : ""}</div>
${
  s.status === "failed"
    ? `<p class="small">We couldn't finish creating it. Try again; if it fails twice, write to us and we'll sort it out.</p>
<form method="post" action="/sites/${esc(s.subdomain)}/retry"><label>Your password<input name="password" type="password" required autocomplete="current-password"><span class="hint">Your site needs it to set up your account.</span></label>
<button class="button" type="submit">Try again</button></form>`
    : ""
}${
  s.status === "active" || s.status === "failed"
    ? `<details style="margin-top:1rem"><summary class="small">Delete this site</summary>
<form method="post" action="/sites/${esc(s.subdomain)}/delete" style="margin-top:.75rem">
<label>Type <strong>${esc(s.subdomain)}</strong> to delete the site and everything on it, for good<input name="confirm" autocomplete="off"></label>
<button class="button secondary" type="submit">Delete for good</button></form></details>`
    : ""
}</div>`,
        )
        .join("")
}</div>
<script>
// While a site is being created, follow its progress
for (const card of document.querySelectorAll('[data-status=creating]')) {
  const tick = async () => {
    const r = await fetch('/sites/' + card.dataset.site + '/status').then(r => r.json()).catch(() => null);
    if (r && r.status !== 'creating') return location.reload();
    if (r) card.querySelector('.status').textContent = 'Being created…' + (r.step ? ': ' + r.step : '');
    setTimeout(tick, 2000);
  };
  tick();
}
</script>`,
    true,
  );
}

export function notFoundSite(sub: string) {
  return layout(
    "No site here",
    `<div class="narrow"><h1>No site here yet</h1><p><strong>${esc(sub)}.${esc(config.domain)}</strong> isn't a site. <a href="https://${esc(config.domain)}/signup">Create one</a>.</p></div>`,
  );
}
