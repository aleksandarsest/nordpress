#!/usr/bin/env bash
# Nordpress on your own server, with HTTPS, in one command:
#
#   curl -fsSL https://raw.githubusercontent.com/aleksandarsest/nordpress/main/install.sh | sudo bash
#
# Works on any 64-bit Linux server with systemd (Ubuntu, Debian, Fedora, ...)
# at any provider. No Docker: the site runs as a service with its database
# built in, and Caddy gets and renews the HTTPS certificate. It checks the
# server first and changes nothing if something is missing. Run it again to
# upgrade; your content stays.
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
#   DIR=/opt/nordpress   where it's installed; the content is in $DIR/data
#   HTTPS=caddy|none     "none" when another web server (nginx, Apache)
#                        already uses ports 80 and 443; the site then listens
#                        on 127.0.0.1 for it
#   DATABASE_URL=...     a PostgreSQL server (15+, with pgvector) to use
#                        instead of the built-in database
set -euo pipefail

REPO=aleksandarsest/nordpress
RELEASE=https://github.com/$REPO/releases/download/platform-build
CADDY_VERSION=2.11.7
DIR=${DIR:-/opt/nordpress}
DOMAIN=${DOMAIN:-}
HTTPS=${HTTPS:-}
LOG=/var/log/nordpress-install.log
# Free disk the install needs: Node, the site, its packages and room to grow
NEED_DISK_MB=2500

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
port_free() { ! ss -ltnH "( sport = :$1 )" 2>/dev/null | grep -q .; }
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
      "https://github.com/$REPO/issues"
  fi
}

[ "$(id -u)" = 0 ] || problem "The installer needs to run as root." \
  "Run: curl -fsSL https://raw.githubusercontent.com/$REPO/main/install.sh | sudo bash"
[ "$(uname -s)" = Linux ] || problem "Nordpress installs on a Linux server." \
  "Rent a small Linux server (Ubuntu) from any provider and run this there."
: >>"$LOG"
cd /

title "Nordpress installer"

if [ -f "$DIR/docker-compose.yml" ]; then
  problem "This server has the Docker version of Nordpress in $DIR." \
    "This installer doesn't use Docker. To move to it: download a backup (Tools → Backups)," \
    "run this installer with DIR=/opt/nordpress-site, then restore the backup there."
fi

UPGRADE=""
if [ -f "$DIR/.env" ]; then
  UPGRADE=1
  DOMAIN=${DOMAIN:-$(sed -n 's|^SITE_URL=https\?://||p' "$DIR/.env" | head -1)}
  [ -n "$HTTPS" ] || { [ -f "$DIR/Caddyfile" ] && HTTPS=caddy || HTTPS=none; }
  echo "  Upgrading the site at $DOMAIN."
fi

# ---- 1. Is this server ready? Nothing changes until every check passes.
title "Checking the server"

command -v systemctl >/dev/null && [ -d /run/systemd/system ] ||
  problem "This server doesn't run systemd." "Use Ubuntu, Debian, Fedora or another common Linux."
case "$(uname -m)" in
  x86_64) ARCH=x64 CADDY_ARCH=amd64 ;;
  aarch64 | arm64) ARCH=arm64 CADDY_ARCH=arm64 ;;
  *) problem "This server's processor ($(uname -m)) isn't supported." "Use a 64-bit Intel, AMD or ARM server." ;;
esac
for tool in curl tar xz sha256sum sha512sum; do
  command -v $tool >/dev/null || problem "The server is missing \"$tool\"." \
    "Install it (for example: apt-get install -y curl tar xz-utils coreutils) and run this again."
done
ok "Linux with systemd ($(uname -m))"

disk=$(free_mb /)
needed=$NEED_DISK_MB
[ -n "$UPGRADE" ] && needed=1500
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
  if ! port_free 80 || ! port_free 443; then
    echo
    echo "  Another web server (nginx or Apache, probably) already uses this server's"
    echo "  web ports. Nordpress can run behind it: it listens on 127.0.0.1, and you"
    echo "  add a few lines to that web server's settings (shown at the end)."
    [ "$(ask "Run behind it? [Y/n] ")" != n ] ||
      problem "Stopped: ports 80 and 443 are in use." \
        "Stop the other web server, or run the installer again and answer Y."
    HTTPS=none
  fi
fi
[ "$HTTPS" = caddy ] && ok "Web ports 80 and 443 are free" || ok "Runs behind your web server"

if [ -z "$DOMAIN" ]; then
  [ -n "$INTERACTIVE" ] || problem "No domain given." \
    "Run it as: curl -fsSL https://raw.githubusercontent.com/$REPO/main/install.sh | DOMAIN=example.com bash"
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

