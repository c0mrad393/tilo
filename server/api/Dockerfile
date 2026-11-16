# Built from the repository root (compose sets the context), because tilo-api reads
# recordings with the studio's own codec in src/engine, and its image check draws them with
# the studio's own painter. Node runs the API's TypeScript directly; the check runs in a
# worker that esbuild bundles with the engine and the wall's subjects (dist/screen.mjs). The
# wall's rules (src/data/wall.ts) have no imports, so Node reads them as they are.
FROM node:24.22.1-alpine AS build

WORKDIR /app
COPY server/api/package.json server/api/package-lock.json server/api/
RUN cd server/api && npm ci --no-audit --no-fund
COPY package.json ./
COPY src/engine src/engine
COPY src/data/art.ts src/data/wall.ts src/data/wall-art.ts src/data/wall-art-more.ts src/data/wall-kit.ts src/data/
COPY server/api/src server/api/src
RUN cd server/api && npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24.22.1-alpine

WORKDIR /app
COPY --from=build /app/server/api/node_modules server/api/node_modules
COPY server/api/package.json server/api/
COPY package.json ./
COPY src/engine/codec.ts src/engine/frames.ts src/engine/
COPY src/data/wall.ts src/data/event.ts src/data/
COPY server/api/src server/api/src
COPY server/api/assets server/api/assets
COPY --from=build /app/server/api/dist server/api/dist

# the files volume takes this owner the first time it is mounted
RUN mkdir -p /srv/files && chown node:node /srv/files
USER node
ENV NODE_ENV=production
EXPOSE 8787
CMD ["node", "server/api/src/index.ts"]
