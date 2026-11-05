/* The image check, in a worker thread so the API keeps answering while it runs. It draws the
   recording with the studio's own engine (on skia instead of a browser canvas), takes frames
   along the way and of each layer alone, and runs every frame through two open NSFW models
   (nsfwjs: MobileNetV2 and InceptionV3, on TensorFlow.js's wasm backend). Frames along the
   way catch a piece that showed something and painted over it, since its replay shows that
   too; layers alone catch what sits on a hidden layer, which a remix would bring back.
   The final frame becomes the piece's picture, so the picture is always the recording's.
   It also keeps the shared wall drawn, adds each batch of marks and checks the parts of the
   wall they touched (WallJob).
   Built with esbuild into dist/screen.mjs, because the engine isn't plain Node TypeScript. */

import { createCanvas, DOMMatrix, ImageData, Path2D, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-wasm";
import * as nsfwjs from "nsfwjs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { parentPort } from "node:worker_threads";
import { decode } from "../../../../src/engine/codec";
import type { PaperId } from "../../../../src/engine/paper";
import { Painter } from "../../../../src/engine/painter";
import { BASE_LAYER, drawStroke, SHAPES, sizeOf, type LayerDef, type ShapeId, type Stroke } from "../../../../src/engine/stroke";
import { outline } from "../../../../src/data/wall-art";
import { markBox, overlaps, PAPER, WALL } from "../../../../src/data/wall";

// what the engine reaches for in a browser
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D, document: { createElement: () => createCanvas(1, 1) } });

export interface Job {
  id: string;
  rec: string;
  paper: PaperId;
  shape: ShapeId;
  layers: LayerDef[];
}

/** per class, the highest probability any frame got from either model */
export interface Scores {
  porn: number;
  hentai: number;
  sexy: number;
  /** porn and hentai together, on the frame where they were highest */
  explicit: number;
  /** which frame that was: "stroke 40 of 120", "layer Sky", "final" */
  frame: string;
  frames: number;
}

export type Result = { id: string; picture: Uint8Array; scores: Scores } | { id: string; error: string };

/** The wall: kept drawn here between jobs, so each new batch of marks only adds to it. */
export interface WallJob {
  kind: "wall";
  id: string;
  no: number;
  /** the subject: on a reset the worker draws its outline first */
  theme: string;
  /** start again from the outline (every live mark then comes in `strokes`) */
  reset: boolean;
  strokes: Stroke[];
  /** run the image check on the parts of the wall these strokes touched */
  check: boolean;
  /** check the whole wall, not only what changed */
  checkAll?: boolean;
  /** where to write the picture and its thumbnail; nothing is written without them */
  out?: string;
  thumb?: string;
}
/** a part of the wall the check looked at, in wall units, with its scores */
export interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
  explicit: number;
  sexy: number;
  /** the same part of the bare outline's scores: what the subject scores by itself */
  base: { explicit: number; sexy: number };
}
export type WallResult = { id: string; tiles: Tile[] } | { id: string; error: string };

/** frames taken along the replay, the last one included */
const ALONG = 16;

let models: Promise<[nsfwjs.NSFWJS, number][]> | null = null;
const loadModels = () =>
  (models ??= (async () => {
    await tf.setBackend("wasm");
    await tf.ready();
    return [
      [await nsfwjs.load("MobileNetV2"), 224],
      [await nsfwjs.load("InceptionV3"), 299],
    ];
  })());

async function classify(frame: Canvas) {
  const out = { porn: 0, hentai: 0, sexy: 0 };
  for (const [model, size] of await loadModels()) {
    const c = createCanvas(size, size);
    c.getContext("2d").drawImage(frame, 0, 0, size, size);
    const px = c.getContext("2d").getImageData(0, 0, size, size).data;
    const rgb = new Int32Array(size * size * 3);
    for (let i = 0, j = 0; i < px.length; i += 4) {
      rgb[j++] = px[i];
      rgb[j++] = px[i + 1];
      rgb[j++] = px[i + 2];
    }
    const x = tf.tensor3d(rgb, [size, size, 3], "int32");
    const got = await model.classify(x, 5);
    x.dispose();
    for (const g of got) {
      const k = g.className.toLowerCase() as keyof typeof out;
      if (k in out) out[k] = Math.max(out[k], g.probability);
    }
  }
  return out;
}

