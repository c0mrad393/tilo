# Tilo roadmap

Tilo is a free browser studio for hand-made digital art, with a gallery where every
piece keeps its full replay. One person builds it, so every stage has to be shippable
on its own and cheap to run.

Principle that keeps costs low: pieces are stored as recorded actions (strokes, frames,
notes), not as video. The browser renders replays, previews and exports.

## Stage 0 — Foundation and design system (now)

- Vite + React + TypeScript app, self-hosted fonts.
- Design system v0.3, "print shop": warm newsprint with grain, printed in two riso inks
  (blue and fluorescent pink) that overprint; work shown as catalogue plates with crop
  marks; Archivo (condensed to wide) and Newsreader. One **material per discipline**
  (paper, graph paper, light table, linen, kraft, staff paper, leaded glass, slate).
  Motion is a press pass: blocks and routes print in top to bottom, the second ink
  comes in out of register. Each replay shows its trace (pressure and speed over time).
  v0.2 used a green cutting mat; replaced because it read as generic.
- Shared engine: stroke model, renderer, pointer capture, replayer, sample generator.
- Home v0.2: hand-drawn logo and annotations played from stroke data, local wall,
  "being made" replay feed, workbench overview, daily prompt, gallery with
  pinboard and exhibition views, piece page with replay.
- Minimal studio carried over from prototype 0.1 so nothing regresses.

## Stage 1 — Painting studio v2

- Brush engine with textures: pencil, ink, marker, wash, charcoal, gouache, oil, spray, brush pen, smudge, eraser.
- Layers (add, hide, reorder, opacity, blend mode), fill, lasso, symmetry, perspective guides.
- Paper textures, zoom and pan, pinch on touch, stylus pressure and tilt.
- Recorder v2: compact binary action log (delta + varint), versioned format.
- Local library in IndexedDB, autosave, export PNG and timelapse video in the browser.

Progress, part 1 (v0.4): all thirteen tools, layers with blend and opacity, fill and lasso, mirror and radial symmetry, zoom and pan with pinch, pen pressure, Alt-click colour pick. Replays draw through the same layered painter. Still to do: perspective guides, paper textures, tilt, recorder v2, IndexedDB library, PNG and timelapse export.

## Stage 2 — Accounts, publishing, closed beta

- Auth and Postgres (Supabase), files in Cloudflare R2 through a Worker, Cloudflare Pages hosting.
- Profiles, publish to gallery, stamps, follow, report.
- Moderation v1: AI image check on publish plus a report queue.
- Proof of hand v1: no image import in the hand-made category, "Recorded on Tilo" badge.
- Terms, privacy policy (GDPR), takedown process.
- **Donations open here**: a "Support Tilo" page and a quiet link in the footer.

## Stage 3 — Pixel art, animation, process feed

- Pixel editor on the same raster engine (grid, palettes, indexed colour).
- Frame-by-frame animation with onion skin, loops, GIF/MP4 export in the browser.
- Process feed: replays play as you scroll.

## Stage 4 — Social modes and public launch

- Daily prompts on a schedule, entries, results.
- Remix chains with credit.
- Live co-drawing rooms and the shared wall (Durable Objects).
- Exquisite corpse: a sheet folded in three, each part drawn by a different person.
- Proof of hand v2: stroke-dynamics checks, live-drawn badge, C2PA content credentials on export.

## Stage 5 — New workbenches

- Calligraphy and lettering, including Georgian Mkhedruli guides.
- Pattern and ornament: draw one tile, see it repeat (later: print on demand).
- Paper collage: cut, arrange, glue.
- Comics and zines: panels, balloons, multi-page series.
- Mosaic and stained glass.

## Stage 6 — Sound and code

- Music sketch: step sequencer and simple synth, can score an animation.
- Creative code sketches, shown in their own category.

3D sculpting is parked for now.

## Funding

Donations from Stage 2 (Ko-fi, Patreon or Open Collective; check which pay out to
Georgia, usually through Payoneer). Later options, in order of fit: a Pro plan for
power features (big canvases, video export, more layers), sponsored prompts,
print on demand with an artist share, school and studio licences.
