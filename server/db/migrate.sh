#!/usr/bin/env bash
# Applies migrations/*.sql in name order, each once and in its own transaction, recorded in
# tilo_meta.migrations. With SEED=true it then applies seed/*.sql, which must be safe to rerun.
# Then the sample pieces (seed/samples/), once, unless SAMPLES=false.
set -euo pipefail

until pg_isready -q; do sleep 1; done

psql -v ON_ERROR_STOP=1 -q <<'SQL'
set client_min_messages = warning;
create schema if not exists tilo_meta;
create table if not exists tilo_meta.migrations (name text primary key, applied timestamptz not null default now());
SQL

for f in /tilo/migrations/*.sql; do
  name=$(basename "$f")
  if [ -z "$(psql -tAc "select 1 from tilo_meta.migrations where name = '$name'")" ]; then
    echo "migrate: $name"
    psql -v ON_ERROR_STOP=1 -q -1 -f "$f" -c "insert into tilo_meta.migrations (name) values ('$name')"
  fi
done

if [ "${SEED:-false}" = "true" ]; then
  for f in /tilo/seed/*.sql; do
    echo "seed: $(basename "$f")"
    psql -v ON_ERROR_STOP=1 -q -1 -f "$f"
  done
fi

# the tilo account and the sample pieces, once per database (SAMPLES=false skips them).
# seed:samples-ai replaced the prototype's samples (seed:samples) with ones drawn by Claude.
if [ "${SAMPLES:-true}" = "true" ] && [ -z "$(psql -tAc "select 1 from tilo_meta.migrations where name = 'seed:samples-ai'")" ]; then
  echo "seed: samples"
  # tilo-api runs as node (uid 1000) and has to keep writing into these folders
  mkdir -p /srv/files/rec /srv/files/img
  chown 1000:1000 /srv/files/rec /srv/files/img
  for id in window balcony cat kazbegi oneline pomegranate tram waves; do
    rm -f "/srv/files/rec/tilo$id.tl" "/srv/files/img/tilo$id.webp"
  done
  for f in /tilo/seed/samples/*.tl; do cp "$f" /srv/files/rec/; done
  for f in /tilo/seed/samples/*.webp; do cp "$f" /srv/files/img/; done
  chown 1000:1000 /srv/files/rec/tilo* /srv/files/img/tilo*
  psql -v ON_ERROR_STOP=1 -q -1 -f /tilo/seed/samples/samples.sql -f /tilo/seed/samples/pieces.sql \
    -c "insert into tilo_meta.migrations (name) values ('seed:samples-ai') on conflict do nothing"
fi

# the pixel samples (Stage 3), added to a database that may have its other samples already;
# once, like them, so one taken down stays down
if [ "${SAMPLES:-true}" = "true" ] && [ -z "$(psql -tAc "select 1 from tilo_meta.migrations where name = 'seed:samples-pixel'")" ]; then
  echo "seed: pixel samples"
  mkdir -p /srv/files/rec /srv/files/img
  for f in /tilo/seed/samples/pixel/*.tl; do cp "$f" /srv/files/rec/; done
  for f in /tilo/seed/samples/pixel/*.webp; do cp "$f" /srv/files/img/; done
  chown 1000:1000 /srv/files/rec/tilo* /srv/files/img/tilo*
  psql -v ON_ERROR_STOP=1 -q -1 -f /tilo/seed/samples/pixel/pieces.sql \
    -c "insert into tilo_meta.migrations (name) values ('seed:samples-pixel') on conflict do nothing"
fi

# PostgREST caches the schema; tell it to look again
psql -q -c "notify pgrst, 'reload schema'"
echo "migrate: done"
