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
                                    ├─ /auth/v1, /rest/v1 ── Supabase Auth, PostgREST
                                    └─ /api/…          tilo-api (Node + Hono)
                                                         ├─ checks the Supabase session
                                                         ├─ decodes the v2 recording (src/engine/codec.ts)
                                                         ├─ runs the proof-of-hand checks
                                                         ├─ writes files to disk and the row to Postgres
                                                         └─ queues the image check
                               Postgres (not reachable from outside)
```

Everything is on one origin, so there's no CORS to configure.

From the self-hosted Supabase stack Tilo runs only Postgres, Auth and PostgREST. Caddy
routes to them directly, so there is no Kong (Supabase's own compose file has since moved
from Kong to Envoy; Tilo needs neither).
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
| stamps | piece, member, kind, created | primary key (piece, member, kind); counts kept by trigger on pieces |
| follows | follower, followee, created | |
| reports | id, piece or profile, reporter, reason, note, status, created | |
| invites | code, made_by, used_by, used_at | closed beta gate |
| feedback | id, member, page, text, created | |

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

Progress (2026-11-04): done. `server/` holds the compose file (Postgres, Auth, PostgREST,
a one-shot migrate step, tilo-api, Caddy), migrations 0001 (tables) and 0002 (grants, RLS,
stamp counts), the local seed, `scripts/setup-env.mjs` for secrets and `scripts/smoke.ts`,
which signs up a member and checks 22 things end to end. The whole stack idles at about
210 MB of memory. See server/README.md.

### 2.2 Accounts and profiles (about 1 week)
- Sign in with an email link and Google. Mail goes out through an SMTP provider with a
  free tier (Resend, Brevo or similar): mail sent straight from a VPS usually lands in spam.
- Pick a handle on first sign-in, with an invite code during the beta.
- Profile page: drawn avatar, bio, their pieces, follow button.
- Settings: change handle and name, sign out everywhere, export my data, delete my account.
- Done when: sign up, sign in, profile edit and account deletion work end to end.

Progress (2026-11-04): done, except that Google sign-in is wired but untested until there
is an OAuth client (it shows only when `GOOGLE_ENABLED=true`). Migration 0003 adds
`claim_handle` (the invite gate; a used code stays used even after its account is deleted),
`handle_problem` (format, reserved words, taken) and `profile_page`. tilo-api gained
`/api/me`, `/api/me/export` and `DELETE /api/me`, which removes the Auth user and lets the
foreign keys take the rest. Locally the mail goes to Mailpit (:8025) with Tilo's own
templates in `server/mail/`. In the app: `/account` (sign in, pick a handle, settings,
export, delete) and `/u/:handle`; all of it stays off unless the build has
`VITE_TILO_ANON_KEY`, so tiloart.com shows no accounts yet. Until 2.3 the avatar is the
handle's letter in one of six inks. The smoke test now checks 47 things.

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

Progress (2026-11-04), part A done: `POST /api/pieces` (multipart: meta, recording, picture)
reads the recording with the shared codec, checks every stroke's layer, the 10:00 clock for
subject entries and a live source for remixes, allows 20 a day (`PUBLISH_PER_DAY`), writes
the files and then the row; `DELETE /api/pieces/:id` takes your own piece down with its files.
Migration 0004 adds `stamp_total`, `picture` (WebP, or JPEG from Safari) and minutes to the
second. In the app, signed in with a handle, "Pin" becomes "Publish"; the gallery lists
published pieces a page at a time (newest, most stamped this week, subject, remixes) from
their pictures and fetches a recording only when a card is pointed at; the piece page,
stamps, remixes of published pieces, take-down and the profile's pieces work against the
server. The smoke test checks that a recording comes back byte for byte (65 checks).

Part B done (2026-11-04), so 2.3 is complete:
- The eight samples are published as @tilo (the "Tilo team" account, `hello@tiloart.com`).
  Their recordings and pictures are committed in `server/seed/samples/`, and the migrate
  step seeds them once per database (`SAMPLES=true`), so a sample that is taken down stays
  down. With accounts on, `/piece/window` and the other sample addresses redirect to the
  published copies (`tilowindow`, ...), and a remix of a sample credits it.
- Link previews: Caddy sends crawlers (by user agent) asking for `/piece/{id}` or
  `/u/{handle}` to `/api/og/...`, which answers with Open Graph tags, the picture and a
  plain link. Browsers get the app as before. Behind Cloudflare, check that Bot Fight Mode
  doesn't turn the preview crawlers away (2.8).
- `/account` lists the pieces pinned on this device and publishes them one by one or all at
  once; each pin then leaves the device and its sheet points at the published piece.
- Smoke test: 69 checks.

Watch for 2.5 and 2.8: /files are cached as immutable for a year, so behind Cloudflare a
taken-down or removed piece keeps being served from the edge. Moderation has to purge its
URLs through Cloudflare's API, or /files need a shorter edge cache.

### 2.4 Stamps, follows, remix across accounts (about 1 week)
- Stamps written through PostgREST with optimistic UI; counts from the trigger.
- Following tab in the gallery.
- Remix any live piece: the base recording comes from /files, and the published remix
  links back with credit. The original's owner can turn remixing off.
- Done when: two test accounts can stamp, follow and remix each other.

Progress (2026-11-04): done. Tried with two accounts in the browser: each stamped, followed
and remixed the other, and each one's Following tab showed only the other's pieces.
- Migration 0005 adds `pieces.remixable` (default on). Its owner, and only its owner, can
  switch it through PostgREST (a column grant plus the existing update policy). The studio's
  publish dialog has "Others may remix it", and the piece page has the same switch.
- `POST /api/pieces` refuses a remix of a piece whose artist has turned remixing off, unless
  it is the artist's own piece. Remixes made before the switch stay. On a closed piece,
  others see the Remix button disabled with a note saying why.
- The gallery's Following tab (members only) lists live pieces by the people you follow,
  newest first, with its own empty states for following nobody and for nothing published yet.
- Smoke test: 78 checks.

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

Progress (2026-11-04): done, with one addition asked for: Tilo is for all ages, so
explicit drawings must not reach the gallery.
- Every piece starts out held. tilo-api draws the recording itself (the studio's painter on
  skia, in a worker thread) and runs up to 16 frames along the replay, the final picture and
  each layer on its own through two nsfwjs models (MobileNetV2 and InceptionV3, on the wasm
  backend; about 35 ms and 230 ms a frame on this Mac). Frames along the way catch something
  drawn and then painted over, which the replay would show; layers alone catch what sits on
  a hidden layer, which a remix would bring back. The server's render is the picture, so a
  clean picture can't front a different recording.
- Then the piece goes live, or waits for a mod: when the check flags it (explicit 25% or
  suggestive 40% on any frame), and for each member's first three pieces (`TRUST_AFTER`).
- Files of pieces that aren't live sit in `private/`, which Caddy doesn't serve, so a held
  piece can't be shared by its file address. They move when the status changes, and leaving
  the gallery purges the addresses from Cloudflare's edge (`CF_ZONE_ID`, `CF_API_TOKEN`).
- Reports go through tilo-api: one "not for all ages" report holds a piece at once, three
  people for any other reason. The queue at `/mod` has held pieces with what the checks said,
  open reports, and the log; mods let in, hide or remove pieces, dismiss reports and suspend
  members (Auth bans the account and their pieces are hidden; lifting it undoes both). Only
  an admin lets in a mod's own piece.
- Proof of hand v1 refuses recordings timed before 2026 or in the future, going back in time
  by more than a minute, or with strokes faster than a hand (more than 2, or 1%). The badge
  needs every stroke timed, three strokes over five seconds, and a pen's pressure that
  changes. The samples by @tilo have no stroke times, so they don't get it. `/proof` says
  what it means and what it doesn't.
- Smoke test: 131 checks. Not measured: how well the image check catches explicit drawings,
  since it was only tried on clean ones; the first-three rule and reports cover for it.

### Between 2.5 and 2.6: the admin panel

Done locally. Admins get "Admin" in the nav in place of "Queue", and tabs over the queue:
Overview (the numbers, pieces published over two weeks, and whether sign-up needs an invite
code), Members (search by handle, name or email; joined, last sign-in, pieces, who invited
them, open reports, and the role, where making an admin asks first and nobody changes their
own), Invites (make up to 50 `TILO-XXXX-XXXX` codes with a note on who they're for, copy,
withdraw unused ones), Pieces (every piece, by status and title, with the mods' buttons),
Feedback, and the whole log, filtered by action. Email addresses come from Auth through
`account_facts()`, a function only tilo-api may call; the routes are `/api/admin/*` and
check the admin role on every call. Role, invite and setting changes go into the same log.

### 2.6 Legal (about half a week)
- Terms: who may join (minimum age), what you may post, the licence you grant Tilo to
  show your work, your right to delete, remix rules.
- Privacy policy (GDPR): what's stored, where (the VPS's country, Cloudflare as proxy),
  how long, how to export and delete, contact address.
- Takedown process: a form and an address for copyright and abuse claims, with a response time.
- No tracking cookies, so no cookie banner: only the sign-in session, plus Cloudflare
  Web Analytics, which is cookieless.

Progress (2.6, done locally). Decided with you: Tilo is run by you as a private person in
Georgia, accounts are for 16 and older, the addresses are hello@ and legal@tiloart.com, and
claims are answered within two working days.
- `/terms`, `/privacy` and `/takedown`, linked from every page's footer. The facts they rest
  on (who runs Tilo, the addresses, the age, the terms version) are in `src/data/legal.ts`.
- Picking a handle needs "I'm 16 or older and agree to the terms" ticked; `claim_handle`
  refuses anything but the current terms version (`tilo_meta.settings.terms_version`, which
  must match `TERMS_VERSION` in legal.ts) and keeps it in `agreements`, which only that
  member can read. It's in the export.
- The takedown form posts to `/api/claims`, from anyone, signed in or not: kind, address on
  Tilo, name, email, details, and the good-faith statement for copyright. Five an hour per
  address, 200 a day in all. Admins answer them under Admin > Claims, with the piece's mod
  buttons; open claims count in the nav, and answering writes the log.
- tilo-api deletes Auth's sign-in log after 30 days, sessions unused for 90, and answered
  claims after three years, once a day, as the privacy policy says.
- No cookies and no analytics, so no banner. If Cloudflare Web Analytics is switched on
  later, the privacy policy has to say so first.
- Before accounts open: put your name in `OPERATOR` (legal.ts), and the mail service in
  `MAIL_SERVICE` once picked; set up Cloudflare Email Routing for hello@ and legal@.
- Not settled, worth a lawyer's look before the beta: a controller outside the EU that
  serves people in the EU normally needs a representative in the EU (GDPR article 27).
- Known flake: in about one smoke run in three, the "only mods can moderate" check gets a
  502 (Caddy sees the connection close). It was there before 2.6 and couldn't be reproduced
  outside the smoke run; Caddy now drops idle upstream connections after 4 s and Node keeps
  them for 65 s, which didn't remove it.

### 2.7 Donations (about half a week)
- A "Support Tilo" page and a quiet link in the footer. No paywall, no perks that
  change what anyone can make.
- **Provider is open.** Stripe doesn't support accounts in Georgia, so platforms that
  pay out through Stripe are out. Check which of PayPal, Payoneer or Wise can receive
  payouts for you here, then pick a platform that uses it (Ko-fi pays out to PayPal,
  for example).

Progress (2.7, page done, route deferred). `/support` ("Keep the press running") is linked
from the footer: what Tilo costs, what giving doesn't buy, and other ways to help. Until a
route is set it says gifts open soon. What was found (November 2026): PayPal's own list now
has Georgia under "send, receive and withdraw", though older guides still say send-only and
withdrawing to a Georgian bank reportedly needs a Visa card; Stripe still doesn't serve
Georgia, which rules out Buy Me a Coffee. The plan: you check that PayPal receives and
withdraws (a small test payment), then Ko-fi (no fee on one-off gifts, pays out to PayPal)
or a PayPal.me link. Turning it on is one change: `SUPPORT.url` and `SUPPORT.via` in
`src/data/legal.ts`, which also adds the service to the privacy policy. Worth asking an
accountant how gifts to a private person are taxed in Georgia.

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
- Launch checklist: domain through Cloudflare, mail sending, terms and privacy linked (with
  the operator's name and the mail service filled in, and hello@/legal@ forwarding),
  admin account, restore tested.
- Done when: the first invited group is in.

Progress (2026-11-05): the server is live and accounts are open on tiloart.com.
- The app stays on the Cloudflare Worker (it keeps working when the server is down), and the
  Worker sends /auth/v1, /rest/v1, /api, /files and crawler previews through a Cloudflare
  Tunnel to Caddy on the VPS. The VPS has only SSH open; Caddy refuses anything without the
  Worker's EDGE_SECRET. This replaces "80 and 443 limited to Cloudflare's addresses".
- Deploys: `npm run server:deploy` from the Mac (rsync, rebuild, wait until healthy) instead
  of GitHub Actions; the app still deploys on every push.
- Backups: nightly, age-encrypted to a key kept off the server, to Cloudflare R2, 8 days
  daily and 4 weeks weekly, with a daily check at healthchecks.io. Restored from R2 on
  2026-11-05 with matching counts.
- Monitoring: UptimeRobot on /api/health, which also fails when the disk is under 10%.
- Mail: Resend for sign-in links; hello@ and legal@ forward to Gmail (Cloudflare Email
  Routing), with Gmail sending as them through Resend.
- The terms and privacy policy name the operator and every service that handles data.
- New samples (migration 0009, seed step `seed:samples-ai`): the prototype's eight samples
  are replaced by eight drawn by Claude in code (src/data/art.ts, src/data/samples.ts;
  `npm run samples` writes their recordings, pictures and pieces.sql). `pieces.ai` marks
  them; only the seed sets it. Every AI piece shows "AI-made", never the proof-of-hand
  badge, and its page dares people to beat it by hand. The home page's "Most stamped this
  week" with made-up stamps is now "The bar to beat".
- Phones and tablets: the studio's settings fold into four tabs under the sheet below
  861px (iPad upright included), so the sheet gets the room; the sheet fits itself again
  when the screen turns or a tab opens, until someone zooms or moves it. No page scrolls
  sideways from 375px up.
- Left: invite codes for members, a feedback box on every page, error reports, the
  accessibility and performance pass, and the first invited group.

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
