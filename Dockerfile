# syntax=docker/dockerfile:1
# One image runs every role: `relife web`, `relife worker`, `relife migrate`, `relife signin`, `relife demo`.
# docker-compose.yml starts them as separate services. Build it yourself: `docker compose build` (docs/SELF_HOSTING.md).
FROM node:24-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Every workspace's package.json, so `npm ci` accepts the lockfile.
FROM base AS manifests
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/extension/package.json apps/extension/
COPY apps/site/package.json apps/site/
COPY packages/brand/package.json packages/brand/
COPY packages/contract/package.json packages/contract/
COPY packages/tokens/package.json packages/tokens/

FROM manifests AS deps
RUN npm ci -w @relife/web --include-workspace-root

FROM manifests AS prod-deps
RUN npm ci --omit=dev -w @relife/web --include-workspace-root

FROM deps AS build
COPY packages packages
COPY apps/web apps/web
# src/db/index.ts needs DATABASE_URL at import; the pool connects lazily, so a dummy one is enough to build.
RUN DATABASE_URL=postgres://build:build@127.0.0.1:1/build npm run build -w apps/web && rm -rf apps/web/.next/cache

FROM base AS runtime
# PostgreSQL 16 client tools (pg_dump, pg_restore, psql) for backups.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && install -d /usr/share/keyrings \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-16 \
 && apt-get purge -y --auto-remove curl gnupg \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 RELIFE_CONTAINER=1 RELIFE_DATA_DIR=/data RELIFE_BACKUP_DIR=/backups RELIFE_BIND=0.0.0.0 PORT=3030 PATH=/app/node_modules/.bin:$PATH

COPY --from=prod-deps /app/node_modules node_modules
COPY package.json package-lock.json ./
COPY packages packages
COPY --from=build /app/apps/web/.next apps/web/.next
COPY apps/web/package.json apps/web/next.config.ts apps/web/tsconfig.json apps/web/
COPY apps/web/src apps/web/src
COPY apps/web/scripts apps/web/scripts
COPY apps/web/public apps/web/public
COPY apps/web/drizzle apps/web/drizzle
COPY docker/entrypoint.sh docker/entrypoint.sh

# /data holds secret.key, library/ and coins/; /backups holds backups. Named volumes copy this ownership on first use.
RUN ln -s /app/docker/entrypoint.sh /usr/local/bin/relife \
 && mkdir -p /data /backups && chown node:node /data /backups
USER node
WORKDIR /app/apps/web
EXPOSE 3030
ENTRYPOINT ["relife"]
CMD ["web"]
