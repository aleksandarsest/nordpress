# Nordpress

An open-source content management system in the spirit of WordPress, built on a modern TypeScript stack: posts, pages,
categories and tags, media, users with WordPress's roles, settings, and a
public theme with WordPress-compatible permalinks, threaded comments, and a
WordPress-compatible REST API, plus AI writing tools powered by Claude.

**Documentation:** [migrating from WordPress](docs/migrating-from-wordpress.md) · [production checklist](docs/production-checklist.md) · [AI agents](docs/agents.md) · [plugins](docs/plugins.md) · [themes](docs/themes.md) · [contributing](CONTRIBUTING.md)

## Stack

| Layer     | Choice                                                                  |
| --------- | ----------------------------------------------------------------------- |
| Runtime   | Node 24 LTS (`.nvmrc`), pnpm 12                                         |
| Framework | Next.js 16.4 (App Router, Cache Components, React Compiler), React 19.3 |
| Language  | TypeScript 7                                                            |
| Database  | PostgreSQL 17 + Drizzle ORM (pgvector ready for AI search)              |
| Auth      | Better Auth (email + password, WordPress roles/capabilities)            |
| Editor    | Tiptap 3 (content stored as JSON, rendered to HTML on save)             |
| UI        | Tailwind CSS 4, shadcn/ui (Base UI)                                     |
| Tooling   | Biome, Vitest                                                           |

## Getting started

