# Nordpress hosting platform

Lets people sign up at `aleksa.me` and get their own Nordpress site at
`name.aleksa.me` in about a minute. Each site gets its own container, database
and storage. A small Node service in front handles the platform pages and
forwards each site's traffic to that site's container.

```
browser ─▶ nginx (TLS, aleksa.me + *.aleksa.me) ─▶ platform :3100
                                                      ├─ aleksa.me: home, signup, login, your sites
                                                      └─ name.aleksa.me ─▶ np-site-name:3000
np-db (Postgres + pgvector): the platform's tables, and one database per site
```

All sites share one build: `cli.ts template` builds Nordpress once against an
empty template database, and each new site gets a copy. When a site starts it
expires its caches, so it shows its own content, not the template's.

## Requirements

- A server with at least 4 GB of memory (each site uses up to 450 MB; the
  template build needs about 2 GB while it runs), Docker, and nginx.
- DNS for the domain: an `A` record for `aleksa.me` and one for `*.aleksa.me`
  pointing at the server.

## Deploying

1. **Image.** On the server, in a checkout of this repository:
   `docker build -t nordpress:latest .`
2. **Settings.** `cp platform/.env.example platform/.env` and fill it in.
   List every subdomain already used by other apps in `RESERVED_SUBDOMAINS`,
   so nobody can sign up for those names.
3. **Start.**
   `docker compose -f platform/docker-compose.yml --env-file platform/.env up -d`
4. **Template.**
   `docker compose -f platform/docker-compose.yml --env-file platform/.env exec platform node platform/src/cli.ts template`
5. **Certificate** for the domain and every subdomain, through DigitalOcean DNS
   (needs an API token with write access to the domain, kept in a root-only
   file):

   ```
   apt install python3-certbot-dns-digitalocean
   certbot certonly --dns-digitalocean --dns-digitalocean-credentials /root/.digitalocean.ini \
     --cert-name aleksa.me-wildcard -d aleksa.me -d '*.aleksa.me'
   ```
6. **nginx.** Remove the old `aleksa.me` server block, copy
   `platform/nginx/nordpress.conf` into `/etc/nginx/sites-available/`, enable
   it, then `nginx -t && systemctl reload nginx`. Subdomains with their own
   server block keep going to their apps.
7. **Invites.** `... exec platform node platform/src/cli.ts invite 1 "for Ana"`
   prints a code. Send people `https://aleksa.me/signup?invite=<code>`.

## Running it

`node platform/src/cli.ts <command>` inside the platform container:

| Command                | Does                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `invite [uses] [note]` | Makes an invite code                                                                                        |
| `invites`              | Lists invite codes and how many uses are left                                                               |
| `sites`                | Lists sites, owners and status                                                                              |
| `template`             | Rebuilds the shared build                                                                                   |
| `upgrade`              | After `docker build` of a new version: rebuilds the template and moves every site to it, keeping their data |
| `restart <subdomain>`  | Restarts one site                                                                                           |

The platform runs each site's scheduled work itself: newsletters every ten
minutes, and checks and backups once a day. Backups are kept in the site's
storage volume.

## Limits in the beta

`MAX_SITES` (default 10) sites in all, one per account, and an invite code to
sign up. Change the first in `platform/.env` and restart the platform.
