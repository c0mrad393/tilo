# Tilo

A browser studio for hand-made digital art, with a gallery where every piece keeps its full
replay: each stroke is recorded as it is made, so a finished picture can be watched being
drawn from its first line.

Tilo ran at tiloart.com in November 2026 and closed on 27 November 2026. The service is gone;
the code is here under the MIT license, for anyone who wants to learn from it, run it or build
on it.

## What's in it

- **The studio**: pencil, ink, marker, wash, brush pen, charcoal, gouache, oil, spray, fill,
  smudge, eraser and lasso, with pressure, layers and blend modes, symmetry, papers with grain,
  and landscape, portrait and square sheets. Everything is recorded, stroke by stroke.
- **Pixel art and animation**: sheets of 16 to 128 cells, palettes, frames with their own
  times, onion skin, and a GIF writer of its own (`src/engine/gif.ts`).
- **Replays**: a compact binary recording format (`src/engine/codec.ts`) and a replayer that
  plays any piece back at any speed, with a "trace" of every stroke's pressure as a timeline.
- **The gallery and the feed**: publishing, stamps, follows, remixes with credit, and a feed
  of pieces drawing themselves, one a screen.
- **The wall**: a shared sheet everyone draws on, a day at a time.
- **Schools**: classes, tasks and picture-password sign-in for pupils, with a demo school that
  runs entirely in the browser (`/demo`).
- **Moderation**: an image check on every frame (open NSFW models), reports, a mod queue and
  an admin panel.
- **Video**: replays and timelapses exported as video in the browser.

The pieces published as @tilo are samples that Claude, an AI, drew in code with Tilo's own
tools; they are marked AI-made everywhere they appear.

## Running it

Needs Node 22 or later.

```bash
npm install
npm run dev        # the app on http://localhost:4640
```

On its own, the app runs without a server: the studio, the samples, the wall and the demo
school work, and what you make is kept in the browser. Accounts, publishing and the shared
gallery need the server in `server/`: Postgres, Supabase Auth, PostgREST, a Node API and Caddy
in one `docker compose`. [server/README.md](server/README.md) shows how to start it on your
own computer, and how tiloart.com was hosted (a small VPS behind a Cloudflare Worker and
tunnel). Before hosting it yourself, replace what is tiloart.com's own: the names and
addresses in `src/data/legal.ts` and the terms and privacy pages in `src/pages/Legal.tsx`.

```bash
npm run build      # typechecks and builds to dist/
npm test           # the engine's and the feed's tests
```

## Layout

- `src/engine`: the drawing engine, with no framework code: strokes and brushes, the painter,
  pointer capture, the replayer, frames, the recording codec, GIF and video export
- `src/data`: pieces, accounts, the wall, schools, the samples drawn in code
- `src/components`, `src/pages`: the React UI
- `src/styles`: design tokens, base, materials and app styles
- `server/`: the server stack, its migrations, the API (`server/api`), backups and ops scripts
- `worker/`, `wrangler.app.jsonc`: the Cloudflare Worker that served tiloart.com
- `closed/`, `wrangler.jsonc`: the page tiloart.com shows now that Tilo is closed
- `docs/`: the plans, stage by stage ([docs/ROADMAP.md](docs/ROADMAP.md) first)
- `marketing/`: scripts that render the promo videos from the app itself
- `prototype/tilo.html`: prototype 0.1, kept for reference

## Licenses

The code is MIT ([LICENSE](LICENSE)). The fonts (Archivo, Newsreader, Martian Mono) are under
the SIL Open Font License; their licenses sit next to the copies in `server/api/assets/fonts`
and in their npm packages.
