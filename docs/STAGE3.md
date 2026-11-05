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
| 3.2 | Animation: frames, onion skin, timing, loop, GIF and video export, animated pieces in the gallery | 0.11 |
| 3.3 | Process feed: a vertical feed of replays that play as they scroll into view | 0.12 |

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

## 3.2 Animation (outline)

Frames are groups of layers; a frame strip under the sheet, onion skin of the frame before
and after, a time per frame and a loop. Recorded as actions (new frame, copy frame, frame
time), so a replay still runs from the first stroke and then plays the loop. GIF export
written in the browser (own encoder, no upload), video through the timelapse path.

## 3.3 Process feed (outline)

A feed page: one piece per screen height, its replay playing from the start when it scrolls
into view and pausing when it leaves, with the artist, stamps and a link to the piece.
Recordings load as they come near, and only a few replays run at once.

## Open questions

- Grid sizes: are 16, 32, 64, 128 and 64 × 48 the right set, or is 24 × 24 wanted?
- Palettes: which fixed palettes, and should a palette be lockable (indexed colour, swap one
  colour for another everywhere) in 3.1 or with animation?
- Should a pixel piece be remixable into a drawing sheet, or only into a pixel sheet?
