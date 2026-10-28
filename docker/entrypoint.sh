#!/bin/sh
# Starts Nordpress in Docker: migrate, set up this version's build when
# needed, then serve.
#
# The published image carries a ready build (/app/.next-template), made from
# an empty site; it's copied in, and its cached pages are cleared once the
# server is up, so the site shows its own content. An image built from source
# has none, and builds here instead: Next.js prerenders pages from the
# database, so that build needs this site's database.
set -e

# No DATABASE_URL: the built-in database, kept in /app/storage/db. The
# script starts it and runs this file again with DATABASE_URL set.
if [ -z "$DATABASE_URL" ]; then
  export EMBEDDED_DB_DIR="${EMBEDDED_DB_DIR:-/app/storage/db}"
  exec node scripts/embedded-db.mjs sh /app/docker/entrypoint.sh
fi

node scripts/migrate.mjs

if [ ! -f .next/BUILD_ID ] || ! cmp -s .source-hash .next/.source-hash; then
  if [ -f .next-template/BUILD_ID ]; then
    echo "Setting up this version of Nordpress…"
    find .next -mindepth 1 -delete
    cp -a .next-template/. .next/
    touch .next/.from-template
  else
    echo "Building Nordpress (first start or after an upgrade; a few minutes)…"
    pnpm build
  fi
  cp .source-hash .next/.source-hash
fi

if [ -f .next/.from-template ] && [ -z "$INTERNAL_TOKEN" ]; then
  INTERNAL_TOKEN=$(node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))")
  export INTERNAL_TOKEN
fi
if [ -n "$INTERNAL_TOKEN" ]; then
  node scripts/refresh-when-ready.mjs &
fi

exec pnpm start
