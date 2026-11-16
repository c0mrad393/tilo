import { isAnimated, playOrder, type Anim } from "./frames";
import { encodeGif } from "./gif";
import { Painter } from "./painter";
import type { PaperId } from "./paper";
import { gridOf } from "./pixel";
import { Replayer } from "./replay";
import { BASE_LAYER, drawnCount, fmtMin, SHEET, type LayerDef, type SheetSize, type Stroke } from "./stroke";

/* Files out of the studio: the finished picture as a PNG, an animation's loop as a GIF, and
   the recording as a timelapse video, all made in the browser. Nothing leaves the device. */

export const fileName = (title: string, ext: string) =>
  `${(title.trim() || "tilo-sheet").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tilo-sheet"}.${ext}`;

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const toBlob = (c: HTMLCanvasElement, type = "image/png", q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("The browser could not make the image"))), type, q));

/** The finished picture at `scale` times the sheet's size, on its paper or transparent; for
    an animation, the given frame. */
export function picture(strokes: Stroke[], layers: LayerDef[], paper: PaperId | null, scale = 1, sheet: SheetSize = SHEET, frame?: number) {
  const W = sheet.w * scale, H = sheet.h * scale;
  const p = new Painter(W, H, scale, layers.length ? layers : [BASE_LAYER], paper);
  p.frame = frame;
  strokes.forEach((s) => p.apply(s));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  p.render(c.getContext("2d")!);
  return c;
}

export const pictureBlob = (strokes: Stroke[], layers: LayerDef[], paper: PaperId | null, scale = 1, sheet: SheetSize = SHEET, frame?: number) =>
  toBlob(picture(strokes, layers, paper, scale, sheet, frame));

/** The sizes an animation's GIF comes in: one pixel a cell, and the biggest whole multiple of
    that up to 1024 across, so every cell stays square and sharp. */
export function gifSizes(grid: number, sheet: SheetSize) {
  const g = gridOf(grid, sheet);
  const big = Math.max(1, Math.floor(1024 / Math.max(g.cols, g.rows)));
  return big > 1 ? [1, big] : [1];
}

/** An animation's loop as a GIF, `cell` pixels a cell, on its paper (or see-through with no
    paper). Made by Tilo's own writer, here in the browser. */
export function loopGif(strokes: Stroke[], layers: LayerDef[], paper: PaperId | null, anim: Anim, grid: number, sheet: SheetSize, cell = 1) {
  const g = gridOf(grid, sheet);
  const p = new Painter(g.cols, g.rows, g.cols / sheet.w, layers.length ? layers : [BASE_LAYER], paper);
  strokes.forEach((s) => p.apply(s));
  const small = document.createElement("canvas");
  small.width = g.cols;
  small.height = g.rows;
  const sx = small.getContext("2d")!;
  const W = g.cols * cell, H = g.rows * cell;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ox = out.getContext("2d", { willReadFrequently: true })!;
  ox.imageSmoothingEnabled = false;
  const frames = playOrder(anim).map((f) => {
    p.frame = f.id;
    sx.clearRect(0, 0, g.cols, g.rows);
    p.render(sx);
    ox.clearRect(0, 0, W, H);
    ox.drawImage(small, 0, 0, W, H);
    return { rgba: ox.getImageData(0, 0, W, H).data, ms: f.ms };
  });
  return new Blob([encodeGif(W, H, frames) as BlobPart], { type: "image/gif" });
}

/** A small picture for the library page. */
export function thumbnail(painter: Painter, w = 400, frame = painter.frame) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = Math.round((w * painter.height) / painter.width);
  const ctx = c.getContext("2d")!;
  ctx.scale(w / painter.width, w / painter.width);
  // a pixel sheet's painter is one pixel a cell: scaled up, the cells stay sharp
  ctx.imageSmoothingEnabled = painter.width >= w;
  painter.render(ctx, undefined, "full", frame);
  return toBlob(c, "image/webp", 0.82);
}

const VIDEO_TYPES = [
  ["video/mp4;codecs=avc1.42E01E", "mp4"],
  ["video/mp4", "mp4"],
  ["video/webm;codecs=vp9", "webm"],
  ["video/webm", "webm"],
] as const;
export const videoType = () =>
  typeof MediaRecorder === "undefined" ? undefined : VIDEO_TYPES.find(([t]) => MediaRecorder.isTypeSupported(t));

/** Plays the recording onto a canvas and records it. Runs in real time, so the tab has to stay
    open; `onProgress` gets 0-1. The last frame holds for a moment with a small caption; an
    animation plays its loop there for about four seconds. */
export function timelapse(
  strokes: Stroke[],
  layers: LayerDef[],
  paper: PaperId,
  minutes: number,
  { onProgress, signal, sheet = SHEET, anim, grid }: { onProgress?: (p: number) => void; signal?: AbortSignal; sheet?: SheetSize; anim?: Anim; grid?: number } = {},
): Promise<{ blob: Blob; ext: string }> {
  const type = videoType();
  if (!type) return Promise.reject(new Error("This browser can't record video"));
  const c = document.createElement("canvas");
  // the long side at 1280, both sides even, as video encoders want
  const k = 1280 / Math.max(sheet.w, sheet.h);
  c.width = Math.round((sheet.w * k) / 2) * 2;
  c.height = Math.round((sheet.h * k) / 2) * 2;
  const ctx = c.getContext("2d")!;
  const rep = new Replayer(c, strokes, paper, sheet.w, layers, sheet.h, { anim, grid });
  const dur = Math.min(40000, Math.max(8000, 5000 + strokes.length * 60));
  const moving = !!anim && isAnimated({ anim });
  const hold = moving ? Math.max(4000, Math.min(8000, rep.loopMs * 2)) : 1800;
  const stream = c.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: type[0], videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const caption = `Drawn by hand on Tilo · ${drawnCount(strokes).toLocaleString("en")} strokes · ${fmtMin(minutes)}`;

  return new Promise((res, rej) => {
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      if (signal?.aborted) return;
      const t = now - t0;
      if (moving && t > dur) rep.loop(t - dur);
      else rep.draw(Math.min(1, t / dur));
      if (t > dur) {
        ctx.save();
        ctx.font = "600 22px 'Archivo Variable', system-ui, sans-serif";
        const w = ctx.measureText(caption).width;
        ctx.fillStyle = "rgba(29,27,25,0.86)";
        ctx.fillRect(c.width - w - 52, c.height - 62, w + 32, 40);
        ctx.fillStyle = "#FBFAF5";
        ctx.fillText(caption, c.width - w - 36, c.height - 35);
        ctx.restore();
      }
      onProgress?.(Math.min(1, t / (dur + hold)));
      if (t < dur + hold) raf = requestAnimationFrame(frame);
      else rec.stop();
    };
    rec.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      if (signal?.aborted) return rej(new DOMException("Stopped", "AbortError"));
      res({ blob: new Blob(chunks, { type: type[0].split(";")[0] }), ext: type[1] });
    };
    rec.onerror = () => rej(new Error("Recording the video failed"));
    signal?.addEventListener("abort", () => {
      cancelAnimationFrame(raf);
      if (rec.state !== "inactive") rec.stop();
    });
    rep.draw(0);
    rec.start(500);
    raf = requestAnimationFrame(frame);
  });
}
