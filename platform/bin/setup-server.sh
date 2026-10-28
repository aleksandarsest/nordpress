#!/bin/bash
# Sets up the hosting platform on an Ubuntu server with Node 24, Postgres
# and nginx (steps 1-6 of platform/README.md). Run as root; safe to run
# again. Passwords are made here and stay on the server.
#
#   ssh root@server 'bash -s -- aleksa.me' < platform/bin/setup-server.sh
#
# Doesn't touch nginx: that's a separate, deliberate step.
set -euo pipefail

DOMAIN=${1:?usage: setup-server.sh <domain>}
APP=/opt/nordpress
REPO=https://github.com/aleksandarsest/nordpress.git
export DEBIAN_FRONTEND=noninteractive LC_ALL=C.UTF-8
cd /

step() { printf '\n== %s\n' "$*"; }
psql_admin() { sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 "$@"; }

node -v | grep -q '^v2[4-9]' || { echo "Needs Node 24 or newer (found $(node -v))."; exit 1; }
PG=$(sudo -u postgres psql -XAtc "show server_version_num" | cut -c1-2)

step "pgvector for Postgres $PG"
if [ -f "/usr/share/postgresql/$PG/extension/vector.control" ]; then
  echo "already installed"
else
  apt-get install -y -q "postgresql-server-dev-$PG" build-essential >/dev/null
  rm -rf /tmp/pgvector
  git clone -q --branch v0.8.1 --depth 1 https://github.com/pgvector/pgvector.git /tmp/pgvector
  nice make -C /tmp/pgvector -s >/dev/null
  make -C /tmp/pgvector -s install >/dev/null
  rm -rf /tmp/pgvector
  echo "installed"
fi

step "Databases"
mkdir -p /etc/nordpress
chmod 755 /etc/nordpress
ENV=/etc/nordpress/platform.env
if [ -f "$ENV" ]; then
  echo "settings exist in $ENV; leaving the databases as they are"
else
  platform_pw=$(openssl rand -hex 24)
  admin_pw=$(openssl rand -hex 24)
  psql_admin -v platform_pw="$platform_pw" -v admin_pw="$admin_pw" <<'SQL'
select format('create role nordpress_platform login password %L', :'platform_pw')
  where not exists (select 1 from pg_roles where rolname = 'nordpress_platform') \gexec
select format('alter role nordpress_platform password %L', :'platform_pw') \gexec
select 'create database nordpress_platform owner nordpress_platform'
  where not exists (select 1 from pg_database where datname = 'nordpress_platform') \gexec
select format('create role nordpress_admin login createdb createrole password %L', :'admin_pw')
  where not exists (select 1 from pg_roles where rolname = 'nordpress_admin') \gexec
select format('alter role nordpress_admin password %L', :'admin_pw') \gexec
select 'create database np_template owner nordpress_admin'
  where not exists (select 1 from pg_database where datname = 'np_template') \gexec
\c np_template
create extension if not exists vector;
SQL
  # Names other apps already use under this domain can't be signed up for
  reserved=$(grep -ho "server_name[^;]*" /etc/nginx/sites-enabled/* 2>/dev/null |
    tr ' ' '\n' | grep "\.${DOMAIN//./\\.}$" | sed "s/\.${DOMAIN//./\\.}$//" |
    grep -v '\*' | sort -u | paste -sd, - || true)
  (
    umask 077
    cat >"$ENV" <<EOF
PLATFORM_DOMAIN=$DOMAIN
PORT=3100
PLATFORM_SECRET=$(openssl rand -base64 32)
PLATFORM_DATABASE_URL=postgres://nordpress_platform:$platform_pw@127.0.0.1:5432/nordpress_platform
ADMIN_DATABASE_URL=postgres://nordpress_admin:$admin_pw@127.0.0.1:5432/postgres
MAX_SITES=10
MAX_AWAKE=2
IDLE_MINUTES=15
SITE_HEAP_MB=160
RESERVED_SUBDOMAINS=$reserved
PUBLIC_IP=$(curl -fsS4 --max-time 10 https://api.ipify.org || true)
SMTP_URL=
MAIL_FROM=
EOF
  )
  echo "created; settings in $ENV"
  echo "reserved names: $reserved"
fi

# Sites' own domains get certificates through certbot's nginx plugin
command -v certbot >/dev/null && dpkg -s python3-certbot-nginx >/dev/null 2>&1 ||
  apt-get install -y -q certbot python3-certbot-nginx >/dev/null
grep -q '^PUBLIC_IP=.' "$ENV" ||
  echo "PUBLIC_IP=$(curl -fsS4 --max-time 10 https://api.ipify.org)" >>"$ENV"

step "The app in $APP"
id nordpress >/dev/null 2>&1 ||
  useradd --system --home-dir "$APP" --shell /usr/sbin/nologin nordpress
if [ -d "$APP/.git" ]; then
  git -C "$APP" pull -q --ff-only
else
  git clone -q "$REPO" "$APP"
fi
(cd "$APP" && nice npx -y pnpm@12.15.0 install --frozen-lockfile --prod --reporter=silent)
echo "at $(git -C "$APP" rev-parse --short HEAD)"

step "Helper, services and sudo rule"
install -m 755 "$APP/platform/bin/np-site" "$APP/platform/bin/np-platform" /usr/local/sbin/
install -m 644 "$APP/platform/systemd/nordpress-site@.service" "$APP/platform/systemd/nordpress-platform.service" /etc/systemd/system/
install -m 440 "$APP/platform/systemd/sudoers-nordpress" /etc/sudoers.d/nordpress
visudo -cq
systemctl daemon-reload
mkdir -p /var/lib/nordpress/sites
chmod 755 /var/lib/nordpress /var/lib/nordpress/sites
echo "done"

step "Build"
np-site template

step "Platform"
systemctl enable -q --now nordpress-platform
systemctl restart nordpress-platform
for _ in $(seq 1 30); do
  curl -fs -o /dev/null http://127.0.0.1:3100/health && break
  sleep 1
done
curl -fs -o /dev/null http://127.0.0.1:3100/health &&
  echo "running on 127.0.0.1:3100" ||
  { echo "not answering; see: journalctl -u nordpress-platform"; exit 1; }

printf '\nDone. Next: point nginx at 127.0.0.1:3100 (platform/README.md, step 8).\n'
