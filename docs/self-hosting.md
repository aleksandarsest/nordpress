# Running Nordpress on your own hosting

Nordpress is yours to run anywhere: a server at any provider, or a Node.js
host. No Docker and no database server needed. Pick the first option that
fits.

| You have                                   | Use                                                     |
| ------------------------------------------ | ------------------------------------------------------- |
| A domain, and no wish to use a terminal    | [Without a terminal](#without-a-terminal)               |
| A Linux server (VPS) and a domain          | [One command](#one-command)                             |
| A server that already runs nginx or Apache | [One command](#one-command), behind your web server     |
| A Node.js host and a managed Postgres      | [Node.js hosts](#nodejs-hosts)                          |
| Shared PHP hosting (cPanel, Plesk) only    | Not enough on its own; see [below](#shared-php-hosting) |

## Without a terminal

Most providers let you give a new server a script to run when it starts
(it's called user data, an initialization script or cloud config). Paste
Nordpress's there, and the server installs itself.

1. **Create a server** at your provider: Ubuntu 24.04, at least 1 GB of
   memory. Where the form offers user data, paste this, with your domain
   instead of `example.com`:

   ```bash
   #!/bin/bash
   curl -fsSL https://raw.githubusercontent.com/aleksandarsest/nordpress/main/install.sh | DOMAIN=example.com bash
   ```

   | Provider        | Where to paste it                                                     |
   | --------------- | --------------------------------------------------------------------- |
   | DigitalOcean    | Create → Droplets → _Advanced options_ → _Add initialization scripts_ |
   | Hetzner Cloud   | Add server → _Cloud config_                                           |
   | Vultr           | Deploy → _Additional features_ → _Cloud-Init User-Data_               |
   | Linode (Akamai) | Create Linode → _Add User Data_                                       |
   | AWS Lightsail   | Create instance → _Add launch script_                                 |

2. **Point the domain at the server.** Once the server is created, copy its
   IP address. Where you bought the domain, open its DNS settings and add a
   record: type `A`, name `@`, value the IP address.
3. **Wait a few minutes**, then open your domain and create your account.

The site installs while the domain's DNS spreads, and gets its HTTPS
certificate as soon as the domain points at it. If the page doesn't open
after half an hour, check the DNS record. The installer's own log is
`/var/log/cloud-init-output.log` on the server.


**You need:** a Linux server with at least 1 GB of memory and 3 GB of free
disk, and a domain. Any provider works: Hetzner, DigitalOcean,
Linode, Vultr, OVH, Scaleway, AWS Lightsail, a machine at home.

1. **Point the domain at the server.** At your domain's DNS provider, add an
   `A` record for the domain with the server's IP address. It can take a few minutes to take effect.
2. **Log in to the server** (`ssh root@your-server-ip`) and run:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/aleksandarsest/nordpress/main/install.sh | sudo bash
   ```
3. **Open your domain** and create your account. The guided start takes it
   from there.

The installer first checks the server: disk, memory, the web ports, and
whether the domain points there. If something is missing it says what to do
and changes nothing. Then it:

- adds 1 GB of swap on servers with little memory;
- installs Node (its own copy, in `/opt/nordpress/node`, if the server
  doesn't have the right version) and Caddy, each checked against its
  published checksum;
- downloads the version of Nordpress that GitHub has already built, so the
  server never compiles anything;
- makes the passwords and keys, in `/opt/nordpress/.env`;
- keeps the content in `/opt/nordpress/data`: the database (built in, one
  folder), uploads and backups. To use a PostgreSQL server instead, run the
  installer with `DATABASE_URL=postgres://…`;
- starts the site and Caddy as services (`nordpress` and `nordpress-caddy`)
  that come back on their own after a reboot. Caddy gets the HTTPS
  certificate and renews it.

It shows each step with a ✓, and keeps the details in
`/var/log/nordpress-install.log`. A fresh install takes two or three minutes.

**Behind nginx or Apache.** If ports 80 and 443 are already taken, the
installer offers to skip HTTPS and listen on `127.0.0.1` (port 3000 or the
next free one) instead, and
prints the lines to add to your web server. To choose this up front, run it
with `HTTPS=none`.

**Upgrading:** run the same command again. Your content and settings stay;
database changes are applied on their own. If the new version doesn't
start, the previous one comes back.

**Keys:** add `ANTHROPIC_API_KEY` (AI features), `VOYAGE_API_KEY` (semantic
search), `SMTP_URL` and `MAIL_FROM` (email), or the `S3_*` settings (media in
object storage) to `/opt/nordpress/.env`, then run
`systemctl restart nordpress`. `.env.example` lists them all.

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

## Node.js hosts

You need Node 24. Use the built-in database (start with `scripts/serve.sh`
and a writable `storage` folder), or Postgres 15 or newer with the pgvector
extension. Neon,
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

- **Backups** run daily into `/opt/nordpress/data/backups` (**Tools →
  Backups**). Copy
  them off the server from time to time; with `STORAGE_DRIVER=s3` they're
  kept in object storage instead.
- **Logs:** `journalctl -u nordpress -f` (and `-u nordpress-caddy` for HTTPS).
- **Before real visitors:** go through the
  [production checklist](production-checklist.md).
