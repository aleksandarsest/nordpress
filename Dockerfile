# Nordpress: docker compose up (see docker-compose.yml and the README)
FROM node:24-alpine

# The pnpm version pinned in package.json
RUN npm install -g pnpm@12.15.0

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# Identifies this version of the code, so the entrypoint knows when to rebuild
RUN find src public scripts next.config.ts package.json pnpm-lock.yaml -type f -print0 \
  | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1 > .source-hash

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    UPLOADS_DIR=/app/storage/uploads \
    BACKUP_DIR=/app/storage/backups

EXPOSE 3000
VOLUME ["/app/.next", "/app/storage/uploads", "/app/storage/backups"]
ENTRYPOINT ["sh", "/app/docker/entrypoint.sh"]
