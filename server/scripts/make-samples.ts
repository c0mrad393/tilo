/* Draws Tilo's sample pieces (src/data/samples.ts) with the studio's own engine, on skia, as
   tilo-api's image check does, and writes what the seed needs: each piece's recording
   ({id}.tl), its picture ({id}.webp) and server/seed/samples/samples.sql. With `preview DIR`
   it only writes PNGs there, to look at while drawing them.
   Usage, from the repository root: npm run samples [-- preview DIR [id ...]] */

import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLES, publishedSample, SAMPLE_ACCOUNT } from "../../src/data/samples";
import { encode } from "../../src/engine/codec";
import { Painter } from "../../src/engine/painter";
import { drawnCount, layersOf, sizeOf, type Piece } from "../../src/engine/stroke";

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D, document: { createElement: () => createCanvas(1, 1) } });

/** the scale tilo-api draws pictures at */
const K = 0.5;

function draw(piece: Piece) {
  const sheet = sizeOf(piece);
  const W = sheet.w * K, H = sheet.h * K;
  const painter = new Painter(W, H, K, layersOf(piece).map((l) => ({ ...l })), piece.paper ?? "smooth");
  for (const s of piece.strokes) painter.apply(s);
  const canvas = createCanvas(W, H);
  painter.render(canvas.getContext("2d") as unknown as CanvasRenderingContext2D);
  return canvas;
}

const [mode, dir, ...only] = process.argv.slice(2);
const pieces = SAMPLES.filter((p) => !only.length || only.includes(p.id));

if (mode === "preview") {
  mkdirSync(dir, { recursive: true });
  for (const p of pieces) {
    const t = Date.now();
    writeFileSync(join(dir, `${p.id}.png`), await draw(p).encode("png"));
    console.log(`${p.id}: ${drawnCount(p.strokes)} strokes, ${encode(p.strokes).length} bytes, ${Date.now() - t} ms`);
  }
} else {
  const out = join("server", "seed", "samples");
  for (const f of readdirSync(out)) if (/\.(tl|webp)$/.test(f)) rmSync(join(out, f));
  const rows: string[] = [];
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  pieces.forEach((p, i) => {
    const id = publishedSample(p.id);
    const rec = encode(p.strokes);
    writeFileSync(join(out, `${id}.tl`), rec);
    rows.push(
      `    (${q(id)}, ${q(p.title)}, ${q(p.paper ?? "smooth")}, ${q(p.shape ?? "land")}, ${q(JSON.stringify(layersOf(p)))}::jsonb, ` +
        `${drawnCount(p.strokes)}, ${p.minutes}, 2, ${rec.length}, ${p.prompt ?? "null"}, ${p.remixOf ? q(publishedSample(p.remixOf)) : "null"}, ` +
        `'webp', now() - interval '${pieces.length - i} hours')`,
    );
  });
  for (const p of pieces) writeFileSync(join(out, `${publishedSample(p.id)}.webp`), await draw(p).encode("webp", 82));
  writeFileSync(
    join(out, "pieces.sql"),
    `-- written by server/scripts/make-samples.ts from src/data/samples.ts; don't edit by hand\n` +
      `insert into public.pieces (id, title, paper, shape, layers, strokes, minutes, format, bytes, subject, remix_of, picture, created, owner, ai)\n` +
      `select v.*, ${q(SAMPLE_ACCOUNT)}::uuid, true from (values\n${rows.join(",\n")}\n) as v(id, title, paper, shape, layers, strokes, minutes, format, bytes, subject, remix_of, picture, created)\n` +
      `on conflict do nothing;\n`,
  );
  console.log(`wrote ${pieces.length} pieces to ${out}`);
}
