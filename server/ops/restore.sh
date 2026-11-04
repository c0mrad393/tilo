#!/usr/bin/env bash
# Brings a backup back: decrypts it with the private key, starts a fresh database with the
# backup's settings, restores the dump into it, refills the files volume, then starts the
# rest of the stack. The volumes must be new: this refuses a database that has Tilo in it.
# Usage: server/ops/restore.sh backup.tar.age path/to/age.key
#   COMPOSE_PROJECT=tilo-restore restores beside the running stack (no port, no tunnel) to
#   try a backup out; the default, tilo, is the real thing, and puts server/.env in place.
set -euo pipefail
ARCHIVE=${1:?the backup file}
KEY=${2:?the age private key file}
DIR=$(cd "$(dirname "$0")/../.." && pwd)
PROJECT=${COMPOSE_PROJECT:-tilo}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
age -d -i "$KEY" "$ARCHIVE" | tar -C "$work" -xf -

if [ "$PROJECT" = tilo ]; then
  [ -f "$DIR/server/.env" ] && cp "$DIR/server/.env" "$DIR/server/.env.before-restore"
  cp "$work/server.env" "$DIR/server/.env"
  envfile="$DIR/server/.env"
else
  sed -e 's/^CADDY_BIND=.*/CADDY_BIND=127.0.0.1:0/' -e 's/^COMPOSE_PROFILES=.*/COMPOSE_PROFILES=/' "$work/server.env" >"$work/restore.env"
  envfile="$work/restore.env"
fi
COMPOSE=(docker compose -p "$PROJECT" -f "$DIR/server/docker-compose.yml" --env-file "$envfile")

"${COMPOSE[@]}" up -d --wait db
if [ "$("${COMPOSE[@]}" exec -T db psql -U supabase_admin -d postgres -tAc "select to_regclass('public.profiles') is not null")" = t ]; then
  echo "The database of '$PROJECT' already has Tilo's tables; restore into fresh volumes." >&2
  exit 1
fi
# objects the fresh database already made (Supabase's own schemas) are dropped and remade
# from the dump; their notices go to a log, and the counts below say whether it worked
"${COMPOSE[@]}" exec -T db pg_restore -U supabase_admin -d postgres --clean --if-exists <"$work/db.dump" 2>"$work/restore.log" || true
echo "pg_restore: $(grep -c 'error:' "$work/restore.log" || true) errors (most are Supabase's own objects already in place)"
docker run --rm -v "${PROJECT}_files:/f" -v "$work:/b:ro" alpine:3.22 sh -c 'tar -C /f -xzf /b/files.tar.gz && chown -R 1000:1000 /f'
"${COMPOSE[@]}" up -d --wait
"${COMPOSE[@]}" exec -T db psql -U supabase_admin -d postgres -tAc \
  "select format('%s accounts, %s profiles, %s pieces, %s invites', (select count(*) from auth.users), (select count(*) from public.profiles), (select count(*) from public.pieces), (select count(*) from public.invites))"
echo "restored $(basename "$ARCHIVE") into '$PROJECT'"
