/* What the social videos share: the frame, the site's type and inks, plates that replay a
   piece with the studio's own engine, a phone holding a screenshot, the logo writing itself,
   and the encoder. Import it before anything that draws: it sets up the canvas globals the
   engine expects and registers the fonts. Run from the repository root. */

import { createCanvas, GlobalFonts, type Canvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { letters } from "../src/components/Logo";
import { Replayer } from "../src/engine/replay";
import { Sketch } from "../src/engine/sketch";
import { layersOf, sizeOf, type Piece } from "../src/engine/stroke";

Object.assign(globalThis, { document: { createElement: () => createCanvas(1, 1) } });
const { DOMMatrix, ImageData, Path2D } = await import("@napi-rs/canvas");
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });

export const W = 1080, H = 1920, FPS = 30;
// run from the repository root (the scripts themselves run from bundles in server/api/dist)
export const HERE = join(process.cwd(), "marketing");
const FONTS = join(process.cwd(), "node_modules", "@fontsource-variable");
GlobalFonts.registerFromPath(join(FONTS, "archivo/files/archivo-latin-wdth-normal.woff2"), "Archivo");
GlobalFonts.registerFromPath(join(FONTS, "newsreader/files/newsreader-latin-opsz-normal.woff2"), "Newsreader");
GlobalFonts.registerFromPath(join(FONTS, "newsreader/files/newsreader-latin-opsz-italic.woff2"), "Newsreader Italic");

// the site's inks
export const GROUND = "#EEE8DA", INK = "#1D1B19", SOFT = "#5E574C", BLUE = "#2D4BB3", PINK = "#EE3A8C", YELLOW = "#FFD23F", PAPER = "#FBFAF5";

/* ---------- easing and timing ---------- */
export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const out3 = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
export const inOut = (x: number) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
/** 0 before a, 1 after b, eased between */
export const span = (t: number, a: number, b: number, ease = out3) => ease(clamp((t - a) / (b - a)));
/** fades in after a and out before b, each over d seconds, so one scene is gone before the next comes */
export const life = (t: number, a: number, b: number, d = 0.3) => Math.min(span(t, a, a + d), 1 - span(t, b - d, b, inOut));

/* ---------- the ground: the site's paper colour with a little grain ---------- */
const grain = createCanvas(256, 256);
{
  const g = grain.getContext("2d"), img = g.createImageData(256, 256);
  let s = 7;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = (s >> 16) & 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v > 128 ? 255 : 0;
    img.data[i + 3] = 7 + (v % 6);
  }
  g.putImageData(img, 0, 0);
}
export function ground(x: SKRSContext2D) {
  x.fillStyle = GROUND;
  x.fillRect(0, 0, W, H);
  x.fillStyle = x.createPattern(grain as unknown as Image, "repeat")!;
  x.fillRect(0, 0, W, H);
}

/* ---------- type ---------- */
/** the site's poster headline: Archivo, heavy, condensed, upper case */
export function headline(x: SKRSContext2D, text: string, px: number, y: number, size: number, color: string, align: CanvasTextAlign = "left", maxW = 900) {
  // a long line shrinks to fit the frame instead of running off it
  size = Math.min(size, (size * maxW) / measureHead(x, text, size));
  x.save();
  x.font = `800 ${size}px Archivo`;
  // the font file carries the width axis; narrow it like the site's font-stretch: 72%
  (x as unknown as { fontVariationSettings: string }).fontVariationSettings = "'wdth' 68, 'wght' 800";
  x.fillStyle = color;
  x.textAlign = align;
  x.textBaseline = "alphabetic";
  x.fillText(text, px, y);
  const w = x.measureText(text).width;
  x.restore();
  return w;
}
export function measureHead(x: SKRSContext2D, text: string, size: number) {
  x.save();
  x.font = `800 ${size}px Archivo`;
  (x as unknown as { fontVariationSettings: string }).fontVariationSettings = "'wdth' 68, 'wght' 800";
  const w = x.measureText(text).width;
  x.restore();
  return w;
}
export function kicker(x: SKRSContext2D, text: string, px: number, y: number, color = SOFT, align: CanvasTextAlign = "left", size = 30) {
  x.save();
  x.font = `700 ${size}px Archivo`;
  (x as unknown as { letterSpacing: string }).letterSpacing = `${size * 0.12}px`;
  x.fillStyle = color;
  x.textAlign = align;
  x.fillText(text.toUpperCase(), px, y);
  x.restore();
}
/** serif lines, wrapped to `maxW` */
export function serif(x: SKRSContext2D, text: string, px: number, y: number, size: number, maxW: number, color = INK, italic = false, align: CanvasTextAlign = "left") {
  x.save();
  x.font = `400 ${size}px ${italic ? "'Newsreader Italic'" : "Newsreader"}`;
  x.fillStyle = color;
  x.textAlign = align;
  const words = text.split(" ");
  let line = "", yy = y;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (x.measureText(t).width > maxW && line) {
      x.fillText(line, px, yy);
      line = w;
      yy += size * 1.28;
    } else line = t;
  }
  x.fillText(line, px, yy);
  x.restore();
  return yy;
}
/** the black "AI-MADE" tag the site puts on every AI piece */
export function aiTag(x: SKRSContext2D, right: number, top: number, size = 24) {
  x.save();
  x.font = `700 ${size}px Archivo`;
  (x as unknown as { letterSpacing: string }).letterSpacing = `${size * 0.1}px`;
  const w = x.measureText("AI-MADE").width + size * 1.1;
  x.fillStyle = INK;
  x.fillRect(right - w, top, w, size * 1.6);
  x.fillStyle = GROUND;
  x.fillText("AI-MADE", right - w + size * 0.55, top + size * 1.16);
  x.restore();
}

