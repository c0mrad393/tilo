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

The first admin is made by hand too, in psql on the server:
`docker compose exec db psql -U postgres -c "update public.profiles set role = 'admin' where handle = '...'"`.
After that, admins change roles in the app (Admin > Members), make and withdraw invite codes,
and switch whether sign-up needs one. That panel reads email addresses from Auth through
`public.account_facts()`, which only `tilo_api` may call, and every change is logged.

The image check is a filter, not a guarantee: it was tried here on clean drawings only, so
how well it catches explicit drawings is unmeasured. The first-three-pieces rule and reports
are what make up for it.

## Legal

Members agree to the terms when they pick a handle; which version, and when, is in
`public.agreements`. When the terms change in a way members must agree to again, add a
migration that updates `tilo_meta.settings` `terms_version` and change `TERMS_VERSION` in
`src/data/legal.ts` in the same commit, or nobody can join.

Takedown claims arrive at `POST /api/claims` from anyone and are answered under Admin >
Claims. The per-address limit reads `X-Tilo-Client-Ip`, which the Worker sets from
Cloudflare's `CF-Connecting-IP`; Caddy turns away anything that didn't come through the Worker
(see The edge), so nobody can pick their own address. Auth's rate limits read it too.

Once a day tilo-api calls `public.prune_sign_ins()`, which deletes Auth's sign-in log after
30 days and sessions unused for 90, and deletes answered claims after three years.

## The edge

On tiloart.com, the Cloudflare Worker "tilo" (`worker/index.ts`, `wrangler.jsonc`) serves
the built app itself, so the studio keeps working when the server is down. It sends
`/auth/v1`, `/rest/v1`, `/api` and `/files`, and crawlers asking for `/piece/*` or `/u/*`,
to the VPS through a Cloudflare Tunnel: `cloudflared` runs in the stack (the `server`
profile) and dials out to Cloudflare, so the VPS has no web port open and needs no
certificate. The tunnel's public hostname points at `http://caddy:8000`.

```
browser → tiloart.com (Worker) ─┬─ the app, from dist/ on Cloudflare
                                └─ server paths → origin hostname → tunnel → Caddy → …
```

The Worker's settings (Workers & Pages > tilo > Settings):

- `ORIGIN`: the tunnel's public hostname, like `https://origin.tiloart.com`. Until it's set,
  the Worker serves only the app, as before accounts.
- `EDGE_SECRET` (a secret): the same value as `EDGE_SECRET` in the server's `.env`. Caddy
  answers 403 to any request without it, so the origin hostname is no way around the Worker.
- Build variable `VITE_TILO_ANON_KEY`: `ANON_KEY` from the server's `.env`. The app shows
  accounts only when it's built with it, so setting it is the switch that opens sign-in.

`EDGE_ORIGIN` in the server's `.env` is the same as `ORIGIN`: Cloudflare caches the Worker's
requests under that hostname, so a takedown purges both.

## On the server

Everything is run from this Mac, in the repository:

```bash
npm run server:deploy    # sends server/ and src/engine to the VPS, rebuilds, waits until healthy
```

The first time, it stops and says how to make the server's `.env` there (with
`setup-env.mjs --server https://tiloart.com`, so the secrets never leave the VPS). Then fill
`EDGE_ORIGIN` (and `CF_ZONE_ID` and `CF_API_TOKEN` for purges), run
`sudo bash ~/tilo/server/ops/install.sh` once, then type the outside keys in with
`ssh -t tilo 'bash ~/tilo/server/ops/set-secrets.sh'`: the tunnel token, the Resend API key
("Sending access" on tiloart.com) and the R2 keys. Input is hidden, and an empty answer
keeps what is there. Then deploy again.

Mail goes through Resend on port 2587 (netcup's Mail Block shuts the usual SMTP ports), from
`hello@tiloart.com`, once Resend has checked the domain's SPF and DKIM records. For Google
sign-in later, make an OAuth client (type "Web application") with the redirect URI
`{PUBLIC_URL}/auth/v1/callback`, put its id and secret in `GOOGLE_CLIENT_ID` and
`GOOGLE_SECRET`, and set `GOOGLE_ENABLED=true`. The button appears by itself.

`/api/health` answers 503 when the database is unreachable or the disk is under 10% (or
2 GB) free; an UptimeRobot monitor on `https://tiloart.com/api/health` emails when it fails.
Docker's own health check uses `/api/health/live`, which doesn't look at the disk.

## Backups

`server/ops/backup.sh` runs every night at about 03:30 UTC (`tilo-backup.timer`): the whole
database, the files volume and `server/.env`, in one archive encrypted with
[age](https://age-encryption.org) to a public key, sent to the R2 bucket. `daily/` keeps
8 days, `weekly/` (Sundays) 4 weeks. Settings are in `/etc/tilo/backup.env`
(`server/ops/backup.env.example`). The private key is not on the server: a stolen server or
bucket can't open a backup, and a lost key can't be replaced, so keep it in the password
manager.

```bash
sudo systemctl start tilo-backup        # one now
journalctl -u tilo-backup -n 20         # how the last ones went
```

To bring one back, copy the archive and the key to the server and run
`server/ops/restore.sh tilo-2026-11-04.tar.age tilo-backup.key`. With
`COMPOSE_PROJECT=tilo-restore` it restores beside the running site, with no port and no
tunnel, to check a backup; remove that with
`docker compose -p tilo-restore -f server/docker-compose.yml down -v`. With the default
project it is the real thing, for a new server: it puts the backup's `.env` in place and
refuses a database that already has Tilo in it. Delete the key from the server afterwards.

## The VPS

netcup VPS 500 G12.5 (2 vCPU, 4 GB, 64 GB), Debian 13, `62.83.82.133`, set up on 2026-11-04;
the stack has run there since 2026-11-05 (rsync, which deploys need, is installed by hand):

- Only the user `tilo` (sudo without a password, in the `docker` group) can log in, with an SSH
  key; root and password logins are off (`/etc/ssh/sshd_config.d/10-tilo.conf`). On the Mac,
  `~/.ssh/config` has a `tilo` host, so `ssh tilo` is enough.
- `ufw` allows only 22 (rate-limited); `install.sh` closed 80 and 443, as the tunnel needs
  neither. fail2ban bans an address for an hour after 5 failed SSH logins. Docker writes its own
  firewall rules for published ports and goes around `ufw`, so a compose port that isn't
  meant for the world binds to `127.0.0.1`.
- Debian security and stable updates install by themselves (`unattended-upgrades`); Docker
  itself is updated by hand. No automatic reboots.
- Docker Engine and the compose plugin come from Docker's own apt repository; container logs
  rotate at 3 × 10 MB, and `live-restore` keeps containers running while Docker restarts.
- 2 GB swap file, `vm.swappiness=10`, clock in UTC.
- netcup's panel firewall has its "netcup Mail Block" policy on, which blocks SMTP ports.
