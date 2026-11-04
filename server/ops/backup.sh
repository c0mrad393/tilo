#!/usr/bin/env bash
# The nightly backup, run on the server by tilo-backup.timer: the whole database, the files
# volume and server/.env (its secrets keep every account's keys valid after a restore), in
# one archive encrypted with age to a public key. The private key stays off the server, so
# a backup can only be opened where that key is kept. Then it goes to Cloudflare R2:
# daily/ keeps 7 days, weekly/ (Sundays) 4 weeks.
# Settings in /etc/tilo/backup.env (see backup.env.example). Without R2 settings the archive
# stays in BACKUP_KEEP_DIR, which is how it is tried out on a computer.
# Usage: server/ops/backup.sh [path/to/backup.env]
set -euo pipefail
ENV_FILE=${1:-/etc/tilo/backup.env}
# shellcheck source=/dev/null
source "$ENV_FILE"
: "${AGE_RECIPIENT:?AGE_RECIPIENT, the public half of the backup key, is not set}"
DIR=${TILO_DIR:-$HOME/tilo}
PROJECT=${COMPOSE_PROJECT:-tilo}
COMPOSE=(docker compose -p "$PROJECT" -f "$DIR/server/docker-compose.yml")

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
stamp=$(date -u +%Y-%m-%d)
name="tilo-$stamp.tar.age"

"${COMPOSE[@]}" exec -T db pg_dump -U supabase_admin -Fc postgres >"$work/db.dump"
docker run --rm -v "${PROJECT}_files:/f:ro" alpine:3.22 tar -C /f -czf - . >"$work/files.tar.gz"
cp "$DIR/server/.env" "$work/server.env"
tar -C "$work" -cf - db.dump files.tar.gz server.env | age -r "$AGE_RECIPIENT" >"$work/$name"
size=$(du -h "$work/$name" | cut -f1)

if [ -z "${R2_BUCKET:-}" ]; then
  mkdir -p "${BACKUP_KEEP_DIR:?set R2_* or BACKUP_KEEP_DIR}"
  cp "$work/$name" "$BACKUP_KEEP_DIR/"
  echo "backup $name ($size) kept in $BACKUP_KEEP_DIR"
  exit 0
fi

export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
rclone copyto "$work/$name" "r2:$R2_BUCKET/daily/$name"
[ "$(date -u +%u)" = 7 ] && rclone copyto "$work/$name" "r2:$R2_BUCKET/weekly/$name"
rclone delete --min-age 8d "r2:$R2_BUCKET/daily"
rclone delete --min-age 29d "r2:$R2_BUCKET/weekly"
echo "backup $name ($size) sent to R2"
# tells the daily check it happened; a missed ping is how a failed night gets noticed
[ -z "${BACKUP_PING_URL:-}" ] || curl -fsS -m 10 --retry 3 -o /dev/null "$BACKUP_PING_URL" || echo "backup ping failed" >&2
