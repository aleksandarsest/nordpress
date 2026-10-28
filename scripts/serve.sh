#!/bin/sh
# Starts Nordpress on a server, as install.sh sets it up (no Docker):
# with the built-in database unless DATABASE_URL points at a PostgreSQL
# server, database changes applied, and the ready-made build's cached
# pages cleared once the site answers, so it shows its own content.
set -e

if [ -z "$DATABASE_URL" ]; then
  export EMBEDDED_DB_DIR="${EMBEDDED_DB_DIR:-./storage/db}"
  exec node scripts/embedded-db.mjs sh "$0"
fi

node scripts/migrate.mjs

if [ -z "$INTERNAL_TOKEN" ]; then
  INTERNAL_TOKEN=$(node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))")
  export INTERNAL_TOKEN
fi
node scripts/refresh-when-ready.mjs &

exec node node_modules/next/dist/bin/next start -H "${HOST:-127.0.0.1}" -p "${PORT:-3000}"
