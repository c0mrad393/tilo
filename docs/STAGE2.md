# Stage 2 plan: accounts, publishing, closed beta

Goal: a small invited group can sign in, publish pieces from the studio to a shared
gallery, stamp and follow each other, remix across accounts, and report problems.
Tilo stays free and cheap to run; donations open at the end of the stage.

What doesn't change: sheets stay on the device (IndexedDB) while you draw. Publishing
uploads a copy of the recording. Replays, previews and exports still render in the
browser.

Hosting: everything runs on one VPS of Tilo's own, with Supabase self-hosted. Not on
the school portal's server: Tilo is a public site where strangers upload work, and it
shouldn't share a machine with student data.

## Architecture

One domain, one server, one `docker compose`. Cloudflare sits in front only as free
DNS and proxy (HTTPS at the edge, caching, DDoS protection); it stores nothing.

```
browser ── Cloudflare proxy ── VPS
                               └─ Caddy (HTTPS, routing, static files)
                                    ├─ /               the built app (dist/)
                                    ├─ /files/…        recordings and pictures on disk, cached for a year
                                    ├─ /auth/v1, /rest/v1 ── Kong ── Supabase Auth, PostgREST
                                    └─ /api/…          tilo-api (Node + Hono)
                                                         ├─ checks the Supabase session
                                                         ├─ decodes the v2 recording (src/engine/codec.ts)
                                                         ├─ runs the proof-of-hand checks
                                                         ├─ writes files to disk and the row to Postgres
                                                         └─ queues the image check
                               Postgres (not reachable from outside)
```

Everything is on one origin, so there's no CORS to configure.

From the self-hosted Supabase stack Tilo runs only Postgres, Auth, PostgREST and Kong.
Realtime, Storage, image proxy, edge functions, analytics and logging stay off. Studio
(the dashboard) runs only when needed and is reached through an SSH tunnel, never from
the internet.

Why a separate API for publishing: the server has to read the recording before it
accepts it (size, format version, plausibility). Simple writes (stamp, follow, report,
profile edit) go straight to Postgres through PostgREST under row-level security.

Files on disk instead of Supabase Storage: tilo-api is the only writer, and Caddy serves
the files as static content, which is one service fewer. A published piece is roughly
30–150 KB of recording plus a 15–30 KB picture, so 40 GB of disk holds well over a
hundred thousand pieces.

## Data model (Postgres)

| table | key columns | notes |
|---|---|---|
| profiles | id (= auth user), handle unique, name, bio, avatar_piece, role, created | role: member, mod, admin. The avatar is a small drawing made in the studio, so no photo uploads to moderate |
| pieces | id, owner, title, paper, layers jsonb, strokes, minutes, format, subject, remix_of, status, created | status: live, held, hidden, removed. Files at /files/rec/{id}.tl and /files/img/{id}.webp |
| stamps | piece, user, kind, created | primary key (piece, user, kind); counts kept by trigger on pieces |
| follows | follower, followee, created | |
| reports | id, piece or profile, by, reason, note, status, created | |
| invites | code, made_by, used_by, used_at | closed beta gate |
| feedback | id, user, page, text, created | |

RLS: anyone reads live pieces and profiles; owners edit their own rows; only mods read
reports and change piece status. The service key lives only in tilo-api's environment.

## Milestones

Sizes are rough, in weeks of focused work for one person.

### 2.1 Server stack, built and tested locally (about 1.5 weeks)
- `server/docker-compose.yml` with the Supabase services above, tilo-api and Caddy;
  `.env.example` listing every secret, and a script that generates the JWT secret and
  the anon and service keys.
- Schema as SQL migrations in `server/migrations/`, RLS policies, seed data for local use.
- `server/api/` (Node + Hono, TypeScript), importing the codec from `src/engine`.
- The Vite dev server proxies /auth, /rest, /api and /files to the local stack.
- Done when: the whole stack runs on this computer under Docker, a test user signs up,
  and tilo-api accepts an authenticated request.

### 2.2 Accounts and profiles (about 1 week)
- Sign in with an email link and Google. Mail goes out through an SMTP provider with a
  free tier (Resend, Brevo or similar): mail sent straight from a VPS usually lands in spam.
- Pick a handle on first sign-in, with an invite code during the beta.
- Profile page: drawn avatar, bio, their pieces, follow button.
- Settings: change handle and name, sign out everywhere, export my data, delete my account.
- Done when: sign up, sign in, profile edit and account deletion work end to end.

### 2.3 Publishing and the real gallery (about 2 weeks)
- "Pin to gallery" becomes "Publish". Without an account it stays a local pin, as now.
- `POST /api/pieces`: checks size (2 MB at most), format version and proof of hand,
  writes the files, inserts the row, and rate-limits publishing (for example 20 a day).
- Gallery reads from PostgREST: newest, most stamped this week, subject, remixes,
  following. Paginated, with recordings fetched only for cards on screen.
- Piece page by URL with an Open Graph image and title, so shared links preview well.
  Caddy hands crawlers a small HTML page with those tags.
- On first sign-in, offer to publish the pieces pinned on this device.
- Sample pieces move to a seeded `tilo` account.
- Done when: a piece published on one device replays correctly on another.

