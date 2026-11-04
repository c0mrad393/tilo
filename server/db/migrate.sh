#!/usr/bin/env bash
# Applies migrations/*.sql in name order, each once and in its own transaction, recorded in
# tilo_meta.migrations. With SEED=true it then applies seed/*.sql, which must be safe to rerun.
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

# PostgREST caches the schema; tell it to look again
psql -q -c "notify pgrst, 'reload schema'"
echo "migrate: done"
