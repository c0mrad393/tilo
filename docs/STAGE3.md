# Stage 3 plan: pixel art, animation, process feed

Goal: Tilo draws pixel art as well as it draws with charcoal, on the same engine, with
the same recording and replay, and the same gallery. Then frames and onion skin turn a
pixel sheet into a short loop, and the gallery gets a feed where replays play as you
scroll.

What doesn't change: a piece is still its list of strokes in the order they were made.
A pixel piece replays cell by cell, the way it was drawn. Proof of hand, moderation,
remixes and the wall work as they do now.

## Milestones

| | what | ships as |
|---|---|---|
| 3.1 | Pixel editor: pixel sheets, pixel tools, palettes, grid, crisp export, publishing | 0.10 |
| 3.2 | Animation: frames, onion skin, timing, loop, GIF and video export, animated pieces in the gallery | 0.12 |
| 3.3 | Process feed: a vertical feed of replays that play as they scroll into view | 0.13 |

0.11 went to Tilo for schools ([SCHOOLS.md](SCHOOLS.md)), so animation moved to 0.12.

## 3.1 Pixel editor

### Pixel sheets

A pixel sheet is a sheet shape with a cell size. Every pixel sheet is 1280 sheet units
across, so the studio, replays and the server render it at the same sizes they already
use; the grid decides how big a cell is.

| shape | grid | sheet units | cell |
|---|---|---|---|
| px16 | 16 × 16 | 1280 × 1280 | 80 |
| px32 | 32 × 32 | 1280 × 1280 | 40 |
| px64 | 64 × 64 | 1280 × 1280 | 20 |
| px128 | 128 × 128 | 1280 × 1280 | 10 |
| pxland | 64 × 48 | 1280 × 960 | 20 |

The shape is chosen before the first stroke, as now. The studio has two kinds of sheet,
Drawing and Pixel art; the kind follows from the shape.

### Tools and the recording

Three new tools, appended to the codec's tool list:

- **pixel**: the pen. Its points are the centres of the cells the pointer passed through,
  one point per new cell. Between two points the cells on the straight line between them
  are filled (Bresenham), so a fast stroke has no gaps and Shift gives a straight line from
  two points. `w` is the brush's width in sheet units (1 to 4 cells).
- **pixelerase**: the same, clearing cells.
- **pixelfill**: one point, the cell clicked. At draw time it fills the cells around it
  that have the same colour, reading the visible layers at cell centres, as the fill tool
  does now. Cells are solid colour, so the read is exact and a replay fills the same cells.

Cells are painted as rectangles whose edges are rounded to whole pixels, so cells side by
side never leave a seam at any zoom or replay size. Symmetry mirrors cells: a cell's mirror
is the cell at the same place from the other edge. Pixel sheets offer Off, Mirror and Four
ways (radial symmetry doesn't land on a grid).

A recording with a pixel tool in it is format 4. Format 4 is format 3 with the new tool
ids; recordings without them keep their old format byte for byte. An app or server older
than format 4 refuses a format 4 recording, so the server is deployed first.

### Papers

Two new papers without grain, Plain white and Plain dark. Pixel sheets use only these;
drawing sheets can use them too. Export can still leave the paper out.

### Studio

- Pixel sheets show only the pixel tools: Pen (P), Eraser (E), Fill (F), plus Alt+click to
  pick a colour up. Size is 1 to 4 cells; opacity and the stabilizer don't apply.
- Palettes: a few of Tilo's own (16 colours, an 8-colour dusk, 4 greys, a warm set), and the
  colour mixer for anything else. Recent colours as now.
- A grid over the cells when they are big enough on screen to see; it can be turned off.
  It's never part of the picture.
- The view shows cells sharp at every zoom.
- Layers, undo, redo, replay, symmetry and the library work as on a drawing sheet. Select
  and move is left out of pixel sheets for now: scaling and turning don't keep to the grid.

### Export

PNG at 1× or 2× the sheet (1280 or 2560 across) with cells sharp, and a "one pixel per
cell" option that saves the true size (32 × 32 for px32). Timelapse as now.

### Server

- pieces.ts: the new papers and shapes in its lists.
- Migration 0012: the `pieces.shape` check takes the new shapes.
- The screen worker renders with the shape's cell size.
- Proof of hand needs no change: pixel strokes are timed and walked like any other.
- The wall keeps its own tools; pixel tools aren't among them.

### Gallery

Pixel pieces sit in the gallery with everything else, with a "Pixel art" label. The
Pixel art bench on the home page opens a new pixel sheet.

## 3.2 Animation

A pixel sheet gets frames: draw a frame, copy it, change a few cells, and the frames play
as a loop. The replay still starts from the first stroke and shows each stroke on the frame
it was drawn on; when the last stroke is down, the loop plays. Pixel sheets first: the
engine doesn't tie frames to the grid, but drawing sheets don't come for free (see the end
of this section).

### Frames are groups of layers

Every layer belongs to one frame. A frame is an id and a time; the piece keeps its frames in
play order beside its layers:

```ts
interface FrameDef { id: number; ms: number; gone?: true }
interface Anim { frames: FrameDef[]; bounce?: true }   // Piece.anim; missing = a still
interface LayerDef { ...; f?: number }                  // the layer's frame; missing = frame 0
```

- A still piece has no `anim` and no `f` on its layers, exactly as now.
- `ms` is the frame's time on screen: 20 to 2000 ms in steps of 10 (GIF counts in
  hundredths of a second), 120 ms when a frame is made.
