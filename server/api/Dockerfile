# Built from the repository root (compose sets the context), because tilo-api reads
# recordings with the studio's own codec in src/engine. Node runs the TypeScript directly.
FROM node:24.22.1-alpine

WORKDIR /app
COPY server/api/package.json server/api/package-lock.json server/api/
RUN cd server/api && npm ci --omit=dev --no-audit --no-fund

COPY package.json ./
COPY src/engine/codec.ts src/engine/
COPY server/api/src server/api/src

# the files volume takes this owner the first time it is mounted
RUN mkdir -p /srv/files && chown node:node /srv/files
USER node
ENV NODE_ENV=production
EXPOSE 8787
CMD ["node", "server/api/src/index.ts"]