# The newest version GitHub has built
VERSION=$(curl -fsSL --max-time 20 "$RELEASE/nordpress-build.sha") ||
  problem "Couldn't reach GitHub to download Nordpress." "Check the server's internet connection and run this again."
CURRENT=$(cat "$DIR/app/.version" 2>/dev/null || true)

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

id nordpress >/dev/null 2>&1 ||
  step "Creating the nordpress user" useradd --system --home-dir "$DIR" --shell /usr/sbin/nologin nordpress
mkdir -p "$DIR/data/uploads" "$DIR/data/backups" "$DIR/data/db" "$DIR/data/caddy"
chown -R nordpress: "$DIR/data"
chmod 700 "$DIR/data"

NEW=$DIR/app.new
rm -rf "$NEW"
if [ "$VERSION" = "$CURRENT" ]; then
  ok "Nordpress is up to date (${VERSION:0:7})"
else
  mkdir -p "$NEW"
  step "Downloading Nordpress ${VERSION:0:7}" sh -c \
    "curl -fsSL https://codeload.github.com/$REPO/tar.gz/$VERSION | tar -xz --strip-components=1 -C '$NEW'"

  # Node, in the version Nordpress is made for, unless the server has it
  NODE_VERSION=$(tr -d 'v \n' <"$NEW/.nvmrc")
  if [ "$(node -v 2>/dev/null)" = "v$NODE_VERSION" ]; then
    NODE_BIN=$(dirname "$(command -v node)")
    ok "Node $NODE_VERSION is installed"
  elif [ "$("$DIR/node/bin/node" -v 2>/dev/null)" = "v$NODE_VERSION" ]; then
    NODE_BIN=$DIR/node/bin
    ok "Node $NODE_VERSION is installed"
  else
    get_node() {
      local name="node-v$NODE_VERSION-linux-$ARCH"
      local base="https://nodejs.org/dist/v$NODE_VERSION"
      local tmp
      tmp=$(mktemp -d)
      curl -fsSL -o "$tmp/$name.tar.xz" "$base/$name.tar.xz"
      curl -fsSL "$base/SHASUMS256.txt" | grep " $name.tar.xz\$" | (cd "$tmp" && sha256sum -c -)
      rm -rf "$DIR/node"
      mkdir -p "$DIR/node"
      tar -xJf "$tmp/$name.tar.xz" --strip-components=1 -C "$DIR/node"
      rm -rf "$tmp"
    }
    step "Installing Node $NODE_VERSION (for Nordpress only)" get_node
    NODE_BIN=$DIR/node/bin
  fi
  export PATH="$NODE_BIN:$PATH"

  step "Installing its packages" sh -c \
    "cd '$NEW' && npx -y pnpm@\$(node -p \"require('./package.json').packageManager.split('@')[1].split('+')[0]\") install --prod --frozen-lockfile --reporter=silent"
  step "Downloading the ready-made site" sh -c \
    "curl -fsSL $RELEASE/nordpress-build.tar.gz | tar -xz -C '$NEW'"
  [ -f "$NEW/.next/BUILD_ID" ] || problem "The download wasn't a complete site." "Run the installer again in a few minutes."
  # The site's content stays in $DIR/data across upgrades
  rm -rf "$NEW/storage"
  ln -s "$DIR/data" "$NEW/storage"
  echo "$VERSION" >"$NEW/.version"
  echo "$NODE_BIN" >"$NEW/.node-bin"
  chown -R nordpress: "$NEW/.next"
fi
NODE_BIN=$(cat "$NEW/.node-bin" 2>/dev/null || cat "$DIR/app/.node-bin")

