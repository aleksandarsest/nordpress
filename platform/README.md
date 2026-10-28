# Nordpress hosting platform

Lets people sign up at `aleksa.me` and get their own Nordpress site at
`name.aleksa.me` in about a minute. No Docker: each site is a systemd service
running as its own Linux user, with its own folder and its own database in
the server's Postgres. A small Node service in front serves the platform's
pages and forwards each site's traffic.

```
browser ─▶ nginx (TLS, aleksa.me + *.aleksa.me) ─▶ platform :3100 (user nordpress)
                                                      ├─ aleksa.me: home, signup, login, your sites
                                                      └─ name.aleksa.me ─▶ nordpress-site@name on 127.0.0.1:61xx
Postgres: nordpress_platform (accounts, sites, invites) and np_site_<name> per site
```

**One build for every site.** Next.js needs more memory to build than a small
server has, so GitHub Actions builds it (`.github/workflows/platform-build.yml`)
from an empty site on every push to main and publishes it as the
`platform-build` release. `np-platform template` downloads the build for the
version checked out on the server. Each site gets its own copy (Next.js writes
regenerated pages into it), and clears the build's cached pages when it starts.

**Sites sleep.** A site uses about 200 MB while it runs. It stops after
`IDLE_MINUTES` (15) without visitors and starts again on the next visit, which
takes a few seconds. At most `MAX_AWAKE` (2) run at once; waking another puts
the least recently visited to sleep. Newsletters go out from sites that are
awake; once a day each site wakes for its checks and backup.

**Only one thing runs as root:** `np-site` (`platform/bin/np-site`), which
creates, starts, stops, updates and removes sites. The platform may run it
through sudo and nothing else, and it checks every name it's given.

## Requirements

- Ubuntu with Node 24, Postgres 14 or newer, nginx and certbot.
- About 1 GB of disk for the app and the build, plus about 100 MB per site.
- DNS: `A` records for `aleksa.me` and `*.aleksa.me` pointing at the server.

## Setting up

`platform/bin/setup-server.sh` does steps 1 to 6 (and is safe to run again):
`ssh root@server 'bash -s -- aleksa.me' < platform/bin/setup-server.sh`.
By hand: run as root on the server, and replace each `PASSWORD` with its own
`openssl rand -hex 24`.

1. **pgvector**, if Postgres doesn't have it yet:

   ```
   apt install -y postgresql-server-dev-14 build-essential
   git clone --branch v0.8.1 --depth 1 https://github.com/pgvector/pgvector.git /tmp/pgvector
   make -C /tmp/pgvector && make -C /tmp/pgvector install
   ```
2. **Databases.** The platform's own, a role that creates each site's (not a
   superuser), and the template every site's database is copied from:

   ```
   sudo -u postgres psql <<'SQL'
   create role nordpress_platform login password 'PASSWORD';
   create database nordpress_platform owner nordpress_platform;
   create role nordpress_admin login createdb createrole password 'PASSWORD';
   create database np_template owner nordpress_admin;
   \c np_template
   create extension vector;
   SQL
   ```
3. **The app**, owned by root and read-only for everyone else:

   ```
   useradd --system --home-dir /opt/nordpress --shell /usr/sbin/nologin nordpress
   git clone https://github.com/aleksandarsest/nordpress.git /opt/nordpress
   cd /opt/nordpress && npx -y pnpm@12.15.0 install --frozen-lockfile --prod
   ```
4. **Helper, services and sudo rule:**

   ```
   install -m 755 platform/bin/np-site platform/bin/np-platform /usr/local/sbin/
   cp platform/systemd/*.service /etc/systemd/system/ && systemctl daemon-reload
   install -m 440 platform/systemd/sudoers-nordpress /etc/sudoers.d/nordpress && visudo -c
   mkdir -p /var/lib/nordpress/sites /etc/nordpress
   ```
5. **Settings:** `install -m 600 platform/.env.example /etc/nordpress/platform.env`,
   then fill it in. List every subdomain other apps already use in
   `RESERVED_SUBDOMAINS`, so nobody can sign up for those names.
6. **Build and start:** `np-platform template`, then
   `systemctl enable --now nordpress-platform`.
7. **Certificate** for the domain and every subdomain. Wildcards need a DNS
   check, here through DigitalOcean (an API token with write access to the
   domain, in a root-only file):

   ```
   apt install -y python3-certbot-dns-digitalocean
   certbot certonly --dns-digitalocean --dns-digitalocean-credentials /root/.digitalocean.ini \
     --cert-name aleksa.me-wildcard -d aleksa.me -d '*.aleksa.me'
   ```
8. **nginx.** Remove the old `aleksa.me` server block, copy
   `platform/nginx/nordpress.conf` to `/etc/nginx/sites-available/`, link it into
   `sites-enabled`, then `nginx -t && systemctl reload nginx`. Subdomains with
   their own server block keep going to their apps.
9. **Invites:** `np-platform invite 1 "for Ana"` prints a code. Send people
   `https://aleksa.me/signup?invite=<code>`.

## Running it

| Command                               | Does                                          |
| ------------------------------------- | --------------------------------------------- |
| `np-platform invite [uses] [note]`    | Makes an invite code                          |
| `np-platform invites`                 | Lists invite codes and how many uses are left |
| `np-platform sites`                   | Lists sites, owners and status                |
| `np-platform restart <name>`          | Restarts one site                             |
| `journalctl -u nordpress-platform`    | The platform's log                            |
| `journalctl -u nordpress-site@<name>` | One site's log                                |

**Upgrading**, after a push to main has finished its Platform build:

```
cd /opt/nordpress && git pull && npx -y pnpm@12.15.0 install --frozen-lockfile --prod
np-platform upgrade
systemctl restart nordpress-platform
```

Each site gets the new build and applies its database changes on its next
start. Backups are kept in each site's folder, under `storage/backups`.

## Limits in the beta

`MAX_SITES` (10) sites in all, one per account, and an invite code to sign
up. Change them in `/etc/nordpress/platform.env` and restart the platform.