```bash
nvm use
cp .env.example .env.local   # fill in DATABASE_URL and BETTER_AUTH_SECRET
createdb nordpress
psql -d nordpress -c "create extension if not exists vector"
pnpm install
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000. You'll be sent to `/install` to create the site and its first administrator.

## Self-hosting

### Docker

Nordpress and PostgreSQL (with pgvector) in two containers:

```bash
git clone https://github.com/aleksandarsest/nordpress.git && cd nordpress
cat > .env <<EOF
SITE_URL=https://example.com
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
ANTHROPIC_API_KEY=
EOF
docker compose up -d
```

Open `SITE_URL` and the installer takes it from there. The first start takes about a minute: Nordpress prerenders pages from your database, so it builds on its own server rather than in the image. Later restarts are instant; after an upgrade it builds once more.

- **HTTPS:** put a reverse proxy in front. With [Caddy](https://caddyserver.com) it's two lines: `example.com` and `reverse_proxy localhost:3000`.
- **Upgrading:** `git pull && docker compose up -d --build`. Migrations run automatically.
- **Backups:** the `db` volume (or `docker compose exec db pg_dump -U nordpress nordpress`) and the `uploads` volume.
- **Optional services:** add `VOYAGE_API_KEY`, `SMTP_URL`/`MAIL_FROM` or the `S3_*` settings to `.env`; `docker-compose.yml` passes them through.

### Any Node.js host

You need Node 24 and PostgreSQL 15+ with the pgvector extension (Neon, Supabase, Amazon RDS and most managed Postgres services have it).

```bash
pnpm install
pnpm migrate   # applies database migrations
pnpm build     # needs DATABASE_URL: pages are prerendered from the database
pnpm start
```

On serverless platforms such as Vercel, set `STORAGE_DRIVER=s3`, because there's no persistent disk for uploads. Use the same environment variables as `.env.example`.

## Media storage

Uploads are stored on local disk by default (`UPLOADS_DIR`). For hosts without a persistent disk, set `STORAGE_DRIVER=s3` with `S3_BUCKET` and credentials. This works with AWS S3 and S3-compatible services: Cloudflare R2, Backblaze B2, DigitalOcean Spaces, MinIO (set `S3_ENDPOINT` for those). See `.env.example`.

Either way, files are served at `/uploads/...` with long-lived cache headers, so URLs never change when you switch storage; put a CDN in front for best performance. Images are resized on demand by the Next.js image optimizer (WebP/AVIF), so no fixed thumbnail sizes are generated.

## Email

Nordpress sends email for password resets ("Lost your password?" on the login screen, and **Send Reset Link** on each user in the admin). Set `SMTP_URL` to any SMTP provider (Postmark, Resend, SendGrid, Amazon SES, Mailgun, your own server) and optionally `MAIL_FROM`. Without `SMTP_URL`, emails are written to the server log, which is handy in development.

## Search and sharing

Every post and page gets proper metadata for search engines and link previews: a canonical address, Open Graph and Twitter Card tags (title, description, image, author and dates), and `Article` structured data. The **Search & sharing** card in the editor adds, per post:

- a **title for search results** and a **description**, with length counters and a preview of the search result. Empty fields fall back to the title and excerpt. **Write with AI** drafts both in your brand voice.
- an **image for link previews**, when the featured image isn't the right one for social media and chat apps;
- **Hide from search engines**, which adds `noindex` and keeps the page out of `sitemap.xml` and `llms.txt`.

Agents can set the same fields (`seo_title`, `seo_description`, `hide_from_search` on `create_post` and `update_post`).

## Redirects

**Tools → Redirects** keeps old links working:

- **Automatic:** when a published post or page gets a new address (slug, date or parent), its old address redirects to the new one. Chains are collapsed, so a post renamed twice still redirects in one hop.
- **By hand:** an old address on this site to a path or a full URL, permanent (301) or temporary (302). End the old address with `*` to move a whole section: `/old-blog/*` to `/blog/*` keeps the rest of the address. Rules that would loop, redirect everything, or touch `/admin`, `/api` and the like are refused.
- **Not found:** the addresses visitors asked for that don't exist, most requested first, with where they came from and the post each one probably meant. One click redirects it; scanner noise (`wp-login.php` and friends) is left out.
- **Import and export** as CSV, including exports from WordPress's Redirection plugin. Agents can use `list_not_found` and `add_redirect`; adding a redirect follows the live-site policy, like publishing.

Missing pages return a real `404` to search engines and AI crawlers. Browsers get the same 404 page, with a `noindex` tag, while the page streams.

## Backups

**Tools → Backups** puts the whole site in one `.tar.gz` file: every table (posts, pages, comments, users, settings, forms, the shop, newsletter subscribers) and every media file.

- **Download a backup now** streams a fresh backup to your browser. **Save a backup on the server** keeps one under `BACKUP_DIR` (default `./storage/backups`), or in the S3 bucket under `backups/` when media lives in S3. Uploads are public and backups never are; if your bucket is public, make sure that's limited to the `uploads/` prefix.
- **Scheduled backups:** daily or weekly, keeping the newest few (you choose how many). They run when an administrator opens the dashboard, or on time with a call to `GET /api/cron/backup` with `Authorization: Bearer <CRON_SECRET>`. Backups you make by hand are never deleted automatically.
- **Restore** from a saved backup or an uploaded file. You confirm by typing the site title. The current site is saved as a backup first, and the database is replaced in one transaction, so a damaged file changes nothing. Whoever is restoring stays signed in, and the search index is rebuilt afterwards.
- **Portable:** the database is stored as one JSON object per row rather than a `pg_dump`, so backups restore across Postgres versions and onto newer Nordpress versions (new columns get their defaults). A backup from a newer Nordpress than the site is refused. Open one with any `tar` tool.

Backups hold password hashes and members' email addresses, so keep downloaded copies somewhere private. Sign-in sessions aren't included.

## Sign-in security

Under **Profile → Security**, everyone can protect their account with:

- **Two-step login:** a code from an authenticator app (1Password, Google Authenticator, Authy…) after the password. Setup shows a QR code and 10 single-use backup codes, and it's only switched on once a code from the app has been checked. At sign-in, people can tick **Don't ask again on this device for 30 days**. Wrong codes are rate limited, and the account locks briefly after repeated failures.
- **Passkeys:** sign in with a fingerprint, face or device PIN using **Log in with a passkey**, with no password at all. Passkeys are tied to the host name in `SITE_URL`, so changing the domain means adding them again.
- **Help for the locked out:** an administrator can turn off two-step login for someone who lost their phone and backup codes, on that user's edit page.

As in WordPress, application passwords skip two-step login, since scripts can't type codes. Keep them scoped to what needs them, and revoke them under **Profile** when you're done. MCP apps connected with OAuth do go through it, because connecting means signing in.

## Rate limits

Logins (per IP and per account), password reset requests, Better Auth's own endpoints and the site chat are rate limited. Counters live in Postgres (`rate_limits` and `rate_limit` tables), so the limits hold across any number of server instances without Redis. Set `RATE_LIMIT_STORE=memory` to keep them in process memory on a single server. Client IPs come from `X-Forwarded-For`, so run behind a proxy that sets it.

## Scripts

- `pnpm dev`: development server
- `pnpm build` / `pnpm start`: production build (needs the database reachable at build time)
- `pnpm db:generate`: create a migration after editing `src/db/schema.ts`
- `pnpm db:migrate`: apply migrations
- `pnpm test`, `pnpm typecheck`, `pnpm lint`

## Layout

```
src/
  db/            schema.ts (all tables) and migrations
  lib/           domain logic: posts, terms, media, users, options,
                 capabilities (roles), permalinks (URL routing), auth, session
  app/
    (site)/      public theme; [[...path]] resolves every public URL
    (auth)/      install, login, register
    admin/       the dashboard (posts, pages, media, taxonomies, users, settings)
    api/         auth and media upload endpoints
    wp-json/     the WordPress-compatible REST API (handlers in src/lib/rest)
  lib/ai/        Claude integration: writing assistant, suggestions, alt text, usage
  lib/plugins/   plugin runtime: hook engine, activation, settings, REST routing
  plugins/       installed plugins (one folder each) and the registry
  lib/themes/    theme contract, active theme and theme options
  lib/forms/     form fields, validation, submissions, embeds and CSV
  lib/agent/     agent tools (shared by MCP and the assistant), previews, audit log, assistant loop
  lib/mcp/       MCP server for outside agents
  themes/        installed themes (classic, nord) and the registry
    uploads/     serves uploaded files from UPLOADS_DIR
    feed/        RSS 2.0
```

## REST API (`/wp-json/wp/v2`)

A WordPress-compatible API, so existing clients, apps and scripts keep working.

| Route                                           | Methods                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/posts`, `/pages` (+ `/{id}`)                  | list, read, create, update (`POST`/`PUT`/`PATCH`), delete (trash, or `?force=true`)          |
| `/categories`, `/tags` (+ `/{id}`)              | list, read, create, update, delete (`force=true`)                                            |
| `/media` (+ `/{id}`)                            | list, read, upload (multipart `file` or raw body with `Content-Disposition`), update, delete |
| `/comments` (+ `/{id}`)                         | list, read, create (anonymous or authenticated), moderate, delete                            |
| `/users`, `/users/{id}`, `/users/me`            | read                                                                                         |
| `/search`, `/settings`, `/types`, `/taxonomies` | read; settings are writable by administrators                                                |

Nordpress's own endpoints live under `/wp-json/nordpress/v1`; see [Forms](#forms).

Supports `page`, `per_page` (max 100), `search`, `_fields`, a practical `_embed` (author, featured media, terms), the `X-WP-Total` / `X-WP-TotalPages` / `Link` headers, and WordPress-shaped errors.

**Authentication:** create an _application password_ under **Profile** in the admin, then use HTTP Basic auth with your email address and that password:

```bash
curl -u "you@example.com:abcd efgh ijkl mnop qrst uvwx" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello","content":"<p>Hi</p>","status":"publish"}' \
  http://localhost:3000/wp-json/wp/v2/posts
```

Logged-in browser sessions also work for same-origin requests. Incoming HTML is parsed into the editor's schema, so scripts and unknown markup are dropped.

**Differences from WordPress:** user IDs are strings, not integers; `content.raw` is HTML (the native editor document is in `content.document` with `context=edit`); avatars and image sizes are empty for now.

## AI features (Claude)

Set `ANTHROPIC_API_KEY` in `.env.local` and restart. Without a key, the AI controls simply don't appear.

No key? Connect your own Claude (or another MCP client) to the site and it does the same work on your subscription: writing, translation, alt text, forms and the Inbox. See [Using your Claude or ChatGPT subscription](docs/agents.md#using-your-claude-or-chatgpt-subscription).

- **Writing assistant:** the **AI** menu in the editor toolbar can improve, fix, shorten, lengthen, simplify or re-tone the selection (or the whole post), continue writing, write an excerpt, or follow a custom instruction. Answers stream into a preview; nothing changes until you choose Replace or Insert, and Undo works afterwards.
- **Suggestions:** the **AI Suggestions** card proposes titles, an excerpt, a slug, categories (from your existing ones) and tags (reusing existing tags where they fit). Apply each one individually.
- **Alt text:** **Generate with AI** on a media item, a bulk **Generate with AI** for images missing alt text, and optional automatic alt text for new uploads.
- **Forms:** draft a whole form from a description, and have each response checked for spam and summarized (see [Forms](#forms)).
- **Brand voice:** under **Settings → AI**, describe the site and write a voice and style guide (tone, audience, words to use or avoid, claims never to make). The writing assistant, suggestions, form drafting, the site chat and the admin assistant all follow it.
- **AI transparency:** Nordpress records when AI-written text is accepted into a post: from the writing assistant, the admin assistant, an MCP agent or site setup. Posts show an **AI-assisted** badge in the admin, and the Markdown copies for AI crawlers say so. Turn on **Tell readers when AI helped write a post** under **Settings → AI** to show readers a short note too.
- **Settings → AI:** turn features on or off, pick the model (Claude Opus 5.5 by default; Sonnet 5.5 or Haiku 5.5 for lower cost), and see 30 days of usage with estimated cost.

Model output is treated as untrusted: HTML is passed through the editor's schema before it's shown or inserted, and suggested categories are checked against real ones. Declined requests automatically retry on a fallback model where Anthropic supports it (`fallbacks: "default"`).

## Semantic search and site chat

Add `VOYAGE_API_KEY` (from voyageai.com) to `.env.local` and restart. Then open **Settings → AI** and click **Rebuild search index** once. After that, content is re-indexed automatically whenever it's published, updated or removed.

- **Search** ranks by meaning and keywords together (reciprocal rank fusion over pgvector similarity and Postgres full-text search). Without a Voyage key it uses keywords only.
- **Site chat** ("Ask this site") answers visitors from your published content, citing the posts it used. It is **off by default**; turn it on under Settings → AI. Limits: 12 questions per visitor every 10 minutes, and a site-wide daily cap (300 by default). The per-visitor limit is kept in memory per server process, so use a shared store if you run several instances.

How it works: published posts and pages are split into passages of about 600 tokens (`src/lib/ai/chunk.ts`), embedded with `voyage-4` (1024 dimensions) into the `post_chunks` table with an HNSW index. Unchanged passages are never re-embedded. Chat sends the best passages to Claude as `search_result` blocks, so answers come with citations.

`VOYAGE_BASE_URL` optionally points the embeddings client somewhere else (a proxy, or a local test double).

## Plugins

Plugins work like WordPress's: they hook into core through **actions** (react to events) and **filters** (change values), can have a settings page, and can add REST routes. Manage them under **Admin → Plugins**; activating or deactivating takes effect immediately.

Because the site is compiled, plugins are part of the codebase rather than uploaded through the admin. To install one, add a folder under `src/plugins/` and list it in `src/plugins/index.ts`.

```ts
// src/plugins/hello/index.ts
import { definePlugin } from "@/lib/plugins/types";

export default definePlugin({
  slug: "hello",
  name: "Hello",
  version: "1.0.0",
  description: "Appends a greeting to every post.",
  settings: [
    {
      type: "text",
      key: "greeting",
      label: "Greeting",
      default: "Thanks for reading!",
    },
  ],
  rest: [{ method: "GET", path: "/ping", handler: () => ({ pong: true }) }], // GET /wp-json/hello/v1/ping
  register(api) {
    api.addFilter("post.contentHtml", async (html) => {
      const { greeting } = await api.settings();
      return `${html}<p>${greeting}</p>`;
    });
    api.addAction("post.saved", ({ post, previousStatus }) => {
      if (post.status === "publish" && previousStatus !== "publish")
        api.log("published", post.title);
    });
  },
});
```

| Hook                           | Kind   | When                                                                           |
| ------------------------------ | ------ | ------------------------------------------------------------------------------ |
| `post.saved`                   | action | After a post or page is created or updated (any source: admin, REST, importer) |
| `post.trashed`, `post.deleted` | action | After a post is trashed or permanently deleted                                 |
| `comment.created`              | action | After a comment is stored                                                      |
| `media.uploaded`               | action | After a file is uploaded                                                       |
| `user.created`                 | action | After a user account is created                                                |

`post.saved` includes `source` (`"app"` or `"import"`) so plugins can skip bulk imports. Plugins can also add admin screens (`adminPages`), which appear under **Tools**.
| `post.contentHtml` | filter | Post body HTML on the public site and in the RSS feed |
| `comment.status` | filter | Status for a new comment from a non-moderator (`approved`, `pending`, `spam`) |

Hooks run in priority order (lower first, default 10). An error in one plugin is logged and skipped; it never breaks the page or the other plugins. Use `api.defer()` for slow work so it runs after the response. Plugins can declare their own hooks by augmenting `ActionHooks` / `FilterHooks` in `src/lib/plugins/types.ts`.

Bundled examples: **Reading Time**, **Comment Blocklist** and **Webhooks** (signed `POST` requests on publish or new comments).

## Video embeds

The editor's **Video** button embeds YouTube and Vimeo videos from their address. Only the provider and a checked video ID are stored, and the player is built from them using YouTube's privacy-enhanced mode and Vimeo's do-not-track option. Iframes from anywhere else are dropped, including ones pasted into imported or API-submitted HTML. WordPress video embeds come across on import. In feeds and Markdown copies, a video becomes a link.

## Site setup

After installing, Nordpress opens **Set up your site**, and a working site is a couple of minutes away, with or without an AI key:

1. **What are you building?** A business or service, an online shop, a restaurant or café, a freelancer, a portfolio, a personal site or blog, an organization, or an event or wedding.
2. **A few questions** for that kind of site: what you do, where, opening hours, phone and email, and a list of services, dishes, products, projects or programme items. Everything except the name is optional. Add your logo here too.
3. **Review** the pages, menu, form, products, theme and colours, and leave out anything you don't want.
4. **Create my site.** It goes live straight away.

Without an AI key, the pages are written from your answers, as finished text with no placeholders to hunt down. A missing answer simply leaves its sentence out. With a key, Claude writes the copy in a voice that fits, using exactly the facts you gave and inventing none (no prices, addresses, hours, names or reviews).

Each kind of site gets what it needs:

- **Restaurants** get a menu page, opening hours and a table booking form.
- **Shops** get products: the ones with a price go on sale, the rest wait as drafts. They also get a shipping and returns page.
- **Freelancers** get a project inquiry form with a budget question.
- **Events** get a programme and an RSVP form.

Setup only adds content; if any step fails, everything it created is removed again.

Afterwards, the dashboard shows **Getting started**: publish a first post, protect your account, turn on email, schedule backups and use your own domain, each ticked off as it's done. The logo and the browser icon can be changed any time under **Settings → General**.

## Admin assistant

**Assistant** in the admin is Claude working on the site for you: "what's waiting for me?", "draft a post announcing the new contact form", "find posts with no excerpt and suggest one for each", "summarize this week's form responses".

It uses the same tools as outside agents (below), with your own permissions:

- **Lookups run straight away** and show up as short activity lines.
- **Every change is proposed first.** Creating, editing or trashing content and moderating or replying to comments appear as a card with the change spelled out: fields before and after, the full body before and after, and a warning when it touches the live site. Nothing happens until you choose **Approve**; **Decline** tells Claude it was not done.
- **Visitor text is data.** Comments and form responses can contain anything; Claude is told never to follow instructions in them, and the approval step means a planted instruction can't change the site by itself.
- Changes are recorded in the agent activity log as "Admin assistant". Each turn is capped at 12 model calls, with up to 300 a day per user, and the usage shows under **Settings → AI**.

The conversation stays in your browser tab and is sent back unchanged each turn, so prompt caching and the model's reasoning carry over. **New conversation** clears it.

## Shop

Sell products from the same site, with nothing extra to install. Under **Shop** in the admin:

- **Products:** name, summary, Markdown description, price, image, SKU, stock (or unlimited) and whether they need shipping. Active products appear at `/shop` and `/shop/<slug>`, inside the active theme.
- **Checkout:** the cart lives in the visitor's browser and is priced on the server every time, so prices can't be tampered with. Stock is reserved when an order is placed and returned if it's cancelled or never paid.
- **Payments:** set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, and add a Stripe webhook to `/api/shop/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.expired`. Customers then pay on Stripe's checkout page, so card details never touch your server. Without Stripe, orders are placed for manual payment, with the instructions from **Shop → Settings** (for example bank details).
- **Orders:** an order list and detail page to mark orders paid, fulfilled, cancelled or refunded. Customers get emails when they order, when payment arrives and when the order ships.
- **Ready for AI shoppers:** product pages carry `Product` structured data with price and availability. Every product has a Markdown copy at `/shop/<slug>.md`, and `llms.txt` lists the catalog. The admin assistant and MCP agents can find and edit products (`search_products`, `save_product`) and review orders (`list_orders`, administrators only).

## Memberships

Tick **Members only** on any post or page to keep it for members. Visitors see the excerpt (or the opening words) with an invitation to join at `/members`.

- **Plans** under **Members**: free plans let people join with an account, instantly. Paid plans charge monthly or yearly through Stripe subscriptions (the same Stripe setup as the shop, plus the `customer.subscription.updated` and `customer.subscription.deleted` webhook events). Members manage billing or cancel through Stripe's portal from `/account`; a cancelled membership lasts until the end of the paid period.
- **Grant or end** memberships by hand, for example for sponsors or staff.
- **No leaks:** members-only content stays out of the RSS feed, the public REST API, the Markdown copies and `llms-full.txt`, search snippets beyond the teaser, and the semantic index, so the site chat can't quote it. People with editing roles always see everything.

## Newsletter

Turn it on under **Newsletter** and readers can subscribe at `/newsletter`, in a box after each post, or from their account. Every signup is confirmed by email (double opt-in), and the signup form gives the same answer whether or not an address is already on the list.

- **Send a post** from its editor: the **Newsletter** card takes a subject and preview text (Claude can suggest three subject lines), sends you a test, then emails it to every subscriber or only to members. Scheduled posts go out when they're published. Or tick **Email every new post when it's published**.
- **Members-only posts** reach subscribers with member access in full; everyone else gets the teaser and a link to join.
- **Email-safe:** posts are turned into email HTML with inline styles and absolute links. Videos become a thumbnail that links to the video, and forms become a link to the post. Every email has a plain-text version and an unsubscribe link, and supports one-click unsubscribe from the mail app (`List-Unsubscribe`, RFC 8058). Add your postal address under the newsletter settings; anti-spam laws in many countries require it.
- **Subscribers:** search, remove, export to CSV, and import a list from Mailchimp, Substack, Ghost or anywhere else.
- **Sending** goes in batches of 50, can resume where it left off, and never emails a post twice. If the mail server is down it waits 15 minutes and retries from the same place. It needs `SMTP_URL`. Sending starts right away on a normal server; on serverless hosts, also call `GET /api/cron/newsletter` every few minutes with `Authorization: Bearer <CRON_SECRET>`.
- **Agents:** `get_newsletter` and `email_post` over MCP. Emailing is public, so it follows the site's agent policy, like publishing.

## Translations

List the languages you publish in under **Settings → General** (for example `de, fr`). Each post and page then gets a **Translations** card in the editor:

- **Translate:** Claude drafts the translation in your brand voice, keeping headings, lists and links. Without an API key, it creates a copy to translate by hand. Either way it's a draft until a person publishes it.
- **Addresses:** translations live under their language (`/de/besserer-kaffee`), and `/de` lists the posts in that language. The bare slug redirects to the prefixed address. Your own pages and home page stay as they are.
- **For readers and search engines:** posts link to their translations ("Also in: Deutsch"), pages carry `hreflang` alternates and a `lang` attribute, and the sitemap lists every language.

## Insights

**Insights** shows how people find the site and, increasingly important, how AI assistants read it and send readers to it, over the last 30 days:

- **Visits from AI answers:** people arriving from ChatGPT, Claude, Perplexity, Gemini, Copilot and others, by assistant and by page. These are the pages AI answers cite.
- **AI crawler reads:** GPTBot, ClaudeBot, PerplexityBot and the rest, which pages they read, and how often they use the Markdown copies and `llms.txt`.
- **Page views** from search, social, other sites and direct visits.

Counting happens in `src/proxy.ts`: one daily counter per page and source, with no cookies, IP addresses or user agents stored, so there's no consent banner to show. Signed-in team members, client-side navigation and prefetches aren't counted.

## Inbox

The **Inbox** is where Nordpress brings you things worth doing. Every day it checks for:

- **Posts without an excerpt:** Claude drafts one in your brand voice.
- **Images without alt text:** Claude describes them.
- **Links that lead nowhere:** links to pages that no longer exist, and to external sites that are gone.
- **Waiting work:** comments to moderate and new form responses.

Fixes Claude can draft come with a preview of the change and an **Approve** button; nothing changes until you press it. The rest link to where you fix them. Dismissed items stay away for 30 days, and items fixed some other way clear themselves on the next check. Claude drafts at most 8 fixes a day.

Checks run when an administrator opens the dashboard (at most daily) or with **Run checks now**. To run them on a schedule instead, set `CRON_SECRET` and call `GET /api/cron/site-checks` with `Authorization: Bearer <CRON_SECRET>` (Vercel Cron does this for you). Turn checks off under **Settings → AI**.

## AI agents (MCP)

Nordpress is an [MCP](https://modelcontextprotocol.io) server at `/mcp`, so Claude Code, Claude Desktop and other agents can manage the site: "draft a post about our launch and tag it", "what's waiting in moderation?", "summarize this week's contact form responses".

**Connect:** give your MCP client the address `https://your-site/mcp`. In Claude, add it as a custom connector; Claude Code and other clients take the same URL. The client registers itself, you sign in to Nordpress and choose **Allow**, and it's connected. This is OAuth 2.1 with PKCE, following the MCP authorization spec. Connected apps are listed under **Profile**, where you can disconnect them.

Scripts and clients without OAuth can use an application password instead:

```bash
claude mcp add --transport http nordpress https://your-site/mcp \
  --header "Authorization: Basic <base64 of email:application-password>"
```

**Tools:**

| Tool                                                     | Does                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `get_site_info`                                          | Site details, who the agent is acting as, what that account may do, and the agent policy |
| `search_content`, `get_post`, `list_categories_and_tags` | Find and read posts and pages; bodies come back as Markdown                              |
| `create_post`, `update_post`, `trash_post`               | Write in Markdown; categories and tags by name; trash only, never permanent deletion     |
| `list_comments`, `moderate_comment`, `reply_to_comment`  | Moderation queue and replies                                                             |
| `get_form_responses`, `create_form`                      | Read forms and their responses, with AI summaries; build new forms                       |
| `list_media`, `view_image`, `set_image_alt_text`         | Browse media, look at an image and write its alt text                                    |
| `save_translation`                                       | Save a translation the agent wrote, as a draft linked to the original                    |
| `get_site_tasks`, `resolve_inbox_item`                   | Missing excerpts and alt text, and the Inbox, to fix or dismiss                          |

**Prompts:** `write_post`, `translate_post`, `describe_images`, `site_checkup`, `create_form` and `answer_comments` start common jobs, so a Claude subscription can do what the built-in AI features do without an API key on the site.

**Guardrails:**

- **Same permissions as the person.** Agents act as the application password's owner, with that role's capabilities. A Contributor's agent can only write drafts of its own.
- **Humans approve what goes live.** By default an agent can't change the live site: a request to publish is saved as Pending Review, published content is read-only, and comment replies are refused. Each refusal explains why, so the agent can tell its user. An administrator can allow live changes under **Settings → Agents**.
- **Everything is logged.** Every change, refusal and failure is recorded with the user, the application password used and the arguments (long text shortened), and shown under **Settings → Agents**. Read-only lookups aren't logged.
- **Limits.** 120 calls a minute per user. Revoking the application password cuts the agent off at once, and the endpoint can be switched off entirely.

## Readable by AI

More and more readers are AI assistants and agents acting for people. Nordpress gives them clean, cheap-to-read versions of the site:

- **Markdown copies:** every post and page is also served as Markdown at its permalink plus `.md` (`/my-post.md`), converted from the editor document. Embedded forms become links to their JSON Schema, so an agent can fill them in. HTML pages point to it with `<link rel="alternate" type="text/markdown">`, and the Markdown sends a canonical `Link` header back to the HTML page. Plugins can change it with the `post.markdown` filter.
- **[`/llms.txt`](https://llmstxt.org):** a Markdown index of the site (pages, the 50 latest posts, the feed and APIs). `/llms-full.txt` holds the full text of every page and the 100 latest posts.
- **Structured data:** JSON-LD on every post (`BlogPosting`) and page (`WebPage`), and `WebSite` with a search action on the home page.
- **Crawler controls:** under **Settings → Reading**, allow or block AI search and assistants (ChatGPT search, Claude, Perplexity) and AI training crawlers (GPTBot, ClaudeBot, Google-Extended, Common Crawl and others) separately. Both go into `robots.txt` as per-bot rules and a [`Content-Signal`](https://contentsignals.org) line. Well-behaved crawlers follow it; it isn't enforcement.
- **Real status codes for AI crawlers:** they get fully rendered pages with real 404s and redirects, like search engines.

## Forms

Build forms under **Forms** and drop them into any post or page with the editor's **Form** button. Ten field types are available: short text, email, phone, website, number, date, paragraph, dropdown, multiple choice and checkboxes.

- **Draft with AI:** describe the form ("a quote request with budget range and services") and Claude drafts the fields, button text and thank-you message. Inside the builder, **Replace fields** does the same, and nothing is saved until you choose Save Form.
- **Responses:** an inbox per form with Unread and Spam views and CSV export. Each response is emailed to the form's address (or the site admin) and fires the `form.submitted` hook; the Webhooks plugin can forward it.
- **AI triage:** each response is checked for spam and summarized in one line with Claude Haiku, whatever the site's main model. Spam goes to the Spam view and sends no email or webhook. Turn this off per form.
- **Abuse protection:** a honeypot field, 10 responses per visitor and 200 per form every 10 minutes, and server-side validation of every field. The form works without JavaScript.
- **For agents:** `GET /wp-json/nordpress/v1/forms/{id}` returns the fields and a JSON Schema; `POST .../forms/{id}/submissions` with a JSON body submits it (same validation and limits; errors list each field in `data.params`). Listing forms and reading responses (`GET .../submissions?status=new|read|spam`) needs an editor's application password.

Field keys are fixed on the first save, so renaming a question never orphans earlier responses.

## Design

New sites use **Studio**, a theme you shape yourself under **Appearance → Design**, with a live preview of your real pages at desktop, tablet and phone sizes. Changes show instantly and reach visitors when you publish.

- **Styles:** eight ready-made designs (Nordic, Bakery, Noir, Fresh, Elegant, Tech, Newspaper, Playful) to start from. **Shuffle** varies one while keeping your brand color, and **Colors from my logo** takes the main color from your logo. With an AI key, **Describe your style** ("warm and handmade, earthy colors") picks the options for you.
- **Colors:** one brand color, light or dark mode, a neutral, warm, cool or brand-tinted background, and a plain, colored or dark header. Everything else is derived from those, and text, links, buttons and the header always meet WCAG AA contrast, whatever color you pick (the tests check this for awkward colors like pure yellow and white).
- **Fonts:** eight pairings (Modern, Editorial, Classic, Friendly, Technical, Elegant, Bold, Warm) in three sizes. Fonts are served from your own site, so visitors' browsers never contact Google.
- **Shapes and layout:**
  - corners and button style;
  - header layout: logo left, centered, or menu below;
  - page width and spacing;
  - post lists as cards, a list or a magazine layout.
- **Responsive:** on phones the menu folds into a **Menu** button that opens under the header, with no JavaScript needed. Images, type and spacing scale with the screen.

Forms, the newsletter signup and comments pick up the design too. Nord and Classic stay available under **Appearance → Themes**. Theme authors: a design is a set of CSS variables (`--d-*`) and data attributes; see `src/themes/studio` and `src/lib/design`.

## Themes and menus

Themes live in `src/themes/<slug>/` and are registered in `src/themes/index.ts`. Two ship with Nordpress: **Classic**, a single-column reading theme, and **Nord**, with a dark header, a card grid and the Nord palette. Switch between them under **Appearance → Themes**; content, menus and settings stay as they are.

A theme is a `defineTheme({ ... })` object (`src/lib/themes/types.ts`) that declares:

- **Components:** `Layout`, `Single`, `PostList`, `ArchiveHeader`, `Paging`, `SearchForm` and `Empty`. Core still does the routing, data loading, comments and plugin filters, so a theme only decides how things look.
- **Menu locations,** such as `{ primary: "Header menu" }`.
- **Settings,** the same field types plugins use. They are edited under **Appearance → Customize** and passed to every component as `options`.

Build menus under **Appearance → Menus** from pages, posts, categories and custom links, nest them, and assign each one to a location of the active theme. Items linked to a page or term follow renames, and unpublished or deleted targets are hidden on the site.

## Extending Nordpress

Plugins and themes are TypeScript in this repository, so you (or a coding agent like Claude Code) can build exactly what a site needs:

```bash
pnpm new:plugin event-calendar "Event Calendar"   # src/plugins/event-calendar
pnpm new:theme sunrise "Sunrise" --from nord      # copy of Nord to make your own
```

Both register themselves; activate the plugin under **Plugins** or switch to the theme under **Appearance → Themes**. [`AGENTS.md`](AGENTS.md) (loaded automatically by Claude Code through `CLAUDE.md`) explains the architecture, the hooks and the rules a change must follow, so agents get it right the first time.

## Importing from WordPress

Activate the **WordPress Importer** plugin, then open **Tools → Import from WordPress**. There are two ways in:

- **From the live site:** enter its address. Nordpress reads everything public through the WordPress REST API (posts, pages, categories, tags, media and approved comments), with nothing to install on the old site. Authors come across by name; emails aren't public, so their posts go to you.
- **From an export file:** in the old dashboard, use **Tools → Export → All content** and upload the file. This also brings drafts, private posts, menus and author emails.

- **Imported:** posts, pages (with parent pages), categories (with hierarchy), tags, threaded comments with their original dates and status, sticky posts, excerpts, featured images and navigation menus.
- **Authors:** matched to existing users by email. Optionally, missing authors are created as Author accounts; set their passwords under **Users**, since the importer gives them random ones.
- **Media:** downloaded from the old site, with alt text and captions. Image links inside posts, including resized variants like `photo-300x200.jpg`, are rewritten to the new copies. The old site must still be online for this.
- **Safe to re-run:** anything already imported is skipped. Imports don't trigger publish webhooks.
- **Old links keep working:** URLs like `/2024/05/my-post/` and `/my-post/` redirect to the new address. Old numeric `?p=123` links do not; the original IDs are stored in each post's `meta.wpId`.
- **Menus:** recreated with their nesting, custom labels and new-tab links. Links to the old domain become site-relative. Exports don't record menu locations, so assign the menus under **Appearance → Menus**.
- **Not imported:** custom post types, revisions, shortcode output (shortcodes stay as text) and password protection (protected posts become private).

Media downloads refuse private and loopback network addresses, so an export file can't make the server fetch internal URLs. The importer's settings can allow them for a WordPress install on your own network.

## Comments

Threaded comments with WordPress's moderation rules (manual approval, auto-approval for authors with an earlier approved comment, more than two links held for review), duplicate and flood protection, and a honeypot field for bots. Configure them under **Settings → Discussion**; moderate under **Comments**.

The flood check uses the `X-Forwarded-For` header, so run the app behind a reverse proxy that sets it.

## WordPress concepts and where they live

| WordPress                                          | Here                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `wp_posts` / `wp_postmeta`                         | `posts` table with a typed `meta` JSONB column                                              |
| `wp_terms` + taxonomy tables                       | `terms` + `post_terms`                                                                      |
| `wp_options`                                       | `options` table, read through the cached `getSettings()`                                    |
| Roles and `map_meta_cap`                           | `src/lib/capabilities.ts`                                                                   |
| Rewrite rules                                      | `resolveRoute()` in `src/lib/permalinks.ts`                                                 |
| `redirect_canonical`                               | `canonical()` in `src/app/(site)/[[...path]]/page.tsx`                                      |
| Revisions                                          | `post_revisions` (last 25 kept per post)                                                    |
| `wp_comments`                                      | `comments` table; rules in `src/lib/comments.ts`                                            |
| Application passwords                              | `app_passwords` (SHA-256 hashed)                                                            |
| (none: agents use REST with no guardrails)         | MCP server at `/mcp`, `agent_actions` log, `src/lib/mcp`                                    |
| Nav menus (`nav_menu_item` posts)                  | `menus` + `menu_items`                                                                      |
| SEO plugins (Yoast, Rank Math): schema, robots.txt | `src/lib/seo.ts`, `src/lib/structured-data.ts`, `src/lib/ai-readable.ts`                    |
| Redirection plugin                                 | `redirects` + `not_found_log`, `src/lib/redirects`, **Tools → Redirects**                   |
| WPML / Polylang                                    | Translations as linked posts (`meta.lang`, `meta.translationOf`), `src/lib/translations.ts` |
| WooCommerce (core store)                           | `products` + `orders`, `src/lib/shop`, Stripe Checkout                                      |
| Form plugins (Contact Form 7, Gravity Forms)       | `forms` + `form_submissions`, built in                                                      |
| Newsletter plugins (MailPoet, Jetpack Subscribe)   | `subscribers` + `newsletters`, `src/lib/newsletter`, built in                               |
| Backup plugins (UpdraftPlus, Jetpack VaultPress)   | **Tools → Backups**, `src/lib/backup`, built in                                             |
| Themes and `theme_mods`                            | `src/themes/*`, options saved as `theme:<slug>`                                             |

## License

MIT. Nordpress is an independent project and is not affiliated with WordPress or the WordPress Foundation; it implements WordPress-compatible formats and APIs so existing content and tools keep working.