if [ ! -f "$DIR/.env" ]; then
  PORT=3000
  while ! port_free "$PORT"; do PORT=$((PORT + 1)); done
  write_settings() (
    umask 077
    cat >"$DIR/.env" <<EOF
# Nordpress settings. Add keys here (see .env.example in the app folder for
# all of them), then run: systemctl restart nordpress
SITE_URL=https://$DOMAIN
BETTER_AUTH_URL=https://$DOMAIN
BETTER_AUTH_SECRET=$(head -c 32 /dev/urandom | base64)
CRON_SECRET=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
PORT=$PORT
UPLOADS_DIR=$DIR/data/uploads
BACKUP_DIR=$DIR/data/backups
EMBEDDED_DB_DIR=$DIR/data/db
$([ -n "${DATABASE_URL:-}" ] && echo "DATABASE_URL=$DATABASE_URL" || echo "# The database is built in, in $DIR/data/db. For a PostgreSQL server instead:
# DATABASE_URL=postgres://user:password@host:5432/nordpress")
ANTHROPIC_API_KEY=
EOF
  )
  step "Creating passwords and settings" write_settings
fi
PORT=$(sed -n 's/^PORT=//p' "$DIR/.env")

write_service() {
  cat >/etc/systemd/system/nordpress.service <<EOF
# Nordpress (install.sh). Settings: $DIR/.env
[Unit]
Description=Nordpress
After=network-online.target
Wants=network-online.target

[Service]
User=nordpress
WorkingDirectory=$DIR/app
EnvironmentFile=$DIR/.env
Environment=NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOME=$DIR/data PATH=$NODE_BIN:/usr/local/bin:/usr/bin:/bin
ExecStart=/bin/sh scripts/serve.sh
Restart=always
RestartSec=3
TimeoutStopSec=30
NoNewPrivileges=yes
ProtectSystem=full
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable -q nordpress
}
step "Setting up the Nordpress service" write_service

if [ "$HTTPS" = caddy ]; then
  if [ "$("$DIR/bin/caddy" version 2>/dev/null | cut -d' ' -f1)" != "v$CADDY_VERSION" ]; then
    get_caddy() {
      local name="caddy_${CADDY_VERSION}_linux_$CADDY_ARCH.tar.gz"
      local base="https://github.com/caddyserver/caddy/releases/download/v$CADDY_VERSION"
      local tmp
      tmp=$(mktemp -d)
      curl -fsSL -o "$tmp/$name" "$base/$name"
      curl -fsSL "$base/caddy_${CADDY_VERSION}_checksums.txt" | grep " $name\$" | (cd "$tmp" && sha512sum -c -)
      mkdir -p "$DIR/bin"
      tar -xzf "$tmp/$name" -C "$DIR/bin" caddy
      rm -rf "$tmp"
    }
    step "Installing Caddy $CADDY_VERSION (HTTPS)" get_caddy
  fi
  write_caddy() {
    cat >"$DIR/Caddyfile" <<EOF
# HTTPS for Nordpress (install.sh); Caddy gets and renews the certificate
{
	skip_install_trust
}

$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$PORT
}
EOF
    cat >/etc/systemd/system/nordpress-caddy.service <<EOF
# HTTPS in front of Nordpress (install.sh)
[Unit]
Description=Caddy for Nordpress
After=network-online.target
Wants=network-online.target

[Service]
User=nordpress
Environment=XDG_DATA_HOME=$DIR/data/caddy XDG_CONFIG_HOME=$DIR/data/caddy
ExecStart=$DIR/bin/caddy run --config $DIR/Caddyfile --adapter caddyfile
ExecReload=$DIR/bin/caddy reload --config $DIR/Caddyfile --adapter caddyfile
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=always
NoNewPrivileges=yes
ProtectSystem=full
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable -q nordpress-caddy
  }
  step "Setting up HTTPS for $DOMAIN" write_caddy
fi

wait_until_up() {
  local code
  for _ in $(seq 1 90); do
    # Any answer short of a server error means it's up (before setup, it redirects to the installer)
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/login" || true)
    if [ "${code:-000}" != 000 ] && [ "$code" -lt 500 ]; then return 0; fi
    sleep 2
  done
  journalctl -u nordpress -n 40 --no-pager
  return 1
}

if [ -d "$NEW" ]; then
  # Switch to the new version; if it doesn't start, go back to the old one
  switch() {
    systemctl stop nordpress || true
    rm -rf "$DIR/app.old"
    if [ -d "$DIR/app" ]; then mv "$DIR/app" "$DIR/app.old"; fi
    mv "$NEW" "$DIR/app"
    systemctl start nordpress
  }
  step "Starting the site" switch
  if ! wait_until_up >>"$LOG" 2>&1; then
    if [ -d "$DIR/app.old" ]; then
      systemctl stop nordpress || true
      rm -rf "$DIR/app.failed"
      mv "$DIR/app" "$DIR/app.failed"
      mv "$DIR/app.old" "$DIR/app"
      systemctl start nordpress
      problem "The new version didn't start, so the previous one is back." \
        "Details: $LOG and journalctl -u nordpress"
    fi
    problem "The site didn't start." "Details: $LOG and journalctl -u nordpress"
  fi
  ok "The site answers"
  rm -rf "$DIR/app.old"
else
  step "Restarting the site" systemctl restart nordpress
  step "Waiting for the site to answer" wait_until_up
fi
# A reload keeps serving while it picks up the settings
if [ "$HTTPS" = caddy ]; then step "Starting HTTPS" systemctl reload-or-restart nordpress-caddy; fi

# ---- 3. Done
title "${green}Nordpress is running.${plain}"
if [ "$HTTPS" = caddy ]; then
  cat <<EOF

  Open ${bold}https://$DOMAIN${plain} to create your account and set up your site.
EOF
else
  cat <<EOF

  It listens on 127.0.0.1:$PORT. Point your web server at it; for nginx, in the
  server block for $DOMAIN:

    location / {
      proxy_pass http://127.0.0.1:$PORT;
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
  Content (database, uploads, backups): $DIR/data
EOF
