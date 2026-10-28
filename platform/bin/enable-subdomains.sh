#!/bin/bash
# Turns on name.<domain> for hosted sites (steps 7-8 of platform/README.md),
# for a domain whose DNS is at DigitalOcean. Run as root after
# setup-server.sh; safe to run again.
#
#   ssh root@server 'bash -s -- aleksa.me' < platform/bin/enable-subdomains.sh
#
# Needs a DigitalOcean API token with the "domain" scope in
# /root/.digitalocean.ini (dns_digitalocean_token = ...). It adds the
# *.<domain> A record, gets a wildcard certificate and adds an nginx block
# for *.<domain>. Subdomains that already have their own record and server
# block keep going where they go now: DNS and nginx both prefer an exact
# name over the wildcard.
set -euo pipefail

DOMAIN=${1:?usage: enable-subdomains.sh <domain>}
INI=/root/.digitalocean.ini
CONF=/etc/nginx/sites-enabled/nordpress-subdomains.conf
CERT=nordpress-wildcard
export DEBIAN_FRONTEND=noninteractive LC_ALL=C.UTF-8
cd /

step() { printf '\n== %s\n' "$*"; }
fail() {
  echo "enable-subdomains: $*" >&2
  exit 1
}

[ -f "$INI" ] || fail "no token in $INI; see platform/README.md"
chmod 600 "$INI"
TOKEN=$(sed -n 's/^dns_digitalocean_token *= *//p' "$INI")
[ -n "$TOKEN" ] || fail "$INI has no dns_digitalocean_token line"
IP=$(sed -n 's/^PUBLIC_IP=//p' /etc/nordpress/platform.env)
[ -n "$IP" ] || fail "PUBLIC_IP isn't set in /etc/nordpress/platform.env"
curl -fs -o /dev/null http://127.0.0.1:3100/health || fail "the platform isn't running; run setup-server.sh first"

api() { curl -fsS -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "$@"; }

step "DNS: *.$DOMAIN → $IP"
records=$(api "https://api.digitalocean.com/v2/domains/$DOMAIN/records?type=A&name=*.$DOMAIN&per_page=200") ||
  fail "DigitalOcean refused the token, or $DOMAIN isn't in this account"
existing=$(printf '%s' "$records" | python3 -c 'import sys, json; r = json.load(sys.stdin)["domain_records"]; print(" ".join(x["data"] for x in r))')
if [ -z "$existing" ]; then
  api -X POST "https://api.digitalocean.com/v2/domains/$DOMAIN/records" \
    -d "{\"type\":\"A\",\"name\":\"*\",\"data\":\"$IP\",\"ttl\":1800}" >/dev/null
  echo "added"
elif [ "$existing" = "$IP" ]; then
  echo "already there"
else
  fail "*.$DOMAIN already points to $existing; change or remove that record first"
fi

step "Certificate for *.$DOMAIN"
dpkg -s python3-certbot-dns-digitalocean >/dev/null 2>&1 ||
  apt-get install -y -q python3-certbot-dns-digitalocean >/dev/null
certbot certonly --non-interactive --agree-tos --keep-until-expiring \
  --dns-digitalocean --dns-digitalocean-credentials "$INI" --dns-digitalocean-propagation-seconds 60 \
  --cert-name "$CERT" -d "*.$DOMAIN"
echo "ok (certbot renews it on its own)"

step "nginx"
cat >"$CONF" <<NGINX
# Hosted Nordpress sites at name.$DOMAIN (platform/bin/enable-subdomains.sh).
# Subdomains with their own server block keep going there.
server {
  listen 80;
  listen [::]:80;
  server_name *.$DOMAIN;
  return 301 https://\$host\$request_uri;
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name *.$DOMAIN;
  ssl_certificate /etc/letsencrypt/live/$CERT/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/$CERT/privkey.pem;
  client_max_body_size 50m;

  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 300s;
    proxy_buffering off;
  }
}
NGINX
if ! nginx -t 2>/tmp/nginx-test.log; then
  cat /tmp/nginx-test.log
  rm -f "$CONF"
  fail "nginx didn't accept the new block; removed it, nothing changed"
fi
systemctl reload nginx
echo "ok"

printf '\nDone. Make an invite with: np-platform invite 1 "first site"\n'