- `bounce` plays the loop forward and then back (1 2 3 4 3 2) instead of 1 2 3 4 1 2.
- An animation has 2 to 24 frames and up to 8 layers a frame, as a sheet has now.

### The recording: no new format

The strokes don't change. A stroke already names its layer, and the layer says which frame
it is on, so the stroke list needs nothing new.

- **Copy frame** copies pixels, so it is recorded. It is one `dup` per layer of the frame:
  the layer copy that format 3 already has. A replay repeats it exactly.
- **New frame**, **frame order** and **frame time** don't change any pixels. They go in
  the frame list, the way adding a layer, the layer order and a layer's opacity go in the
  layer stack now. A replay shows the same thing either way.
- So an animated recording is byte for byte a format 3 or 4 recording, and `FORMAT` stays 4.
  Old recordings, old pieces and their replays don't change. No app or server has to be
  newer to read it.

This differs from the outline, which had new frame and frame time as recorded actions.
Recording them would mean a format 5 and a newer server, and a replay would look exactly
the same.

Deleting a frame works like deleting a layer. If no other frame was copied from it, its
layers and strokes go. If one was, it stays in the list as `gone`, out of the strip and
out of the loop, so the copy still replays.

### Engine

- **Painter** gets `frame`. With `frame` set it composites only that frame's layers; with it
  unset (every still) it composites all layers as now. A fill (`fill`, `pixelfill`) reads
  the layers of its own stroke's frame, so it fills the same cells in the studio, a replay
  and the server.
- **Replayer**: while strokes are drawn, the frame shown is the frame of the stroke being
  drawn. A copy shows the frame it copies to. `loop(t)` then draws the frame at time `t` of
  the loop. An animated piece's replay paints at one pixel per cell and scales up with the
  cells kept sharp. That keeps 24 frames light on a phone. Stills keep today's painter.
- **Studio painter** on pixel sheets: one pixel per cell too (a 32 × 32 layer is 4 KB, not
  6.5 MB), drawn onto the view with smoothing off, as now.
- **GIF** (`src/engine/gif.ts`): Tilo's own GIF89a writer: a colour table, LZW, a time
  for each frame, a loop that never ends, and only the changed rectangle of each frame
  stored. Pixel art has fewer than 256 colours almost always, so the colours are exact.
  When there are more (layer opacity, blends), the most-used 256 are kept and each pixel
  takes the nearest. It is plain TypeScript, so the browser and the server's worker use the
  same file.
- Tests: an animated stroke list encodes to the same bytes as before, and the byte-layout
  snapshot is unchanged. Painter and Replayer show only a frame's layers, the right frame
  at a given stroke and at a given loop time, and fills read their own frame. A GIF is
  written and read back with a small decoder in the test: same pixels, times and loop.

### Studio

Under the sheet on a pixel sheet, a **frame strip**:

```
[▶ Play]  [1 ■] [2 ■] [3 ■] [4 ■]  [+ New] [Copy] [Delete]   120 ms  [All]   Loop ▾   Onion ◐
```

- Each frame is a small picture of itself with its number and time. Click to go to it;
  ← and → buttons (and drag) move the chosen frame.
- **New** adds an empty frame after this one, with the same layers (names, blend,
  opacity), empty. **Copy** adds a copy of this frame after it (recorded). **Delete**
  asks first when the frame has strokes.
