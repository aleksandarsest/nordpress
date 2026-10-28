#!/usr/bin/env bash
# Nordpress on your own server, with HTTPS, in one command:
#
#   curl -fsSL https://raw.githubusercontent.com/aleksandarsest/nordpress/main/install.sh | sudo bash
#
# Works on any Linux server Docker supports (Ubuntu, Debian, Fedora, ...) at
# any provider. It checks the server first and changes nothing if something
# is missing. Run it again to upgrade; your content stays.
#
# No terminal needed: when creating a server, paste this as its "user data"
# (DigitalOcean, Hetzner, Vultr, Linode, AWS and others have the field), and
# open the domain a few minutes later:
#
#   #!/bin/bash
#   curl -fsSL https://raw.githubusercontent.com/aleksandarsest/nordpress/main/install.sh | DOMAIN=example.com bash
#
# Settings, all optional (it asks for the domain if it isn't given):
#   DOMAIN=example.com   the site's address
#   DIR=/opt/nordpress   where it's installed
#   HTTPS=caddy|none     "none" when another web server (nginx, Apache)
#                        already uses ports 80 and 443; the site then listens
#                        on 127.0.0.1:3000 for it
set -euo pipefail

REPO=https://github.com/aleksandarsest/nordpress.git
DIR=${DIR:-/opt/nordpress}
DOMAIN=${DOMAIN:-}
HTTPS=${HTTPS:-}
LOG=/var/log/nordpress-install.log
# Free disk the install needs: the image, Postgres and room to grow
NEED_DISK_MB=3000

bold=$'\033[1m'
red=$'\033[31m'
green=$'\033[32m'
dim=$'\033[2m'
plain=$'\033[0m'
[ -t 1 ] || { bold='' red='' green='' dim='' plain=''; }

title() { printf '\n%s%s%s\n' "$bold" "$*" "$plain"; }
ok() { printf '  %s✓%s %s\n' "$green" "$plain" "$*"; }
problem() {
  # What went wrong and what to do, in plain words; nothing more happens
  printf '\n  %s✗ %s%s\n' "$red" "$1" "$plain" >&2
  shift
  for line in "$@"; do printf '    %s\n' "$line" >&2; done
  printf '\n' >&2
  exit 1
}
# Someone at a terminal answers questions; unattended (a server's "user
# data" at creation, CI) the defaults apply
INTERACTIVE=""
if (: </dev/tty) 2>/dev/null; then INTERACTIVE=1; fi
ask() {
  # Piped into bash, the script itself is stdin: read answers from the terminal
  local answer=""
  if [ -n "$INTERACTIVE" ]; then read -r -p "  $1" answer </dev/tty || true; fi
  printf '%s' "$answer"
}
free_mb() { df -Pm "$1" | awk 'NR == 2 {print $4}'; }
# Runs a step quietly: its output goes to the log, and only a ✓ shows
step() {
  local label=$1
  shift
  printf '  %s…%s %s' "$dim" "$plain" "$label"
  echo "== $label" >>"$LOG"
  if "$@" >>"$LOG" 2>&1; then
    printf '\r  %s✓%s %s\n' "$green" "$plain" "$label"
  else
    printf '\r  %s✗%s %s\n' "$red" "$plain" "$label"
    if [ "$(free_mb /)" -lt 300 ]; then
      problem "The server ran out of disk space." \
        "Free some space, or use a server with more disk, then run the installer again." \
        "Details: $LOG"
    fi
    printf '\n%s' "$dim" >&2
    tail -n 12 "$LOG" | sed 's/^/    /' >&2
    printf '%s' "$plain" >&2
    problem "\"$label\" didn't work." \
      "The lines above say why; everything is in $LOG." \
      "Running the installer again is safe. If it keeps failing, open an issue:" \
      "https://github.com/aleksandarsest/nordpress/issues"
  fi
}

[ "$(id -u)" = 0 ] || problem "The installer needs to run as root." \
  "Run: curl -fsSL https://raw.githubusercontent.com/aleksandarsest/nordpress/main/install.sh | sudo bash"
[ "$(uname -s)" = Linux ] || problem "Nordpress installs on a Linux server." \
  "Rent a small Linux server (Ubuntu) from any provider and run this there."
