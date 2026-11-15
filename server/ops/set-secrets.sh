#!/usr/bin/env bash
# Asks for the keys that come from outside services and writes them where the stack and the
# backup read them, so they're typed on the server and never pass through anything else.
# Input is hidden; an empty answer keeps what is there. Then Auth's own two settings (Google
# sign-in, and how many emails it may send an hour), and Auth restarts if they changed.
# Run on the server, as tilo:
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
ask "$ENV" CF_ZONE_ID "Cloudflare zone id of tiloart.com (Overview page, right column)"
ask "$ENV" CF_API_TOKEN "Cloudflare API token with Zone > Cache Purge"
ask "$BACKUP" R2_ACCESS_KEY_ID "R2 Access Key ID"
ask "$BACKUP" R2_SECRET_ACCESS_KEY "R2 Secret Access Key"
ask "$BACKUP" BACKUP_PING_URL "Daily backup check URL (healthchecks.io ping URL; optional)"

# ---- Auth ----
before=$(grep -E '^(GOOGLE_|MAIL_RATE_LIMIT=)' "$ENV" | md5sum)
ask "$ENV" GOOGLE_CLIENT_ID "Google OAuth client ID (...apps.googleusercontent.com)"
ask "$ENV" GOOGLE_SECRET "Google OAuth client secret (GOCSPX-...)"
# the button shows once both are there
if grep -q '^GOOGLE_CLIENT_ID=.' "$ENV" && grep -q '^GOOGLE_SECRET=.' "$ENV"; then put "$ENV" GOOGLE_ENABLED true; fi
# not a secret, so it shows as it is typed
now=$(grep '^MAIL_RATE_LIMIT=' "$ENV" | cut -d= -f2)
read -rp "Sign-in emails Auth may send an hour, across everyone (now ${now:-unset}; Enter keeps it): " limit
if [ -n "$limit" ]; then
  [[ $limit =~ ^[0-9]+$ ]] && [ "$limit" -ge 10 ] || { echo "A whole number, 10 or more." >&2; exit 1; }
  put "$ENV" MAIL_RATE_LIMIT "$limit"
  echo "  saved MAIL_RATE_LIMIT"
fi
if [ "$before" != "$(grep -E '^(GOOGLE_|MAIL_RATE_LIMIT=)' "$ENV" | md5sum)" ]; then
  echo "Restarting Auth with the new settings..."
  docker compose -f "$DIR/server/docker-compose.yml" up -d --wait auth >/dev/null
  echo "  Auth is up. Google sign-in: $(grep '^GOOGLE_ENABLED=' "$ENV" | cut -d= -f2)"
fi
echo "Done. Nothing secret was printed; check with: grep -c '=.' $ENV"