async function screen(job: Job): Promise<Result> {
  const strokes = decode(new Uint8Array(await readFile(job.rec)));
  const sheet = sizeOf({ shape: job.shape });
  const k = 0.5;
  const W = sheet.w * k, H = sheet.h * k;
  const layers = job.layers.length ? job.layers.map((l) => ({ ...l })) : [{ ...BASE_LAYER }];
  const painter = new Painter(W, H, k, layers, job.paper);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const scores: Scores = { porn: 0, hentai: 0, sexy: 0, explicit: 0, frame: "", frames: 0 };
  // pixel art is blocky, and the models were trained on photos and drawings: each frame of a
  // pixel piece is also checked softened, cells blended into each other the way a photo is
  const grid = SHAPES[job.shape]?.grid;
  const small = grid ? createCanvas(grid, Math.round((grid * H) / W)) : null;
  const soft = grid ? createCanvas(W, H) : null;
  const look = async (frame: string) => {
    painter.render(ctx as unknown as CanvasRenderingContext2D);
    await score(canvas, frame);
    if (small && soft) {
      const sc = small.getContext("2d"), fc = soft.getContext("2d");
      sc.imageSmoothingEnabled = fc.imageSmoothingEnabled = true;
      sc.imageSmoothingQuality = fc.imageSmoothingQuality = "high";
      sc.clearRect(0, 0, small.width, small.height);
      sc.drawImage(canvas, 0, 0, small.width, small.height);
      fc.clearRect(0, 0, W, H);
      fc.drawImage(small, 0, 0, W, H);
      await score(soft, `${frame}, softened`);
    }
  };
  const score = async (img: Canvas, frame: string) => {
    const s = await classify(img);
    scores.frames++;
    scores.porn = Math.max(scores.porn, s.porn);
    scores.hentai = Math.max(scores.hentai, s.hentai);
    scores.sexy = Math.max(scores.sexy, s.sexy);
    if (s.porn + s.hentai >= scores.explicit || !scores.frame) {
      scores.explicit = s.porn + s.hentai;
      scores.frame = frame;
    }
  };

  // along the replay; layers keep their final visibility, as a replay shows them
  const marks = new Set(Array.from({ length: Math.min(ALONG, strokes.length) }, (_, j) => Math.ceil(((j + 1) * strokes.length) / Math.min(ALONG, strokes.length))));
  for (const [i, s] of strokes.entries()) {
    painter.apply(s);
    if (marks.has(i + 1) && i + 1 < strokes.length) await look(`stroke ${i + 1} of ${strokes.length}`);
  }
  await look("final");
  ctx.clearRect(0, 0, W, H);
  painter.render(ctx as unknown as CanvasRenderingContext2D);
  const picture = await canvas.encode("webp", 82);

  // each layer alone, shown and at full strength, whatever the artist set
  const shown = layers.filter((l) => !l.gone);
  if (shown.length > 1 || shown.some((l) => l.hidden || l.opacity < 1)) {
    const saved = layers.map((l) => ({ hidden: l.hidden, opacity: l.opacity }));
    for (const l of shown) {
      for (const o of layers) o.hidden = o !== l;
      l.opacity = 1;
      await look(`layer ${l.name || l.id}`);
    }
    layers.forEach((l, i) => Object.assign(l, saved[i]));
  }
  return { id: job.id, picture: new Uint8Array(picture), scores };
}

// small squares overlapping by half catch a small drawing; large ones catch a big one
const TILES = [
  ...Array.from({ length: 7 * 3 }, (_, i) => ({ x: (i % 7) * 250, y: Math.floor(i / 7) * 250, w: 500, h: 500 })),
  ...[0, 500, 1000].map((x) => ({ x, y: 0, w: 1000, h: 1000 })),
];
const walls = new Map<number, { canvas: Canvas; ctx: SKRSContext2D; dirty: Set<number> }>();
const bases = new Map<string, Promise<{ explicit: number; sexy: number }[]>>();

function sheet(theme: string) {
  const canvas = createCanvas(WALL.w, WALL.h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, WALL.w, WALL.h);
  for (const s of outline(theme)) drawStroke(ctx as unknown as CanvasRenderingContext2D, s);
  return { canvas, ctx };
}

/** Checks the given parts of a wall's picture. */
async function check(canvas: Canvas, which: Iterable<number>) {
  const crop = createCanvas(500, 500);
  const out = new Map<number, { explicit: number; sexy: number }>();
  for (const i of which) {
    const t = TILES[i];
    if (crop.width !== t.w) crop.width = crop.height = t.w;
    crop.getContext("2d").drawImage(canvas, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
    const s = await classify(crop);
    out.set(i, { explicit: s.porn + s.hentai, sexy: s.sexy });
  }
  return out;
}

/** What each part of a subject's bare outline scores, worked out once per subject. */
function base(theme: string) {
  let b = bases.get(theme);
  if (!b) {
    b = check(sheet(theme).canvas, TILES.keys()).then((m) => TILES.map((_, i) => m.get(i)!));
    bases.set(theme, b);
  }
  return b;
}

function touched(s: Stroke) {
  const b = markBox(s);
  return TILES.flatMap((t, i) => (overlaps(b, t.x, t.y, t.w, t.h) ? [i] : []));
}

async function wall(job: WallJob): Promise<WallResult> {
  let w = walls.get(job.no);
  if (job.reset || !w) {
    if (!job.reset) return { id: job.id, error: "no-canvas" };
    // only the wall that is being drawn stays in memory
    walls.clear();
    w = { ...sheet(job.theme), dirty: new Set() };
    walls.set(job.no, w);
  }
  for (const s of job.strokes) {
    drawStroke(w.ctx as unknown as CanvasRenderingContext2D, s);
    if (job.check) for (const t of touched(s)) w.dirty.add(t);
  }
  if (job.checkAll) TILES.forEach((_, i) => w.dirty.add(i));
  const tiles: Tile[] = [];
  if (job.check || job.checkAll) {
    const b = await base(job.theme);
    for (const [i, sc] of await check(w.canvas, w.dirty)) tiles.push({ ...TILES[i], ...sc, base: b[i] });
    w.dirty.clear();
  }
  if (job.out) {
    await writeFile(`${job.out}.part`, await w.canvas.encode("webp", 80));
    await rename(`${job.out}.part`, job.out);
  }
  if (job.thumb) {
    const t = createCanvas(600, 300);
    t.getContext("2d").drawImage(w.canvas, 0, 0, 600, 300);
    await writeFile(`${job.thumb}.part`, await t.encode("webp", 78));
    await rename(`${job.thumb}.part`, job.thumb);
  }
  return { id: job.id, tiles };
}

parentPort!.on("message", (job: Job | WallJob) => {
  if ("kind" in job && job.kind === "wall") {
    wall(job).then(
      (r) => parentPort!.postMessage(r),
      (e: unknown) => parentPort!.postMessage({ id: job.id, error: e instanceof Error ? e.message : String(e) }),
    );
    return;
  }
  screen(job as Job).then(
    (r) => parentPort!.postMessage(r),
    (e: unknown) => parentPort!.postMessage({ id: job.id, error: e instanceof Error ? e.message : String(e) }),
  );
});
