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

Progress, part 2 (v0.5): recorder v2 (a versioned binary log with delta and varint coding, about a third the size of JSON), a library of sheets in IndexedDB with autosave and pictures, six papers whose grain catches charcoal, pen tilt for the brush pen and pencil, one- and two-point perspective guides with snapping, Shift for straight lines, PNG export at 1× or 2× (with or without paper) and timelapse video export (MP4 or WebM) in the browser. Stage 1 is done.

## Stage 1.5 — Studio and site, before any server

Order from here: 1.5, then the pixel-art and animation part of Stage 3, then Stage 2. Everything in 1.5 runs in the browser alone.

- A. Studio essentials: stroke stabilizer, turning and mirroring the view, a real colour mixer with recent colours, layer rename, tests that guard the recording format.
- B. Sheet shapes and actions: portrait and square sheets, moving, scaling and turning a selection, duplicating and merging layers, all recorded so replays stay true.
- C. Then Stage 3's pixel-art editor and frame animation with GIF export.
- D. Technical: works offline as an installable app, faster first load (split the code by page), friendly error screens, an accessibility pass.

Progress, part A (v0.6): Vitest with tests for the codec (a byte-layout snapshot and seeded round trips), symmetry, perspective snap, paper grain, the view maths and colour conversion; they caught a bug where strokes on the bottom layer could land on the wrong one. The stabilizer pulls the brush along on a string (Steady, 0–100) and catches up when the pen lifts. The view turns in 15° steps (R, Shift+R), mirrors (H), and turns with a two-finger twist on touch screens; Fit (0) straightens it. Colour has a saturation and brightness square, a hue strip, a hex field and the last ten colours used. Layers rename with a double-click or the rename button.

Progress, part B (v0.7): sheets come in landscape (1600 × 1200), portrait (1200 × 1600) and square (1400 × 1400), chosen before the first stroke; cards and the gallery centre other shapes on their plate, and pictures and timelapses keep the shape. The select tool (V) lassos part of a layer, then moves, scales, turns or flips it. Layers duplicate and merge down. All three are recorded as actions in the stroke list, so replays repeat them exactly; the recording is format 3 only when it holds them, and plain recordings are still byte-for-byte format 2. A merged layer stays in the recording out of sight. Undo and redo cover the actions too. Next: part D (offline, code split, error screens, accessibility), then Stage 3.

Progress, part D (v0.8): Tilo installs as an app and works offline. A service worker, written at build time, keeps the pages, fonts and icons; pages come from the network first and from the cache after four seconds without an answer. Each page loads on its own, so the first download is a quarter smaller and the studio arrives only when opened, with a thin bar while a page loads. Addresses that lead nowhere get a 404 page; a page that fails to load or breaks says why and offers a reload, and in the studio it says the sheet is saved. Accessibility: a skip link, one heading per page and panel headings in order, a stronger orange for the colour label, and axe reports no problems on any page in light or dark, the studio dialogs included. Next: Stage 3 (pixel art and animation).

## Stage 2 — Accounts, publishing, closed beta

Detailed plan, milestones and open decisions: [STAGE2.md](STAGE2.md).

- Self-hosted Supabase (Auth, Postgres) and a small publishing API on Tilo's own VPS, files on its disk, Cloudflare in front as DNS and proxy only.
- Profiles, publish to gallery, stamps, follow, report.
- Moderation v1: AI image check on publish plus a report queue.
- Proof of hand v1: no image import in the hand-made category, "Recorded on Tilo" badge.
- Terms, privacy policy (GDPR), takedown process.
- **Donations open here**: a "Support Tilo" page and a quiet link in the footer.

## Stage 3 — Pixel art, animation, process feed

- Pixel editor on the same raster engine (grid, palettes, indexed colour).
- Frame-by-frame animation with onion skin, loops, GIF/MP4 export in the browser.
- Process feed: replays play as you scroll.

Detailed plan, milestones and open questions: [STAGE3.md](STAGE3.md).

Progress, 3.1 (v0.10): pixel sheets of 16, 32, 64 or 128 cells square, or 64 × 48, chosen before the first stroke. A pixel pen, eraser and fill that work cell by cell, with Shift for straight lines, a brush of 1 to 4 cells and mirror symmetry that lands on the grid. Four palettes of Tilo's own beside the mixer, a grid when zoomed in, cells sharp at every zoom, two papers without grain, and a PNG at one pixel a cell. Pixel strokes are recording format 4; older recordings keep their format byte for byte. Then 0.10.1 put it on show: four pixel samples drawn in code by Claude (Narikala at night, khinkali, a Batumi sunset, a pomegranate), seeded on their own; a pixel section and a "new" note on the home page, a Pixel art filter in the gallery, a Pixel art mark on every pixel plate, and "New pixel sheet" in Your sheets. The image check now also looks at every frame of a pixel piece softened, cells blended into each other, since the models read blocky pictures less well. Next: 3.2, animation.

Tilo for schools (v0.11), ahead of 3.2 ([SCHOOLS.md](SCHOOLS.md)): teachers register a school with their own account and Tilo lets it in; colleagues join with a teacher code and a teacher there approves them. Classes for ages 6 to 8, 9 to 11 and 12 to 15; pupils sign in with a class code, their name and a picture password, with no email or account. Tasks from ready-made lessons (drawing or pixel, fixed colours, a due date), a pupil's studio with big tools and a crayon box for the younger ages, work saved to the server as they draw, hand-in with the image check, the teacher's review with replay, stamps and a note, a class gallery, and shows by link for parents. Printable sign-in cards. /demo runs the whole thing in the browser with a made-up school and drawings in a child's hand, drawn in code, for showing schools before they sign up. Next: 3.2, animation, as 0.12.

Progress, 3.2 (v0.12): a pixel sheet gets frames. A frame strip under the sheet copies a frame (recorded, so the replay repeats it) or starts an empty one, moves and deletes frames, and gives each frame its time on screen (20 ms to 2 s), with a loop forward or back and forth, onion skin of the frames either side and playback on the sheet. Frames are groups of layers, so the recording format stays 4 and old pieces don't change. Published animations play in the gallery as a GIF the server writes at one pixel a cell (the still picture when motion is reduced), with a Pixel animation mark and an Animation filter; the piece page opens on the loop and Play draws it from the first stroke. The image check looks at every frame of the loop. The studio saves a GIF made in the browser by Tilo's own writer, the PNG of the frame on the sheet, and a timelapse that ends with the loop; the share sheet's video plays the loop after the replay. Schools, the wall and remixes of animations wait. Then 0.12.1 put it on show: four pixel animations drawn in code by Claude (tea, still hot; the cable car after dark; a cat on the balcony; and, for Release week, the coast road the night before, our own picture), seeded on their own (seed:samples-anim) with their GIFs; a Pixel animation section and a "new" note on the home page. The offline service worker no longer keeps the app page under a built file's address, and a page from an older build reloads itself once instead of staying blank. Next: 3.3, the process feed.

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
