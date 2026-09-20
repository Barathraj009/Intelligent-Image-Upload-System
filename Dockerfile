# syntax=docker/dockerfile:1

# Multi-stage build: install production deps with build tools available (for
# better-sqlite3 in case a prebuild is unavailable), then copy only what the
# runtime image needs. No dev tools in the final image.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
ENV PORT=3000
# Persist SQLite here — mount a volume/disk at /data (see render.yaml and
# DEPLOYMENT.md). On ephemeral filesystems the DB would disappear on restart.
ENV DATA_DIR=/data

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /data && chown -R node:node /app /data

USER node

EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "app.js"]