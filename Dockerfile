# Production image: the API serves the built web app on port 4000.
# Build: docker build -t tzed .   (docker-compose.yml does this for you)
# NODE_IMAGE can point at a mirror of the same image.
ARG NODE_IMAGE=node:22.23.4-bookworm-slim

# ── Build: install everything, build web + API, then drop dev dependencies ──────
FROM ${NODE_IMAGE} AS build
# OpenSSL for the Prisma query engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Package files first, so `npm ci` is cached until dependencies change.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY apps/api/prisma/schema.prisma apps/api/prisma/
COPY apps/api/prisma.config.ts apps/api/
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# ── Runtime: only what's needed to run ───────────────────────────────────────
FROM ${NODE_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
  PORT=4000 \
  UPLOAD_DIR=/data/uploads \
  PATH=/app/node_modules/.bin:$PATH \
  NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
# Packages whose version differs from the root copy are installed per workspace.
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/packages/shared ./packages/shared
COPY --from=build --chown=node:node /app/apps/api/package.json /app/apps/api/prisma.config.ts ./apps/api/
COPY --from=build --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --chown=node:node scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
