# Tilo's server

Postgres, Supabase Auth, PostgREST, tilo-api and Caddy in one `docker compose`. The plan
behind it is in [docs/STAGE2.md](../docs/STAGE2.md).

```
Caddy :8000 ─┬─ /auth/v1/*  → auth (Supabase Auth)
             ├─ /rest/v1/*  → rest (PostgREST, row-level security)
             ├─ /api/*      → api  (tilo-api, Node + Hono)
             ├─ /files/*    → recordings and pictures of live pieces, on disk
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
| `api/` | tilo-api; reads recordings with `src/engine/codec.ts`, and draws them for the image check with the studio's painter (bundled into `api/dist/screen.mjs` by `npm run build` there) |
| `scripts/` | secrets setup and the smoke test |
| `seed/samples/` | the sample pieces published as @tilo: recordings, pictures and `samples.sql`, seeded once |
| `mail/` | the sign-in, sign-up and email-change mails; Caddy serves them to Auth on `:8080` |

## Keys

`ANON_KEY` is public: the app sends it with every request, and it only grants what the
row-level security rules allow a signed-out visitor. `SERVICE_ROLE_KEY` bypasses every rule;
it stays on the server. Both are signed with `JWT_SECRET`, which also signs every session,
so changing it signs everyone out.

## Sample pieces

The migrate step publishes the prototype's eight samples as @tilo the first time it meets a
database, unless `SAMPLES=false`. To make them again after `src/data/samples.ts` changes:
sign in to a local stack as a `tilo` profile, publish each sample with the studio's own
`publish()` (from the browser console), copy the files out of the `files` volume as
`tilo{sample id}.tl` / `.webp`, and rewrite the rows in `samples.sql`. A database that has
seeded them once won't do it again (`seed:samples` in `tilo_meta.migrations`).

## Link previews

A link to a piece or a profile shared in a chat app is fetched by a crawler, which can't
run the app. Caddy recognises crawlers by user agent and hands them `/api/og/...` instead:
a small page with the Open Graph title, description and picture. Try it with
`curl -A facebookexternalhit/1.1 http://localhost:8000/piece/tilowindow`.

## Moderation

Every piece starts out held. tilo-api draws its recording itself (the studio's painter on
skia, in a worker thread), runs frames along the replay, the final picture and each layer
on its own through two nsfwjs models, and keeps its own render as the picture. Then the
piece goes live, or waits in the queue (`/mod` in the app) when the check flagged it or its
artist has had fewer than `TRUST_AFTER` pieces let in by a mod. One report that a piece
isn't for all ages, or `REPORTS_TO_HOLD` reports of any kind, take it out of the gallery.

A piece that isn't live keeps its files under `private/` in the files volume, which Caddy
never serves; its artist and the mods read them through `/api/pieces/{id}/rec` and `/img`.
The files move when the status does, so only tilo-api changes a piece's status.

Make a mod by hand: `update public.profiles set role = 'mod' where handle = '...'` (or
`admin`, who can also act on mods and on their own pieces). Behind Cloudflare, set
`CF_ZONE_ID` and `CF_API_TOKEN` (a token with Zone > Cache Purge only), so a piece that
leaves the gallery is purged from the edge too; without them its files stay cached there
for up to a year.

The image check is a filter, not a guarantee: it was tried here on clean drawings only, so
how well it catches explicit drawings is unmeasured. The first-three-pieces rule and reports
are what make up for it.

## Mail and Google on the server

On the VPS, drop the `local` profile and point `SMTP_*` at the mail provider (Resend or
Brevo), with `SMTP_ADMIN_EMAIL` on a domain whose SPF and DKIM records the provider has
checked. For Google, make an OAuth client (type "Web application") with the redirect URI
`{PUBLIC_URL}/auth/v1/callback`, put its id and secret in `GOOGLE_CLIENT_ID` and
`GOOGLE_SECRET`, and set `GOOGLE_ENABLED=true`. The button appears by itself.

## The VPS

netcup VPS 500 G12.5 (2 vCPU, 4 GB, 64 GB), Debian 13, `62.83.82.133`, set up on 2026-11-04:

- Only the user `tilo` (sudo without a password, in the `docker` group) can log in, with an SSH
  key; root and password logins are off (`/etc/ssh/sshd_config.d/10-tilo.conf`). On the Mac,
  `~/.ssh/config` has a `tilo` host, so `ssh tilo` is enough.
- `ufw` allows 22 (rate-limited), 80, 443 and 443/udp, nothing else. Docker writes its own
  firewall rules for published ports and goes around `ufw`, so a compose port that isn't
  meant for the world binds to `127.0.0.1`.
- Debian security and stable updates install by themselves (`unattended-upgrades`); Docker
  itself is updated by hand. No automatic reboots.
- Docker Engine and the compose plugin come from Docker's own apt repository; container logs
  rotate at 3 × 10 MB, and `live-restore` keeps containers running while Docker restarts.
- 2 GB swap file, `vm.swappiness=10`, clock in UTC.
- netcup's panel firewall has its "netcup Mail Block" policy on, which blocks SMTP ports.