/* ---------- plates: a piece on its sheet, with the site's crop marks ---------- */
export interface Plate { canvas: Canvas; rep: Replayer; piece: Piece; w: number; h: number }
export function plate(p: Piece, w: number): Plate {
  const sheet = sizeOf(p);
  const h = Math.round((w * sheet.h) / sheet.w);
  const canvas = createCanvas(w, h);
  const rep = new Replayer(canvas as unknown as HTMLCanvasElement, p.strokes, p.paper ?? "smooth", sheet.w, layersOf(p).map((l) => ({ ...l })), sheet.h);
  return { canvas, rep, piece: p, w, h };
}
export function drawPlate(x: SKRSContext2D, pl: Plate, px: number, py: number, scale = 1, marks = true, tag = true) {
  const w = pl.w * scale, h = pl.h * scale;
  x.save();
  x.shadowColor = "rgba(29,27,25,0.28)";
  x.shadowBlur = 40 * scale;
  x.shadowOffsetY = 18 * scale;
  x.fillStyle = PAPER;
  x.fillRect(px, py, w, h);
  x.restore();
  x.drawImage(pl.canvas, px, py, w, h);
  if (marks) {
    x.save();
    x.strokeStyle = "rgba(29,27,25,0.55)";
    x.lineWidth = 2;
    const o = 18 * scale, l = 28 * scale;
    for (const [cx, cy, sx, sy] of [[px, py, -1, -1], [px + w, py, 1, -1], [px, py + h, -1, 1], [px + w, py + h, 1, 1]] as const) {
      x.beginPath();
      x.moveTo(cx + sx * o, cy);
      x.lineTo(cx + sx * (o + l), cy);
      x.moveTo(cx, cy + sy * o);
      x.lineTo(cx, cy + sy * (o + l));
      x.stroke();
    }
    x.restore();
  }
  if (tag) aiTag(x, px + w - 16 * scale, py + 16 * scale, 24 * scale);
}
/** the trace under a plate: how far the replay has got, with the site's pink cursor */
export function trace(x: SKRSContext2D, px: number, py: number, w: number, pos: number) {
  x.fillStyle = "rgba(29,27,25,0.10)";
  x.fillRect(px, py, w, 10);
  x.fillStyle = INK;
  x.fillRect(px, py, w * pos, 10);
  x.fillStyle = PINK;
  x.fillRect(px + w * pos - 3, py - 8, 6, 26);
}

/* ---------- a phone, holding a screenshot of the site ---------- */
export function phone(x: SKRSContext2D, img: Image, cx: number, cy: number, w: number, rot = 0, scrollY = 0) {
  const h = w * (2532 / 1170), r = w * 0.12, b = w * 0.035;
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.shadowColor = "rgba(29,27,25,0.35)";
  x.shadowBlur = 60;
  x.shadowOffsetY = 30;
  x.fillStyle = "#141312";
  x.beginPath();
  x.roundRect(-w / 2 - b, -h / 2 - b, w + b * 2, h + b * 2, r + b);
  x.fill();
  x.shadowColor = "transparent";
  x.save();
  x.beginPath();
  x.roundRect(-w / 2, -h / 2, w, h, r);
  x.clip();
  x.drawImage(img, 0, scrollY, 1170, 2532 - scrollY, -w / 2, -h / 2, w, h * ((2532 - scrollY) / 2532));
  x.restore();
  // the island
  x.fillStyle = "#141312";
  x.beginPath();
  x.roundRect(-w * 0.15, -h / 2 + w * 0.035, w * 0.3, w * 0.085, w * 0.045);
  x.fill();
  x.restore();
}

