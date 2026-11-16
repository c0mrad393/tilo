/* Draws Tilo's sample pieces (src/data/samples.ts) with the studio's own engine, on skia, as
   tilo-api's image check does, and writes what the seed needs: each piece's recording
   ({id}.tl), its picture ({id}.webp) and the rows for it: the paintings in
   server/seed/samples/pieces.sql, the pixel pieces (added later, and seeded on their own by
   migrate.sh) in server/seed/samples/pixel/pieces.sql, beside their files, Release week's likewise in
   server/seed/samples/release, and the pixel animations in server/seed/samples/anim, each with
   its loop as {id}.gif, as tilo-api's worker writes it. With `preview DIR` it only writes PNGs
   there (an animation's frames side by side), to look at while drawing them.
   Usage, from the repository root: npm run samples [-- preview DIR [id ...]] */

import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ANIMATED, publishedSample, RELEASE, SAMPLE_ACCOUNT, samples } from "../../src/data/samples";

const SAMPLES = samples();
import { encode } from "../../src/engine/codec";
import { isAnimated, liveFrames, playOrder } from "../../src/engine/frames";
import { encodeGif } from "../../src/engine/gif";
import { gridOf } from "../../src/engine/pixel";
import { Painter } from "../../src/engine/painter";
import { drawnCount, isPixelShape, layersOf, SHAPES, sizeOf, type Piece } from "../../src/engine/stroke";

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D, document: { createElement: () => createCanvas(1, 1) } });

/** the scale tilo-api draws pictures at */
const K = 0.5;

/** the picture; an animation's is its first frame, as tilo-api's is */
function draw(piece: Piece, frame = piece.anim ? liveFrames(piece.anim)[0]?.id : undefined) {
  const sheet = sizeOf(piece);
  const W = sheet.w * K, H = sheet.h * K;
  const painter = new Painter(W, H, K, layersOf(piece).map((l) => ({ ...l })), piece.paper ?? "smooth");
  painter.frame = frame;
  for (const s of piece.strokes) painter.apply(s);
  const canvas = createCanvas(W, H);
  painter.render(canvas.getContext("2d") as unknown as CanvasRenderingContext2D);
  return canvas;
}

/** an animation's loop at one pixel a cell, as tilo-api's worker writes it */
function loopGif(piece: Piece) {
  const sheet = sizeOf(piece);
  const g = gridOf(SHAPES[piece.shape!]!.grid!, sheet);
  const painter = new Painter(g.cols, g.rows, g.cols / sheet.w, layersOf(piece).map((l) => ({ ...l })), piece.paper ?? "smooth");
  for (const s of piece.strokes) painter.apply(s);
  const canvas = createCanvas(g.cols, g.rows);
  const ctx = canvas.getContext("2d");
  const frames = playOrder(piece.anim!).map((f) => {
    painter.frame = f.id;
    ctx.clearRect(0, 0, g.cols, g.rows);
    painter.render(ctx as unknown as CanvasRenderingContext2D);
    return { rgba: ctx.getImageData(0, 0, g.cols, g.rows).data, ms: f.ms };
  });
  return encodeGif(g.cols, g.rows, frames);
}

/** every frame of an animation side by side, for looking at */
function strip(piece: Piece) {
  const shots = liveFrames(piece.anim!).map((f) => draw(piece, f.id));
  const { width: w, height: h } = shots[0];
  const out = createCanvas(shots.length * (w + 8), h);
  const ctx = out.getContext("2d");
  shots.forEach((c, i) => ctx.drawImage(c, i * (w + 8), 0));
  return out;
}

const [mode, dir, ...only] = process.argv.slice(2);
const pieces = SAMPLES.filter((p) => !only.length || only.includes(p.id));

if (mode === "preview") {
  mkdirSync(dir, { recursive: true });
  for (const p of pieces) {
    const t = Date.now();
    writeFileSync(join(dir, `${p.id}.png`), await (isAnimated(p) ? strip(p) : draw(p)).encode("png"));
    if (isAnimated(p)) writeFileSync(join(dir, `${p.id}.gif`), loopGif(p));
    console.log(`${p.id}: ${drawnCount(p.strokes)} strokes, ${encode(p.strokes).length} bytes, ${Date.now() - t} ms`);
  }
} else {
  const root = join("server", "seed", "samples");
  const moving = (p: Piece) => ANIMATED.includes(p.id);
  const later = (p: Piece) => RELEASE.includes(p.id) || moving(p);
  await write(root, pieces.filter((p) => !isPixelShape(p.shape) && !later(p)));
  await write(join(root, "pixel"), pieces.filter((p) => isPixelShape(p.shape) && !later(p)));
  await write(join(root, "release"), pieces.filter((p) => RELEASE.includes(p.id)));
  await write(join(root, "anim"), pieces.filter(moving));
}

async function write(out: string, pieces: Piece[]) {
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(out)) if (/\.(tl|webp|gif)$/.test(f)) rmSync(join(out, f));
  // the anim column only where there are animations, so the other seed files stay as they were
  const moving = pieces.some(isAnimated);
  const rows: string[] = [];
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  pieces.forEach((p, i) => {
    const id = publishedSample(p.id);
    const rec = encode(p.strokes);
    writeFileSync(join(out, `${id}.tl`), rec);
    rows.push(
      `    (${q(id)}, ${q(p.title)}, ${q(p.paper ?? "smooth")}, ${q(p.shape ?? "land")}, ${q(JSON.stringify(layersOf(p)))}::jsonb, ` +
        (moving ? `${p.anim ? `${q(JSON.stringify(p.anim))}::jsonb` : "null::jsonb"}, ` : "") +
        `${drawnCount(p.strokes)}, ${p.minutes}, ${rec[2]}, ${rec.length}, ${p.prompt ?? "null::int"}, ${p.remixOf ? q(publishedSample(p.remixOf)) : "null"}, ` +
        `'webp', now() - interval '${pieces.length - i} hours')`,
    );
  });
  for (const p of pieces) {
    writeFileSync(join(out, `${publishedSample(p.id)}.webp`), await draw(p).encode("webp", 82));
    if (isAnimated(p)) writeFileSync(join(out, `${publishedSample(p.id)}.gif`), loopGif(p));
  }
  const cols = `id, title, paper, shape, layers, ${moving ? "anim, " : ""}strokes, minutes, format, bytes, subject, remix_of, picture, created`;
  writeFileSync(
    join(out, "pieces.sql"),
    `-- written by server/scripts/make-samples.ts from src/data/samples.ts; don't edit by hand\n` +
      `insert into public.pieces (${cols}, owner, ai)\n` +
      `select v.*, ${q(SAMPLE_ACCOUNT)}::uuid, true from (values\n${rows.join(",\n")}\n) as v(${cols})\n` +
      `on conflict do nothing;\n`,
  );
  console.log(`wrote ${pieces.length} pieces to ${out}`);
}