- **Time**: the chosen frame's time, with **All** to give every frame the same one.
  **Loop**: Forward or Back and forth.
- **Onion skin**: the frame before in a warm tint and the frame after in a cool one, at 30%,
  under the frame being drawn, on screen only. Forward loops wrap around (frame 1 sees the
  last frame). It is on by default once there are two frames.
- **Play** plays the loop on the sheet at its times; drawing or picking a frame stops it.
- The Layers panel shows the chosen frame's layers. Undo and redo switch to the frame
  they change, so you see what they did. Undoing a Copy takes the whole copied frame away
  at once.
- Keys, on pixel sheets: `,` `.` frame before and after, `N` new frame, `D` copy frame,
  `K` play and stop, `O` onion skin. None of them is a pixel-sheet key now.
- A pixel sheet starts as one frame, so a still is a still and nothing changes for it. The
  strip shows only Add frame until there are two frames.
- Schools and the wall don't get frames in 0.12.

### Publishing and the server

- The studio sends `anim` with the meta, and `f` on each layer. The local save in Your
  sheets keeps them too.
- `pieces.ts` check: only on pixel shapes for now. It needs 2 to 24 frames with unique
  ids, times of 20 to 2000 ms in steps of 10, at least two frames not gone, and every
  layer's `f` a frame in the list. The layer stack can be 200 long when there are frames
  (64 for a still). Remixing an animation is refused for now.
- Migration 0017: `pieces.anim jsonb` (null for stills). `SELECT` and `fromRow` read it.
- **Image check** (screen worker): frames along the replay are taken on the frame being
  drawn then. Every frame of the loop is checked whole, plain and softened. A layer is
  checked alone only where it could hide something: when it is hidden, faded, or has
  another layer above it in its frame. 24 single-layer frames come to about a hundred
  checks, well inside the 3-minute limit.
- **Picture**: the webp is the first frame, as everywhere a still picture is used (the share
  card, the profile, link previews). An animation also gets `img/{id}.gif`, written by the
  worker at one pixel per cell (a 32 × 32 loop is a few KB). It moves with the piece's status
  and is removed and purged with its other files. While a piece is held, its owner and the
  mods get it at `/api/pieces/{id}/gif`.

### Gallery and the piece page

- A card for an animation shows the GIF, scaled up with `image-rendering: pixelated`, so it
  plays with no script and no recording fetched. It shows the still webp when the viewer
  prefers less motion. Hovering plays the replay as now, and then the loop.
- An "Animation" mark on its plate beside the Pixel art mark, and an Animation filter in the
  gallery (`anim=not.is.null`).
- On the piece page, the plate plays the loop. Replay draws it from the first stroke and
  then plays the loop. The facts list adds frames and the loop's length.

### Export

- **GIF**, made in the browser and never uploaded: at one pixel per cell, or large (the
  biggest whole multiple of the grid up to 1024 across, cells sharp), on its paper.
- **Video**: the share sheet's "Save as video" (`src/data/video.ts`). For an animation,
  the replay is followed by the loop, played big for about four seconds. The studio's
  timelapse ends with the loop the same way.
- PNG export saves the chosen frame.

### Slices

1. This plan.
2. Engine and recording: frames on layers, Painter `frame`, Replayer frame and loop, the
   GIF writer, tests.
3. Studio: frame strip, onion skin, timing, loop, playback, keys, undo, local save.
4. Publishing: meta, server check, migration 0017, worker frames, picture and GIF, gallery
   card and piece page playback, Animation mark and filter. The server is deployed before
   the app is pushed.
5. GIF export, then the video path.

Built in 0.12 (migration 0017; `src/engine/frames.ts`, `src/engine/gif.ts`, the frame strip
in `Studio.tsx`, `loopGif` in `server/api/src/screen/worker.ts`). The GIF export offers one
pixel a cell or the biggest whole multiple up to 1024 across, honours "Leave out the paper",
and plays forward and back when the loop does.

### Why drawing sheets wait

Frames work on any sheet in the engine. But a drawing sheet's layer is about 8 MB in the
studio, so 24 frames don't fit on a tablet. Charcoal and paper grain also have thousands
of colours, so a GIF of a drawing needs dithering and comes out large. Drawing sheets can
get frames later with video as their export.

## 3.3 Process feed