/* ---------- the logo writes itself ---------- */
export const logoCanvas = createCanvas(560, 280);
export const logoRep = new Replayer(logoCanvas as unknown as HTMLCanvasElement, letters(INK), null, 400);
export const logoPink = createCanvas(560, 280);
new Replayer(logoPink as unknown as HTMLCanvasElement, letters(PINK), null, 400).draw(1);

/* the highlighter pass behind HANDS, as the home page draws it */
export function highlighter(x: SKRSContext2D, x0: number, x1: number, y: number, size: number, pos: number) {
  const S = new Sketch(5);
  const w = size * 1.02;
  S.poly([[x0, y + w * 0.1], [x0 + (x1 - x0) * 0.5, y - w * 0.06], [x1, y + w * 0.04]], "ink", YELLOW, w, 0.8, 18);
  const c = createCanvas(W, Math.ceil(size * 2));
  const rep = new Replayer(c as unknown as HTMLCanvasElement, S.strokes.map((s) => ({ ...s, p: s.p.map((v, i) => (i % 3 === 1 ? v - (y - size) : v)) })), null, W);
  rep.draw(pos);
  x.drawImage(c, 0, y - size);
}

/* ---------- the profile picture and the Reel cover ---------- */
export function logoAt(x: SKRSContext2D, color: string, cx: number, cy: number, w: number) {
  const c = createCanvas(Math.round(w), Math.round(w / 2));
  new Replayer(c as unknown as HTMLCanvasElement, letters(color), null, 400).draw(1);
  x.drawImage(c, cx - w / 2, cy - w / 4);
}

/** a headline broken into lines that fit, at most `max` lines */
export function headLines(x: SKRSContext2D, text: string, size: number, maxW: number) {
  const lines: string[] = [];
  for (const w of text.toUpperCase().split(" ")) {
    const t = lines.length ? `${lines[lines.length - 1]} ${w}` : w;
    if (lines.length && measureHead(x, t, size) <= maxW) lines[lines.length - 1] = t;
    else lines.push(w);
  }
  return lines;
}

/* ---------- out ---------- */
export async function encode(file: string, frameCount: number, draw: (x: SKRSContext2D, t: number) => void) {
  const c = createCanvas(W, H), x = c.getContext("2d");
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", file], { stdio: ["pipe", "inherit", "inherit"] });
  for (let i = 0; i < frameCount; i++) {
    draw(x, i / FPS);
    const data = x.getImageData(0, 0, W, H).data;
    if (!ff.stdin.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength))) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
}
/** the silent video with `seconds` of the track from `from`, faded in and out, at the loudness
    Instagram and TikTok play at */
export async function withMusic(music: string, silent: string, file: string, from: number, seconds: number, keepDynamics = false) {
  const fades = `afade=t=in:d=0.6,afade=t=out:st=${seconds - 2.5}:d=2.5`;
  let norm = "loudnorm=I=-16:TP=-1.5:LRA=11";
  // keepDynamics: measure the clip first, then one gain for all of it (loudnorm's linear mode),
  // so a quieter opening stays quieter than the part where the music lifts. Nothing squeezes
  // the sound; if the peaks don't allow one gain, loudnorm falls back to its usual way.
  if (keepDynamics) {
    const probe = spawn("ffmpeg", ["-hide_banner", "-ss", String(from), "-t", String(seconds), "-i", music, "-af", `${fades},loudnorm=I=-16:TP=-1.5:LRA=20:print_format=json`, "-f", "null", "-"]);
    let log = "";
    probe.stderr.on("data", (d) => (log += d));
    await new Promise((r) => probe.on("close", r));
    const m = JSON.parse(log.slice(log.lastIndexOf("{"), log.lastIndexOf("}") + 1));
    norm = `loudnorm=I=-16:TP=-1.5:LRA=20:linear=true:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}`;
  }
  const mux = spawn("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-ss", String(from), "-t", String(seconds), "-i", music, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
    "-af", `${fades},${norm}`, "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", file], { stdio: "inherit" });
  await new Promise((r) => mux.on("close", r));
}

