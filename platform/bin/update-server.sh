#!/bin/bash
# Moves the platform to the newest version that GitHub has built, then
# gives every site the new build. Run as root; does nothing when already
# current. With --auto it also installs a timer that runs it every night,
# so the server keeps itself up to date.
#
#   ssh root@server 'bash /opt/nordpress/platform/bin/update-server.sh --auto'
set -euo pipefail

APP=/opt/nordpress
RELEASE=https://github.com/aleksandarsest/nordpress/releases/download/platform-build
export LC_ALL=C.UTF-8
cd /

if [ "${1:-}" = --auto ]; then
  cat >/etc/systemd/system/nordpress-update.service <<UNIT
[Unit]
Description=Update the Nordpress platform
After=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/bash $APP/platform/bin/update-server.sh
UNIT
  cat >/etc/systemd/system/nordpress-update.timer <<UNIT
[Unit]
Description=Update the Nordpress platform every night

[Timer]
OnCalendar=*-*-* 04:00:00
RandomizedDelaySec=30m
Persistent=true

[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable -q --now nordpress-update.timer
  echo "The server now updates itself every night (journalctl -u nordpress-update)."
fi

# Only a version whose build GitHub has published
target=$(curl -fsSL "$RELEASE/nordpress-build.sha")
current=$(git -C "$APP" rev-parse HEAD)
if [ "$target" = "$current" ]; then
  echo "Up to date ($(git -C "$APP" rev-parse --short HEAD))."
  exit 0
fi
git -C "$APP" fetch -q origin main
git -C "$APP" merge-base --is-ancestor "$current" "$target" ||
  { echo "The published build isn't newer than this server's version; leaving it."; exit 0; }
git -C "$APP" merge -q --ff-only "$target"
(cd "$APP" && nice npx -y pnpm@12.15.0 install --frozen-lockfile --prod --reporter=silent)

install -m 755 "$APP/platform/bin/np-site" "$APP/platform/bin/np-platform" /usr/local/sbin/
install -m 644 "$APP/platform/systemd/nordpress-site@.service" "$APP/platform/systemd/nordpress-platform.service" /etc/systemd/system/
install -m 440 "$APP/platform/systemd/sudoers-nordpress" /etc/sudoers.d/nordpress
visudo -cq
systemctl daemon-reload

# Downloads the new build, and every site starts on it from its next visit
np-platform upgrade
systemctl restart nordpress-platform
echo "Updated to $(git -C "$APP" rev-parse --short HEAD)."
