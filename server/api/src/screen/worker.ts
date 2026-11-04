/* The image check, in a worker thread so the API keeps answering while it runs. It draws the
   recording with the studio's own engine (on skia instead of a browser canvas), takes frames
   along the way and of each layer alone, and runs every frame through two open NSFW models
   (nsfwjs: MobileNetV2 and InceptionV3, on TensorFlow.js's wasm backend). Frames along the
   way catch a piece that showed something and painted over it, since its replay shows that
   too; layers alone catch what sits on a hidden layer, which a remix would bring back.
   The final frame becomes the piece's picture, so the picture is always the recording's.
   Built with esbuild into dist/screen.mjs, because the engine isn't plain Node TypeScript. */

import { createCanvas, DOMMatrix, ImageData, Path2D, type Canvas } from "@napi-rs/canvas";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-wasm";
import * as nsfwjs from "nsfwjs";
import { readFile } from "node:fs/promises";
import { parentPort } from "node:worker_threads";
import { decode } from "../../../../src/engine/codec";
import type { PaperId } from "../../../../src/engine/paper";
import { Painter } from "../../../../src/engine/painter";
import { BASE_LAYER, sizeOf, type LayerDef, type ShapeId } from "../../../../src/engine/stroke";

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
  const look = async (frame: string) => {
    painter.render(ctx as unknown as CanvasRenderingContext2D);
    const s = await classify(canvas);
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

parentPort!.on("message", (job: Job) => {
  screen(job).then(
    (r) => parentPort!.postMessage(r),
    (e: unknown) => parentPort!.postMessage({ id: job.id, error: e instanceof Error ? e.message : String(e) }),
  );
});