### 2.4 Stamps, follows, remix across accounts (about 1 week)
- Stamps written through PostgREST with optimistic UI; counts from the trigger.
- Following tab in the gallery.
- Remix any live piece: the base recording comes from /files, and the published remix
  links back with credit. The original's owner can turn remixing off.
- Done when: two test accounts can stamp, follow and remix each other.

### 2.5 Moderation and proof of hand v1 (about 1 week)
- Report button on pieces and profiles; a queue page for mods (hide, restore, remove,
  suspend the account).
- Automated image check on the published picture, run by tilo-api after publishing:
  anything flagged is held until a mod looks. The first try is a small open-source NSFW
  classifier on the server's CPU; if it isn't accurate enough, a paid API. In a closed
  beta of invited people, checking after the fact is enough, so publishing doesn't wait.
- Proof of hand v1 in tilo-api, all from the recording:
  - must decode as a v2 recording;
  - a minimum number of strokes and of drawing time for the size of the piece;
  - timestamps must increase;
  - no single stroke may be implausibly long or fast;
  - pressure can't be one constant value across every stroke when the pointer was a pen.

  Passing pieces get the "Recorded on Tilo" badge. The badge is a deterrent, not proof:
  a determined person can script a fake recording. Stage 4 adds stroke-dynamics checks.
- A short "How proof works" page that says exactly this.
- Done when: a report reaches the queue, a mod action hides the piece, and a recording
  with fake timestamps is refused.

### 2.6 Legal (about half a week)
- Terms: who may join (minimum age), what you may post, the licence you grant Tilo to
  show your work, your right to delete, remix rules.
- Privacy policy (GDPR): what's stored, where (the VPS's country, Cloudflare as proxy),
  how long, how to export and delete, contact address.
- Takedown process: a form and an address for copyright and abuse claims, with a response time.
- No tracking cookies, so no cookie banner: only the sign-in session, plus Cloudflare
  Web Analytics, which is cookieless.

### 2.7 Donations (about half a week)
- A "Support Tilo" page and a quiet link in the footer. No paywall, no perks that
  change what anyone can make.
- **Provider is open.** Stripe doesn't support accounts in Georgia, so platforms that
  pay out through Stripe are out. Check which of PayPal, Payoneer or Wise can receive
  payouts for you here, then pick a platform that uses it (Ko-fi pays out to PayPal,
  for example).

### 2.8 Server, deploy and beta operations (about 1.5 weeks)
- Server setup, as a script plus written steps you run on the VPS:
  - firewall open only for SSH, 80 and 443, with 80 and 443 limited to Cloudflare's addresses;
  - SSH by key only, fail2ban, automatic OS security updates;
  - Docker, the compose stack, the `.env` with fresh secrets;
  - Postgres and Studio never published to the internet.
- Deploy: GitHub Actions builds the app and the tilo-api image; the server pulls and
  restarts with one command, run by you or by Actions over SSH once you add a deploy key.
- Backups:
  - nightly `pg_dump` and the files folder, to storage at another provider;
  - kept 7 days daily and 4 weeks weekly;
  - one test restore before the beta opens.

  The ES portal backup script is a starting point.
- Monitoring: an uptime check with alerts, and a disk-space warning.
- Invite codes (each member gets a few), a feedback box on every page, error reports.
- Accessibility and performance pass on the new pages.
- Launch checklist: domain through Cloudflare, mail sending, terms and privacy linked,
  admin account, restore tested.
- Done when: the first invited group is in.

Total: about 9 weeks.

## Running costs at beta size

| item | cost a month |
|---|---|
| VPS, 2 vCPU, 4 GB RAM, 40–80 GB disk, in the EU | about €5–10 |
| Off-site backup storage | €0–3 (a few GB) |
| Cloudflare DNS, proxy and analytics | 0 |
| Mail (SMTP free tier, a few thousand mails a month) | 0 |
| Domain | about $10–40 a year, depending on the ending |

The VPS is the only real bill, and it doesn't grow with users until the server is
actually full. When it is, the first step is a bigger plan from the same provider.
Check current prices with the provider before buying.

## Decisions needed before 2.8 (2.1 to 2.7 can be built locally first)

1. **VPS provider and location.** An EU data centre keeps GDPR simple. Its own server,
   not the school portal's.
2. **Domain.** For example tilo.art or tilo.studio. Check the name for clashes with
   existing art apps first.
3. **Who runs Tilo legally:** you as a person, or as an individual entrepreneur in
   Georgia. This goes into the terms and privacy policy, and it decides what can
   receive donations.
4. **Sign-in:** email link and Google (recommended), with Apple later.
5. **Minimum age:** 16 for the beta keeps GDPR consent simple; 13 is possible later
   with more care.
6. **Beta size:** for example 30–100 invited artists.
7. **Donations route**, once the payout check in 2.7 is done.

Accounts you create yourself: the VPS, Cloudflare (DNS only), an SMTP provider, backup
storage, the domain registrar, and a Google Cloud project for Google sign-in.
I can't reach the server from here, so server steps come to you as scripts and
written instructions.
