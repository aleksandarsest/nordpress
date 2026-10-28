#!/bin/sh
# Starts Nordpress in Docker: migrate, build for this database when needed,
# then serve. Next.js prerenders pages from the database at build time, so
# the build runs here rather than when the image is made.
#
# When INTERNAL_TOKEN is set, the cached pages are cleared once the server
# is up, for a build that was made against another database.
set -e

node scripts/migrate.mjs

if [ ! -f .next/BUILD_ID ] || ! cmp -s .source-hash .next/.source-hash; then
  echo "Building Nordpress (first start or after an upgrade; about a minute)…"
  pnpm build
  cp .source-hash .next/.source-hash
fi

if [ -n "$INTERNAL_TOKEN" ]; then
  node scripts/refresh-when-ready.mjs &
fi

exec pnpm start
