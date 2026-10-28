#!/usr/bin/env bash
# Nordpress on your own server, with HTTPS, in one command:
#
#   curl -fsSL https://raw.githubusercontent.com/aleksandarsest/nordpress/main/install.sh | sudo bash
#
# Works on any Linux server Docker supports (Ubuntu, Debian, Fedora, ...) at
# any provider. Point your domain at the server first. Run it again to
# upgrade; your content stays.
#
# Settings, all optional (it asks for the domain if it isn't given):
#   DOMAIN=example.com   the site's address
#   DIR=/opt/nordpress   where it's installed
#   HTTPS=caddy|none     "none" when another web server (nginx, Apache) already
#                        uses ports 80 and 443; the site then listens on
#                        127.0.0.1:3000 for it
set -euo pipefail

REPO=https://github.com/aleksandarsest/nordpress.git
DIR=${DIR:-/opt/nordpress}
DOMAIN=${DOMAIN:-}
HTTPS=${HTTPS:-}

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() {
  printf '\n\033[31m%s\033[0m\n' "$*" >&2
  exit 1
}
ask() {
  # Piped into bash, the script itself is stdin: read answers from the terminal
  local answer
  if [ -r /dev/tty ]; then
    read -r -p "$1" answer </dev/tty || true
  fi
  printf '%s' "${answer:-}"
}

[ "$(id -u)" = 0 ] || fail "Run it as root: curl -fsSL ... | sudo bash"
[ "$(uname -s)" = Linux ] || fail "Nordpress installs on a Linux server."

# Run from a checkout (./install.sh), it installs that checkout
if [ -f "${BASH_SOURCE[0]:-}" ] && [ -f "$(dirname "${BASH_SOURCE[0]}")/docker-compose.yml" ]; then
  DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  FROM_CHECKOUT=1
fi

say "Nordpress installer"

# An existing install keeps its settings
if [ -f "$DIR/.env" ]; then
  existing=$(sed -n 's|^SITE_URL=https\?://||p' "$DIR/.env" | head -1)
  DOMAIN=${DOMAIN:-$existing}
  if [ -z "$HTTPS" ]; then
    grep -q '^COMPOSE_PROFILES=https' "$DIR/.env" && HTTPS=caddy || HTTPS=none
  fi
  echo "Upgrading the site at $DOMAIN ($DIR)."
fi

if [ -z "$DOMAIN" ]; then
  DOMAIN=$(ask "Your site's domain (e.g. example.com): ")
fi
DOMAIN=$(printf '%s' "$DOMAIN" | tr 'A-Z' 'a-z' | sed 's|^https\?://||; s|/.*$||')
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ || "$DOMAIN" = localhost ]] ||
  fail "\"$DOMAIN\" isn't a domain name."

# HTTPS needs ports 80 and 443; if a web server already has them, step aside
if [ -z "$HTTPS" ]; then
  HTTPS=caddy
  if command -v ss >/dev/null && ss -ltnH '( sport = :80 or sport = :443 )' | grep -q .; then
    echo "Another web server is already using port 80 or 443 on this machine."
    [ "$(ask "Install without HTTPS and put the site behind it on 127.0.0.1:3000? [Y/n] ")" != n ] ||
      fail "Free ports 80 and 443 first, or run with HTTPS=none."
    HTTPS=none
  fi
fi

# The certificate only works once the domain points here
if [ "$HTTPS" = caddy ] && [ "$DOMAIN" != localhost ] && [ -z "${SKIP_DNS_CHECK:-}" ]; then
  here=$(curl -fsS4 --max-time 5 https://api.ipify.org || true)
  there=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}' || true)
  if [ -n "$here" ] && [ "$here" != "$there" ]; then
    echo "$DOMAIN points to ${there:-nowhere yet}, but this server is $here."
    echo "Add an A record for $DOMAIN with the value $here at your domain's DNS provider."
    [ "$(ask "Continue anyway? HTTPS starts working once it points here. [y/N] ")" = y ] ||
      fail "Run this again once $DOMAIN points to $here."
  fi
fi

# Building the site needs about 2 GB of memory; small servers get swap
mem=$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)
swap=$(awk '/SwapTotal/ {print int($2 / 1024)}' /proc/meminfo)
if [ $((mem + swap)) -lt 2500 ] && [ ! -f /swapfile-nordpress ]; then
  say "Adding 2 GB of swap (this server has ${mem} MB of memory)"
  fallocate -l 2G /swapfile-nordpress || dd if=/dev/zero of=/swapfile-nordpress bs=1M count=2048
  chmod 600 /swapfile-nordpress
  mkswap /swapfile-nordpress >/dev/null
  swapon /swapfile-nordpress
  grep -q swapfile-nordpress /etc/fstab || echo '/swapfile-nordpress none swap sw 0 0' >>/etc/fstab
fi

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  say "Installing Docker (from get.docker.com)"
  curl -fsSL https://get.docker.com | sh
fi
command -v git >/dev/null || {
  say "Installing git"
  if command -v apt-get >/dev/null; then apt-get install -y -q git; else dnf install -y -q git; fi
}

if [ -z "${FROM_CHECKOUT:-}" ]; then
  if [ -d "$DIR/.git" ]; then
    say "Getting the latest version"
    git -C "$DIR" pull -q --ff-only
  else
    say "Downloading Nordpress to $DIR"
    git clone -q "$REPO" "$DIR"
  fi
fi
cd "$DIR"

if [ ! -f .env ]; then
  say "Creating the settings"
  (
    umask 077
    cat >.env <<EOF
# Nordpress settings. Add keys here (see .env.example for all of them), then
# run: docker compose up -d
SITE_URL=https://$DOMAIN
SITE_DOMAIN=$DOMAIN
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
CRON_SECRET=$(openssl rand -hex 24)
$([ "$HTTPS" = caddy ] && echo "COMPOSE_PROFILES=https" || echo "# Behind your own web server, which proxies to 127.0.0.1:3000")
APP_BIND=127.0.0.1
ANTHROPIC_API_KEY=
EOF
  )
fi

say "Starting Nordpress (the first start builds the site: a few minutes)"
docker compose up -d --build --remove-orphans

for i in $(seq 1 180); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/login || true)
  # Any answer short of a server error means it's up (before setup, it redirects to the installer)
  [ "${code:-000}" != 000 ] && [ "$code" -lt 500 ] && break
  [ $((i % 12)) = 0 ] && echo "  still building ($((i * 5 / 60)) min)…"
  sleep 5
done
[ "${code:-000}" != 000 ] && [ "$code" -lt 500 ] || fail "The site didn't start. See what happened with: cd $DIR && docker compose logs app"

say "Nordpress is running."
if [ "$HTTPS" = caddy ]; then
  echo "Open https://$DOMAIN to create your account and set up the site."
else
  cat <<EOF
It listens on 127.0.0.1:3000. Point your web server at it, for example in nginx:

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto https;
  }

then open https://$DOMAIN to create your account.
EOF
fi
cat <<EOF

Moving a site here? On the old site, Tools → Backups → download a backup;
here, create your account, then Tools → Backups → restore it.

Upgrade later by running this installer again. Settings: $DIR/.env
EOF
