#!/usr/bin/env bash
# Sends the server's code from this Mac to the VPS and rebuilds the stack there. The app
# itself deploys through Cloudflare on every push; this is only the server.
# Usage, from the repository root: npm run server:deploy   (TILO_HOST, TILO_DIR override)
set -euo pipefail
HOST=${TILO_HOST:-tilo}
DIR=${TILO_DIR:-tilo}

# what the stack builds from: the API's image needs the studio's engine (src/engine). The
# server's own .env (and .env.before-restore) stay as they are.
rsync -az --delete --relative \
  --exclude node_modules --include .env.example --exclude '.env*' --exclude 'api/dist' \
  ./package.json ./src/engine ./server "$HOST:$DIR/"

ssh "$HOST" bash -s "$DIR" <<'REMOTE'
set -euo pipefail
cd "$1"
if [ ! -f server/.env ]; then
  echo "server/.env is missing on the server. Make it once with:"
  echo "  docker run --rm -u \$(id -u):\$(id -g) -v \$PWD:/w -w /w node:24.22.1-alpine node server/scripts/setup-env.mjs --server https://tiloart.com"
  exit 1
fi
docker compose -f server/docker-compose.yml up -d --build --wait --remove-orphans
docker image prune -f >/dev/null
docker compose -f server/docker-compose.yml ps --format 'table {{.Service}}\t{{.Status}}'
REMOTE
