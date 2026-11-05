#!/usr/bin/env bash
# Asks for the keys that come from outside services and writes them where the stack and the
# backup read them, so they're typed on the server and never pass through anything else.
# Input is hidden; an empty answer keeps what is there. Run on the server, as tilo:
#   bash ~/tilo/server/ops/set-secrets.sh
set -euo pipefail
DIR=$(cd "$(dirname "$0")/../.." && pwd)
ENV="$DIR/server/.env"
BACKUP=/etc/tilo/backup.env
[ -f "$ENV" ] || { echo "No $ENV yet: make it with setup-env.mjs first." >&2; exit 1; }
[ -w "$BACKUP" ] || { echo "No $BACKUP yet: run install.sh first." >&2; exit 1; }

# set KEY in FILE to VALUE, line by line, so no character in a value is read as a pattern
put() {
  local file=$1 key=$2 value=$3 tmp line found=
  tmp=$(mktemp "$file.XXXX")
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ $line == "$key="* ]]; then printf '%s=%s\n' "$key" "$value"; found=1; else printf '%s\n' "$line"; fi
  done <"$file" >"$tmp"
  [ -n "$found" ] || printf '%s=%s\n' "$key" "$value" >>"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$file"
}

ask() {
  local file=$1 key=$2 what=$3 value
  if grep -q "^$key=." "$file"; then what="$what (set; Enter keeps it)"; fi
  read -rsp "$what: " value
  echo
  [ -z "$value" ] || { put "$file" "$key" "$value"; echo "  saved $key"; }
}

ask "$ENV" TUNNEL_TOKEN "Cloudflare tunnel token (the long eyJ... after --token)"
ask "$ENV" SMTP_PASS "Resend API key (re_...)"
ask "$BACKUP" R2_ACCESS_KEY_ID "R2 Access Key ID"
ask "$BACKUP" R2_SECRET_ACCESS_KEY "R2 Secret Access Key"
echo "Done. Nothing was printed; check with: grep -c '=.' $ENV"
