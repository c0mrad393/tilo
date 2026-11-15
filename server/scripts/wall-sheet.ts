/* The wall subjects' outlines on one contact sheet, to look them over before they go up:
   npm run wall:sheet [-- id ...] writes marketing/out/wall-sheet.png with every subject, or
   only those asked for (each also full size, marketing/out/wall-{id}.png). The outlines are
   drawn exactly as the server's worker draws them. */
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { mkdir, writeFile } from "node:fs/promises";
import { drawStroke } from "../../src/engine/stroke";
import { PAPER, WALL, WALL_THEMES } from "../../src/data/wall";
import { outline } from "../../src/data/wall-art";

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D, document: { createElement: () => createCanvas(1, 1) } });

const draw = (id: string) => {
  const c = createCanvas(WALL.w, WALL.h), x = c.getContext("2d");
  x.fillStyle = PAPER;
  x.fillRect(0, 0, WALL.w, WALL.h);
  const t = Date.now();
  const strokes = outline(id);
  for (const s of strokes) drawStroke(x as unknown as CanvasRenderingContext2D, s);
  return { c, n: strokes.length, ms: Date.now() - t };
};

await mkdir("marketing/out", { recursive: true });
const ask = process.argv.slice(2);
const ids = ask.length ? ask : WALL_THEMES.map((t) => t.id);
const cols = ask.length ? 3 : 5, w = ask.length ? 660 : 400, h = w / 2, pad = 30;
const sheet = createCanvas(cols * w, Math.ceil(ids.length / cols) * (h + pad)), sx = sheet.getContext("2d");
sx.fillStyle = "#fff";
sx.fillRect(0, 0, sheet.width, sheet.height);
for (const [i, id] of ids.entries()) {
  const { c, n, ms } = draw(id);
  if (ask.length) await writeFile(`marketing/out/wall-${id}.png`, c.toBuffer("image/png"));
  const x = (i % cols) * w, y = Math.floor(i / cols) * (h + pad);
  sx.drawImage(c, x + 4, y + 4, w - 8, h - 8);
  sx.fillStyle = "#222";
  sx.font = "16px sans-serif";
  const no = WALL_THEMES.findIndex((t) => t.id === id) + 1;
  sx.fillText(`${no}. ${id}, ${n} strokes, ${ms} ms`, x + 8, y + h + 18);
}
await writeFile("marketing/out/wall-sheet.png", sheet.toBuffer("image/png"));
console.log("marketing/out/wall-sheet.png");