A page of replays to scroll through: one piece per screen, drawing itself from its first
stroke when it comes into view and stopping when it leaves, with who made it, its stamps
and a way into the piece. The gallery shows what was made; the feed shows it being made.

### The page

- `/feed`, "On the press" (the home row of that name opens it), in the main menu after
  Gallery.
- One piece per screen height, snapped into place as it scrolls (`scroll-snap`, proximity,
  so a long flick still moves freely). The plate fills the screen as far as it can.
- Wide screen: the plate in the middle, its details beside it. Phone: the plate full width,
  the details under it, a few lines.
- Details: title, @artist with Follow, AI-MADE and Pixel art / Pixel animation marks as
  everywhere, stroke count and time, the stamps (the same buttons as on the piece page),
  Open the piece, Remix when allowed, Share.
- The trace under the plate shows where the replay is; dragging it seeks, as on the piece
  page.
- Feeds: Newest, Following (signed in), Today's subject, Pixel art, Animation, the
  gallery's own lists through `listPieces`, so the server needs nothing new. The gallery
  gets "Watch as a feed" for the list it is showing.
- AI-made samples appear in it like in the gallery, marked AI-MADE.

### Playing

- The piece most in view plays (more than 60 % of it on screen); the one before stops
  where it was. Coming back to a piece goes on from there; a finished one starts over.
- A replay takes 6 to 15 s however many strokes it has, like the share video, so a long
  piece doesn't hold the feed up. Tap or Space pauses; 1×, 2×, 4× as on the piece page.
- An animation draws, then plays its loop for about four seconds and keeps looping while
  it is on screen.
- When a replay ends it holds the picture with "Next" pointing down; the feed doesn't
  move by itself.
- Keys: J and K (or the arrows) next and previous, Space play and pause, ← → seek.
- Reduced motion: nothing plays by itself and there is no snapping; each piece shows its
  picture with a Play button. Data saver (`navigator.connection.saveData`): the same,
  and a recording loads only when Play is pressed.
- A hidden tab pauses.

### Light enough for a phone

A replay is a painter with its layers; on a drawing sheet that is megabytes, so the feed
keeps very few of them.

- One replay runs at a time. The pieces just before and after are made ready (recording
  loaded, painter built, first stroke shown) so the next one starts at once.
- At most three painters live; a piece further away shows its picture (the webp, lazy,
  decoded off the main thread) and its painter and canvas are let go (canvas sized to 0
  so the memory is returned).
- Each painter works at the plate's size on screen, at most 1600 px on its long side, not
  at the sheet's.
- Recordings load when their piece is two screens away, and only the last eight decoded
  are kept.
- Pages of 12 pieces load as the end comes near. Pieces far behind are kept as empty
  blocks of their height, so the page doesn't grow without end.
- The scheduling (which piece plays, which are ready, which are let go) is plain code
  with no DOM, with tests.

### Slices

1. This plan.
2. The scheduler and the recording cache, with tests; the feed's player, built on
   `Replayer`, sized to the plate, let go when told.
3. The page: layout on wide and narrow screens, details, stamps, follow, the lists,
   paging, keys, reduced motion and data saver.
4. Ways in: the menu, the home row, "Watch as a feed" in the gallery. Checked on a phone
   size and on the slowest machine to hand: memory stays flat while scrolling 50 pieces.
   Ships as 0.13.

### Progress

Shipped as 0.13.0. The plan is `src/data/feed.ts` with its tests; the player is
`FeedPlayer`, the page `pages/Feed.tsx`. Checked at 1440 × 900 and 375 × 812, with reduced
motion: three painters at most, never more than 13 pieces drawn at once, and the JS heap flat
(25, 21, 20 MB) over three passes of the 24 local pieces, 72 screens.

### Decided

- The page is headed "On the press", like the home row; the menu says Feed.
- The feed doesn't move on by itself; that can come later as an option if people ask.
- The AI samples stay in it, marked AI-MADE, as in the gallery.

## Open questions

- Grid sizes: are 16, 32, 64, 128 and 64 × 48 the right set, or is 24 × 24 wanted?
- Palettes: which fixed palettes, and should a palette be lockable (indexed colour, swap one
  colour for another everywhere) in 3.1 or with animation?
- Should a pixel piece be remixable into a drawing sheet, or only into a pixel sheet?
- Animation: should a layer be able to sit on every frame (a shared background), or is
  Copy frame enough for 0.12?
- Animation: when should remixing an animation open, and does the remixer get a layer on
  every frame?