: >>"$LOG"

# Run from a checkout (./install.sh), it installs that checkout
if [ -f "${BASH_SOURCE[0]:-}" ] && [ -f "$(dirname "${BASH_SOURCE[0]}")/docker-compose.yml" ]; then
  DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  FROM_CHECKOUT=1
fi

title "Nordpress installer"

UPGRADE=""
if [ -f "$DIR/.env" ]; then
  UPGRADE=1
  DOMAIN=${DOMAIN:-$(sed -n 's|^SITE_URL=https\?://||p' "$DIR/.env" | head -1)}
  if [ -z "$HTTPS" ]; then
    grep -q '^COMPOSE_PROFILES=https' "$DIR/.env" && HTTPS=caddy || HTTPS=none
  fi
  echo "  Upgrading the site at $DOMAIN."
fi

# ---- 1. Is this server ready? Nothing changes until every check passes.
title "Checking the server"

disk=$(free_mb /)
needed=$NEED_DISK_MB
[ -n "$UPGRADE" ] && needed=1000
if [ "$disk" -lt "$needed" ]; then
  problem "Not enough free disk space: $disk MB free, $needed MB needed." \
    "Free some space, or use a server with a bigger disk (10 GB or more is comfortable)."
fi
ok "Disk space: $((disk / 1024)) GB free"

mem=$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)
swap=$(awk '/SwapTotal/ {print int($2 / 1024)}' /proc/meminfo)
[ "$mem" -ge 900 ] || problem "This server has ${mem} MB of memory; Nordpress needs 1 GB." \
  "Choose a server size with at least 1 GB of memory."
ok "Memory: ${mem} MB"

if [ -z "$HTTPS" ]; then
  HTTPS=caddy
  if command -v ss >/dev/null && ss -ltnH '( sport = :80 or sport = :443 )' | grep -q .; then
    echo
    echo "  Another web server (nginx or Apache, probably) already uses this server's"
    echo "  web ports. Nordpress can run behind it: it will listen on 127.0.0.1:3000,"
    echo "  and you add a few lines to that web server's settings (shown at the end)."
    [ "$(ask "Run behind it? [Y/n] ")" != n ] ||
      problem "Stopped: ports 80 and 443 are in use." \
        "Stop the other web server, or run the installer again and answer Y."
    HTTPS=none
  fi
fi
[ "$HTTPS" = caddy ] && ok "Web ports 80 and 443 are free" || ok "Runs behind your web server"

if [ -z "$DOMAIN" ]; then
  [ -n "$INTERACTIVE" ] || problem "No domain given." \
    "Run it as: curl -fsSL https://raw.githubusercontent.com/aleksandarsest/nordpress/main/install.sh | DOMAIN=example.com bash"
  echo
  DOMAIN=$(ask "Your site's address, like example.com: ")
fi
DOMAIN=$(printf '%s' "$DOMAIN" | tr 'A-Z' 'a-z' | sed 's|^https\?://||; s|/.*$||; s|^www\.||')
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ || "$DOMAIN" = localhost ]] ||
  problem "\"$DOMAIN\" isn't a web address." "Type it like example.com, without https:// or a path."

