# Running Nordpress on your own hosting

Nordpress is yours to run anywhere: a server at any provider, a Docker
platform, or a Node.js host with a managed database. Pick the first option
that fits.

| You have | Use |
| --- | --- |
| A Linux server (VPS) and a domain | [One command](#one-command) |
| A server that already runs nginx or Apache | [One command](#one-command), behind your web server |
| Coolify, Dokploy, CapRover, Portainer or another Docker platform | [Docker Compose](#docker-platforms) |
| A Node.js host and a managed Postgres | [Node.js hosts](#nodejs-hosts) |
| Shared PHP hosting (cPanel, Plesk) only | Not enough on its own; see [below](#shared-php-hosting) |

## One command

**You need:** a Linux server with at least 1 GB of memory (2 GB is more
comfortable), and a domain. Any provider works: Hetzner, DigitalOcean,
Linode, Vultr, OVH, Scaleway, AWS Lightsail, a machine at home.

1. **Point the domain at the server.** At your domain's DNS provider, add an
   `A` record for the domain with the server's IP address. It can take a few minutes to take effect.
2. **Log in to the server** (`ssh root@your-server-ip`) and run:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/aleksandarsest/nordpress/main/install.sh | sudo bash
   ```
3. **Open your domain** and create your account. The guided start takes it
   from there.

The installer:

- asks for the domain, and checks that it points at this server;
- installs Docker if the server doesn't have it;
- adds swap on servers with little memory, since building the site needs
  about 2 GB;
- makes the passwords and keys, in `/opt/nordpress/.env`;
- gets an HTTPS certificate for the domain and renews it, with Caddy;
- starts Nordpress and Postgres, which restart on their own after a reboot.

The first start takes a few minutes, because the site is built on the
server.

**Behind nginx or Apache.** If ports 80 and 443 are already taken, the
installer offers to skip HTTPS and listen on `127.0.0.1:3000` instead, and
prints the lines to add to your web server. To choose this up front, run it
with `HTTPS=none`.

**Upgrading:** run the same command again. Your content and settings stay;
database changes are applied on their own.

**Keys:** add `ANTHROPIC_API_KEY` (AI features), `VOYAGE_API_KEY` (semantic
search), `SMTP_URL` and `MAIL_FROM` (email), or the `S3_*` settings (media in
object storage) to `/opt/nordpress/.env`, then run
`cd /opt/nordpress && docker compose up -d`. `.env.example` lists them all.

## Moving a site here

From another Nordpress host, the hosted beta included:

1. On the old site: **Tools → Backups → Download a backup now.** The file has
   everything: posts, pages, media, settings and accounts.
2. Install Nordpress here, open the new site and create an account (it is
   replaced in the next step).
3. On the new site: **Tools → Backups → Restore**, and choose the file.
4. Log in with your old email and password. Then point the domain here, and
   update `SITE_URL` in `.env` if the address changed.

From WordPress, Wix, Squarespace or any other site, use **Tools → Site
Importer** instead; see [Migrating from WordPress](migrating-from-wordpress.md).

## Docker platforms

`docker-compose.yml` in the repository runs Nordpress and Postgres (with
pgvector). Coolify, Dokploy, CapRover, Portainer and similar platforms can
deploy it from the Git repository. Set at least `SITE_URL`,
`BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and `POSTGRES_PASSWORD`.
Leave `COMPOSE_PROFILES` unset, since the platform provides HTTPS, and keep
the volumes: `build` holds the built site, and `uploads` and `backups` hold
your files.

## Node.js hosts

You need Node 24 and Postgres 15 or newer with the pgvector extension. Neon,
Supabase, Amazon RDS, DigitalOcean and most managed Postgres services have it.

```bash
pnpm install
pnpm migrate   # applies database changes
pnpm build     # needs DATABASE_URL: pages are prerendered from the database
pnpm start
```

The `README` lists the settings. Without a persistent disk (serverless hosts
such as Vercel), set `STORAGE_DRIVER=s3` for uploads. Also call the cron
endpoints on a schedule: `/api/cron/site-checks` and `/api/cron/backup` daily,
and `/api/cron/newsletter` every few minutes, with
`Authorization: Bearer <CRON_SECRET>`.

## Shared PHP hosting

Plans that only run PHP (most cPanel and Plesk plans) can't run Nordpress,
which needs Node.js and Postgres. Some providers add a Node.js app option to
cPanel; with that and a Postgres database from a managed service, follow
[Node.js hosts](#nodejs-hosts). Otherwise the simplest path is a small VPS,
which costs about as much as shared hosting, and [one command](#one-command).

## Keeping it healthy

- **Backups** run daily into the `backups` volume (**Tools → Backups**). Copy
  them off the server from time to time; with `STORAGE_DRIVER=s3` they're
  kept in object storage instead.
- **Logs:** `cd /opt/nordpress && docker compose logs -f app`.
- **Before real visitors:** go through the
  [production checklist](production-checklist.md).
