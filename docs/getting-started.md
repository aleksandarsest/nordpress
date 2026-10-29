# Getting started

From nothing to a working Nordpress site. Pick where you're starting:

| You want to                       | Go to                                           | Time       |
| --------------------------------- | ----------------------------------------------- | ---------- |
| Try it on your own computer       | [Try it locally](#try-it-locally)               | 5 minutes  |
| Put a site online                 | [Put a site online](#put-a-site-online)         | 15 minutes |
| Move a WordPress site             | [Coming from WordPress](#coming-from-wordpress) | an hour    |
| Build plugins, themes or features | [For developers](#for-developers)               | 10 minutes |

## Try it locally

You need [Node.js 24](https://nodejs.org) and [pnpm](https://pnpm.io/installation). No database server: Nordpress uses its built-in one, kept in `storage/db`.

```bash
git clone https://github.com/aleksandarsest/nordpress.git
cd nordpress
pnpm install
cp .env.example .env.local
```

Open `.env.local` and set `BETTER_AUTH_SECRET` to a random value (`openssl rand -base64 32` makes one). Then start it:

```bash
pnpm dev:embedded
```

Open http://localhost:3000 and continue with [Your first ten minutes](#your-first-ten-minutes). To start over, stop the server and delete `storage/db`.

## Put a site online

You need a Linux server (any provider, 1 GB of memory is enough) and a domain pointing at it. On the server:

```bash
curl -fsSL https://raw.githubusercontent.com/aleksandarsest/nordpress/main/install.sh | sudo bash
```

It checks the server, asks for your domain, and sets up Nordpress with its database and HTTPS. When it finishes, open your domain. You can also install without a terminal, behind nginx or Apache, or on a Node.js host: see [Self-hosting](self-hosting.md).

## Your first ten minutes

1. **Create your account.** The first page asks for the site's name and your email and password. This account is the site's administrator.
2. **Set up your site.** Choose what you're building (a business, shop, restaurant, portfolio, blog …), answer a few questions, and review what Nordpress made: pages, a menu, a contact form, a theme and colors. **Create my site** puts it live. Already have a website? Choose **Copy it instead** and give its address.
3. **Make it look right.** **Appearance → Design** changes colors, fonts and spacing with a live preview; **Appearance → Themes** switches the whole look; **Settings → General** has the logo and browser icon.
4. **Write.** **Posts → Add new** for news and articles, **Pages** for things like About and Contact. Pages added to **Appearance → Menus** show in the site's header.
5. **Check it as a visitor.** Open the site in a private window.

The dashboard keeps a **Getting started** list (publish a first post, protect your account, turn on email, schedule backups, use your own domain) and ticks each item off as you do it.

## Before real visitors arrive

The short version of the [production checklist](production-checklist.md):

- **Protect your account:** add a passkey or two-step login under **Profile**.
- **Turn on email**, so password resets and form notifications arrive: set `SMTP_URL` and `MAIL_FROM`.
- **Schedule backups** under **Tools → Backups**, and download one to keep elsewhere.
- **Turn on AI features** (optional): set `ANTHROPIC_API_KEY` for writing help, alt text and the admin assistant, and `VOYAGE_API_KEY` for semantic search and site chat. Everything else works without them.

`install.sh` keeps these settings in `/opt/nordpress/.env`; edit it and run `sudo systemctl restart nordpress`. Locally they go in `.env.local`.

## Coming from WordPress

1. Install Nordpress as above, and skip the setup wizard's questions: you're bringing your own content.
2. Under **Plugins**, activate **WordPress Importer**, then open **Tools → Import from WordPress** and enter your old site's address, or upload an export file from **Tools → Export** in WordPress.
3. Choose the same permalink structure under **Settings → Permalinks**, so your URLs stay the same. Old URLs redirect either way.
4. Point your domain at the new server.

The full guide, including what does and doesn't come across, is [Migrating from WordPress](migrating-from-wordpress.md). [Nordpress vs WordPress](wordpress-alternative.md) shows which plugins you won't need.

## For developers

Nordpress is a Next.js app in TypeScript. After [trying it locally](#try-it-locally):

```bash
pnpm new:plugin event-calendar "Event Calendar"   # a plugin in src/plugins
pnpm new:theme sunrise "Sunrise" --from nord      # a theme in src/themes
pnpm port:wp ~/my-wordpress-plugin                # map a WordPress plugin to Nordpress
pnpm lint && pnpm typecheck && pnpm test          # what CI runs
```

For PostgreSQL instead of the built-in database, set `DATABASE_URL` in `.env.local` (with the `vector` extension created), run `pnpm db:migrate`, and use `pnpm dev`.

Read next:

- [`AGENTS.md`](../AGENTS.md): the architecture and the rules every change follows. Claude Code and other coding agents read it automatically.
- [Writing plugins](plugins.md) and [Writing themes](themes.md).
- [Porting WordPress code](porting-from-wordpress.md): PHP hooks, functions and templates mapped to TypeScript.
- [AI agents](agents.md): connect Claude to your site over MCP.
- [Contributing](../CONTRIBUTING.md).