if [ "$HTTPS" = caddy ] && [ "$DOMAIN" != localhost ] && [ -z "${SKIP_DNS_CHECK:-}" ]; then
  here=$(curl -fsS4 --max-time 5 https://api.ipify.org || true)
  there=$(getent ahostsv4 "$DOMAIN" | awk 'NR == 1 {print $1}' || true)
  if [ -n "$here" ] && [ "$here" != "$there" ]; then
    echo
    echo "  $DOMAIN doesn't point to this server yet (it points to ${there:-nothing})."
    echo "  At the company where you bought the domain, open its DNS settings and add:"
    echo
    echo "      Type: A     Name: @     Value: $here"
    echo
    echo "  It can take a few minutes to work. The site can be installed now and gets"
    echo "  its HTTPS certificate once the domain points here."
    # Unattended, carry on: the certificate follows once DNS is in place
    [ -z "$INTERACTIVE" ] || [ "$(ask "Install now anyway? [y/N] ")" = y ] ||
      problem "Stopped until $DOMAIN points to $here." "Add the record above, then run the installer again."
  else
    ok "$DOMAIN points to this server"
  fi
fi

# ---- 2. Install
title "Installing"

if [ $((mem + swap)) -lt 1500 ] && [ ! -f /swapfile-nordpress ]; then
  add_swap() {
    fallocate -l 1G /swapfile-nordpress || dd if=/dev/zero of=/swapfile-nordpress bs=1M count=1024
    chmod 600 /swapfile-nordpress
    mkswap /swapfile-nordpress
    swapon /swapfile-nordpress
    grep -q swapfile-nordpress /etc/fstab || echo '/swapfile-nordpress none swap sw 0 0' >>/etc/fstab
  }
  step "Adding 1 GB of swap (extra room for a small server)" add_swap
fi

if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  ok "Docker is installed"
else
  step "Installing Docker" sh -c "curl -fsSL https://get.docker.com | sh"
fi
command -v git >/dev/null ||
  step "Installing git" sh -c "if command -v apt-get >/dev/null; then apt-get install -y -q git; else dnf install -y -q git; fi"

if [ -z "${FROM_CHECKOUT:-}" ]; then
  if [ -d "$DIR/.git" ]; then
    step "Getting the latest version" git -C "$DIR" pull -q --ff-only
  else
    step "Downloading Nordpress" git clone -q "$REPO" "$DIR"
  fi
fi
cd "$DIR"

if [ ! -f .env ]; then
  write_settings() (
    umask 077
    cat >.env <<EOF
# Nordpress settings. Add keys here (see .env.example for all of them),
# then run: cd $DIR && docker compose up -d
SITE_URL=https://$DOMAIN
SITE_DOMAIN=$DOMAIN
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
CRON_SECRET=$(openssl rand -hex 24)
$([ "$HTTPS" = caddy ] && echo "COMPOSE_PROFILES=https" || echo "# Behind your own web server, which forwards to 127.0.0.1:3000")
APP_BIND=127.0.0.1
ANTHROPIC_API_KEY=
EOF
  )
  step "Creating passwords and settings" write_settings
fi
if [ -n "${NORDPRESS_IMAGE:-}" ]; then
  grep -q '^NORDPRESS_IMAGE=' .env &&
    sed -i "s|^NORDPRESS_IMAGE=.*|NORDPRESS_IMAGE=$NORDPRESS_IMAGE|" .env ||
    echo "NORDPRESS_IMAGE=$NORDPRESS_IMAGE" >>.env
fi

step "Downloading the site (about 500 MB)" docker compose pull --quiet
step "Starting the site" docker compose up -d --remove-orphans

wait_until_up() {
  local code
  for _ in $(seq 1 90); do
    # Any answer short of a server error means it's up (before setup, it redirects to the installer)
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/login || true)
    if [ "${code:-000}" != 000 ] && [ "$code" -lt 500 ]; then return 0; fi
    sleep 2
  done
  docker compose logs --tail 40 app
  return 1
}
step "Waiting for the site to answer" wait_until_up
# Old images from earlier versions only take up disk
docker image prune -f >>"$LOG" 2>&1 || true

# ---- 3. Done
title "${green}Nordpress is running.${plain}"
if [ "$HTTPS" = caddy ]; then
  cat <<EOF

  Open ${bold}https://$DOMAIN${plain} to create your account and set up your site.
EOF
else
  cat <<EOF

  It listens on 127.0.0.1:3000. Point your web server at it; for nginx, in the
  server block for $DOMAIN:

    location / {
      proxy_pass http://127.0.0.1:3000;
      proxy_set_header Host \$host;
      proxy_set_header X-Forwarded-For \$remote_addr;
      proxy_set_header X-Forwarded-Proto https;
    }

  Then open ${bold}https://$DOMAIN${plain} to create your account.
EOF
fi
cat <<EOF

  Moving a site here? On the old site: Tools → Backups → Download a backup now.
  Here, after creating your account: Tools → Backups → Restore.

  To upgrade later, run the same command again. Settings: $DIR/.env
EOF
