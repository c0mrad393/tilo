# Tilo's server

Postgres, Supabase Auth, PostgREST, tilo-api and Caddy in one `docker compose`. The plan
behind it is in [docs/STAGE2.md](../docs/STAGE2.md).

```
Caddy :8000 ─┬─ /auth/v1/*  → auth (Supabase Auth)
             ├─ /rest/v1/*  → rest (PostgREST, row-level security)
             ├─ /api/*      → api  (tilo-api, Node + Hono)
             ├─ /files/*    → recordings and pictures on disk
             └─ everything else → the built app (dist/)
```

## On this computer

Needs Docker Desktop. From the repository root:

```bash
node server/scripts/setup-env.mjs   # once: writes server/.env with new secrets
npm run server:up                   # builds tilo-api, starts everything, waits until healthy
npm run server:smoke                # signs up a test member and checks the rules end to end
npm run dev                         # the app on :4640, which proxies to Caddy on :8000
```

Mail doesn't leave this computer: `COMPOSE_PROFILES=local` starts Mailpit, which catches
every sign-in link at http://localhost:8025. Accounts show in the app once
`setup-env.mjs` has written `VITE_TILO_ANON_KEY` to `.env.local` (restart `npm run dev`);
the seed adds invite codes `LOCAL-0001` to `LOCAL-0003`.

`npm run server:logs` follows the logs, `npm run server:down` stops everything (the data
stays in Docker volumes). To start over with an empty database:
`docker compose -f server/docker-compose.yml down -v`.

## Files

| path | what |
|---|---|
| `docker-compose.yml` | the services; only Caddy publishes a port |
| `Caddyfile` | routing, one origin for everything |
| `.env.example` | every setting; `.env` is never committed |
| `db/init.sql` | runs once when the database is created: role passwords, the `tilo_api` role |
| `db/migrate.sh` | applies `migrations/` in order, once each, then `seed/` when `SEED=true` |
| `migrations/` | the schema and access rules; add new files, never edit applied ones |
| `api/` | tilo-api; reads recordings with `src/engine/codec.ts` |
| `scripts/` | secrets setup and the smoke test |
| `mail/` | the sign-in, sign-up and email-change mails; Caddy serves them to Auth on `:8080` |

## Keys

`ANON_KEY` is public: the app sends it with every request, and it only grants what the
row-level security rules allow a signed-out visitor. `SERVICE_ROLE_KEY` bypasses every rule;
it stays on the server. Both are signed with `JWT_SECRET`, which also signs every session,
so changing it signs everyone out.

## Mail and Google on the server

On the VPS, drop the `local` profile and point `SMTP_*` at the mail provider (Resend or
Brevo), with `SMTP_ADMIN_EMAIL` on a domain whose SPF and DKIM records the provider has
checked. For Google, make an OAuth client (type "Web application") with the redirect URI
`{PUBLIC_URL}/auth/v1/callback`, put its id and secret in `GOOGLE_CLIENT_ID` and
`GOOGLE_SECRET`, and set `GOOGLE_ENABLED=true`. The button appears by itself.
