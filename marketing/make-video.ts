/* Tilo's first social video: 9:16, 1080 x 1920, 30 fps, about 33 seconds, set to "Inspired" by
   Kevin MacLeod (incompetech.com, CC BY 4.0: the post has to credit it). The track isn't in the
   repository: put Inspired.mp3 in marketing/music/ (from incompetech.com). Without it, or for
   music added in the app you post from, there is the silent copy. The timelapses are the sample
   pieces replayed by the studio's own engine, stroke by stroke, so they are what the site shows.
   The phone screens are marketing/shots/*.png (node marketing/shoot.mjs).
   Usage, from the repository root: npm run video [-- frames DIR]
     writes marketing/out/tilo-intro.mp4; with `frames DIR` it writes a few PNG stills to check. */

import { createCanvas, GlobalFonts, loadImage, type Canvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { letters } from "../src/components/Logo";
import { SAMPLES } from "../src/data/samples";
import { Replayer } from "../src/engine/replay";
import { Sketch } from "../src/engine/sketch";
import { drawnCount, layersOf, sizeOf, type Piece } from "../src/engine/stroke";

Object.assign(globalThis, { document: { createElement: () => createCanvas(1, 1) } });
const { DOMMatrix, ImageData, Path2D } = await import("@napi-rs/canvas");
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });

const W = 1080, H = 1920, FPS = 30;
const MUSIC = join(process.cwd(), "marketing", "music", "Inspired.mp3"), MUSIC_LIFT = 80.1;
// run from the repository root (the script itself runs from a bundle in server/api/dist)
const HERE = join(process.cwd(), "marketing");
const FONTS = join(process.cwd(), "node_modules", "@fontsource-variable");
GlobalFonts.registerFromPath(join(FONTS, "archivo/files/archivo-latin-wdth-normal.woff2"), "Archivo");
GlobalFonts.registerFromPath(join(FONTS, "newsreader/files/newsreader-latin-opsz-normal.woff2"), "Newsreader");
GlobalFonts.registerFromPath(join(FONTS, "newsreader/files/newsreader-latin-opsz-italic.woff2"), "Newsreader Italic");

// the site's inks
const GROUND = "#EEE8DA", INK = "#1D1B19", SOFT = "#5E574C", BLUE = "#2D4BB3", PINK = "#EE3A8C", YELLOW = "#FFD23F", PAPER = "#FBFAF5";

const piece = (id: string) => SAMPLES.find((p) => p.id === id)!;
const SHOTS = join(HERE, "shots");
const shot = async (n: string) => loadImage(join(SHOTS, `${n}.png`));
const phones = { studio: await shot("studio"), ai: await shot("piece-ai"), home: await shot("home") };

/* ---------- easing and timing ---------- */
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const out3 = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const inOut = (x: number) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
/** 0 before a, 1 after b, eased between */
const span = (t: number, a: number, b: number, ease = out3) => ease(clamp((t - a) / (b - a)));
/** fades in after a and out before b, each over d seconds, so one scene is gone before the next comes */
const life = (t: number, a: number, b: number, d = 0.3) => Math.min(span(t, a, a + d), 1 - span(t, b - d, b, inOut));

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
function ground(x: SKRSContext2D) {
  x.fillStyle = GROUND;
  x.fillRect(0, 0, W, H);
  x.fillStyle = x.createPattern(grain as unknown as Image, "repeat")!;
  x.fillRect(0, 0, W, H);
}

/* ---------- type ---------- */
/** the site's poster headline: Archivo, heavy, condensed, upper case */
function headline(x: SKRSContext2D, text: string, px: number, y: number, size: number, color: string, align: CanvasTextAlign = "left", maxW = 900) {
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
function measureHead(x: SKRSContext2D, text: string, size: number) {
  x.save();
  x.font = `800 ${size}px Archivo`;
  (x as unknown as { fontVariationSettings: string }).fontVariationSettings = "'wdth' 68, 'wght' 800";
  const w = x.measureText(text).width;
  x.restore();
  return w;
}
function kicker(x: SKRSContext2D, text: string, px: number, y: number, color = SOFT, align: CanvasTextAlign = "left", size = 30) {
  x.save();
  x.font = `700 ${size}px Archivo`;
  (x as unknown as { letterSpacing: string }).letterSpacing = `${size * 0.12}px`;
  x.fillStyle = color;
  x.textAlign = align;
  x.fillText(text.toUpperCase(), px, y);
  x.restore();
}
/** serif lines, wrapped to `maxW` */
function serif(x: SKRSContext2D, text: string, px: number, y: number, size: number, maxW: number, color = INK, italic = false, align: CanvasTextAlign = "left") {
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
function aiTag(x: SKRSContext2D, right: number, top: number, size = 24) {
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
interface Plate { canvas: Canvas; rep: Replayer; piece: Piece; w: number; h: number }
function plate(p: Piece, w: number): Plate {
  const sheet = sizeOf(p);
  const h = Math.round((w * sheet.h) / sheet.w);
  const canvas = createCanvas(w, h);
  const rep = new Replayer(canvas as unknown as HTMLCanvasElement, p.strokes, p.paper ?? "smooth", sheet.w, layersOf(p).map((l) => ({ ...l })), sheet.h);
  return { canvas, rep, piece: p, w, h };
}
function drawPlate(x: SKRSContext2D, pl: Plate, px: number, py: number, scale = 1, marks = true, tag = true) {
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
function trace(x: SKRSContext2D, px: number, py: number, w: number, pos: number) {
  x.fillStyle = "rgba(29,27,25,0.10)";
  x.fillRect(px, py, w, 10);
  x.fillStyle = INK;
  x.fillRect(px, py, w * pos, 10);
  x.fillStyle = PINK;
  x.fillRect(px + w * pos - 3, py - 8, 6, 26);
}

/* ---------- a phone, holding a screenshot of the site ---------- */
function phone(x: SKRSContext2D, img: Image, cx: number, cy: number, w: number, rot = 0, scrollY = 0) {
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
const logoCanvas = createCanvas(560, 280);
const logoRep = new Replayer(logoCanvas as unknown as HTMLCanvasElement, letters(INK), null, 400);
const logoPink = createCanvas(560, 280);
new Replayer(logoPink as unknown as HTMLCanvasElement, letters(PINK), null, 400).draw(1);

/* the highlighter pass behind HANDS, as the home page draws it */
function highlighter(x: SKRSContext2D, x0: number, x1: number, y: number, size: number, pos: number) {
  const S = new Sketch(5);
  const w = size * 1.02;
  S.poly([[x0, y + w * 0.1], [x0 + (x1 - x0) * 0.5, y - w * 0.06], [x1, y + w * 0.04]], "ink", YELLOW, w, 0.8, 18);
  const c = createCanvas(W, Math.ceil(size * 2));
  const rep = new Replayer(c as unknown as HTMLCanvasElement, S.strokes.map((s) => ({ ...s, p: s.p.map((v, i) => (i % 3 === 1 ? v - (y - size) : v)) })), null, W);
  rep.draw(pos);
  x.drawImage(c, 0, y - size);
}

/* ---------- the scenes ---------- */
const hero = plate(piece("nightlamp"), 900);
const montage = ["gergeti", "oldtown", "raintram", "blacksea"].map((id) => plate(piece(id), 900));
const thumbs = SAMPLES.map((p) => {
  const pl = plate(p, 420);
  pl.rep.draw(1);
  return pl;
});

const T = { s1: 0, s2: 3.2, s3: 11.2, s4: 16.2, s5: 23.0, s6: 29.0, end: 33.0 };

function frame(x: SKRSContext2D, t: number) {
  ground(x);

  // 1. the promise
  if (t < T.s2) {
    const a = life(t, -1, T.s2);
    x.globalAlpha = a;
    logoRep.draw(span(t, 0.1, 1.2, (p) => 1 - Math.pow(1 - p, 2)));
    x.drawImage(logoCanvas, 80, 210, 360, 180);
    const lx = 80, size = Math.min(220, (220 * 920) / measureHead(x, "NOT PROMPTS.", 220));
    const lines: [string, string, number][] = [["DRAWN BY", BLUE, 720], ["HANDS,", BLUE, 940], ["NOT PROMPTS.", PINK, 1160]];
    lines.forEach(([text, color, y], i) => {
      const k = span(t, 0.5 + i * 0.32, 1.0 + i * 0.32);
      if (k <= 0) return;
      if (i === 1) {
        const hw = measureHead(x, text, size);
        highlighter(x, lx + size * 0.02, lx + hw * 0.96, y - size * 0.34, size * 0.74, span(t, 1.5, 2.2, inOut));
      }
      x.save();
      x.globalAlpha = a * k;
      x.translate(0, (1 - k) * 40);
      headline(x, text, lx, y, size, color);
      x.restore();
    });
    x.globalAlpha = a * span(t, 2.0, 2.5);
    serif(x, "A free studio and gallery for art made stroke by stroke, in the browser.", lx, 1330, 50, 860, SOFT, true);
    x.globalAlpha = 1;
  }

  // 2. every piece is a recording
  if (t >= T.s2 && t < T.s3) {
    const a = life(t, T.s2, T.s3);
    x.globalAlpha = a;
    kicker(x, "Every piece is a recording", 90, 300, PINK);
    headline(x, "WATCH IT", 90, 440, 140, INK);
    headline(x, "BEING MADE.", 90, 580, 140, INK);
    const pos = span(t, T.s2 + 0.4, T.s3 - 0.9, (p) => p);
    const idx = hero.rep.draw(pos);
    drawPlate(x, hero, 90, 690);
    trace(x, 90, 690 + hero.h + 50, hero.w, pos);
    kicker(x, `Stroke ${Math.min(idx + 1, hero.piece.strokes.length)} of ${drawnCount(hero.piece.strokes)}`, 90, 690 + hero.h + 130, INK, "left", 28);
    serif(x, "Press play on any piece and every stroke comes back, in order.", 90, 690 + hero.h + 210, 44, 880, SOFT, true);
    x.globalAlpha = 1;
  }

  // 3. the tools: four pieces, fast
  if (t >= T.s3 && t < T.s4) {
    const a = life(t, T.s3, T.s4);
    x.globalAlpha = a;
    kicker(x, "Pencil · ink · oil · wash · layers", 90, 300, PINK);
    headline(x, "ONE STUDIO,", 90, 440, 140, INK);
    headline(x, "IN A BROWSER TAB.", 90, 580, 140, INK);
    const each = (T.s4 - T.s3) / montage.length;
    const i = clamp(Math.floor((t - T.s3) / each), 0, montage.length - 1);
    const local = clamp((t - T.s3 - i * each) / each);
    const pl = montage[i];
    pl.rep.draw(clamp(local * 1.25));
    drawPlate(x, pl, 90, 690);
    kicker(x, pl.piece.title, 90, 690 + pl.h + 80, INK, "left", 28);
    x.globalAlpha = 1;
  }

  // 4. the twist: an AI drew all of these
  if (t >= T.s4 && t < T.s5) {
    const a = life(t, T.s4, T.s5);
    x.globalAlpha = a;
    kicker(x, "One thing we should tell you", 90, 300, PINK);
    headline(x, "AN AI DREW", 90, 440, 150, INK);
    headline(x, "ALL OF THESE.", 90, 590, 150, INK);
    thumbs.forEach((pl, i) => {
      const k = span(t, T.s4 + 0.3 + i * 0.12, T.s4 + 0.8 + i * 0.12);
      if (k <= 0) return;
      const col = i % 3, row = Math.floor(i / 3);
      const cellW = 280, cellH = 210;
      const px = 90 + col * (cellW + 30), py = 690 + row * (cellH + 36);
      x.save();
      x.globalAlpha = a * k;
      x.translate(0, (1 - k) * 30);
      // portrait and square sheets sit inside the same cell
      const fit = Math.min(cellW / pl.w, cellH / pl.h);
      drawPlate(x, pl, px + (cellW - pl.w * fit) / 2, py + (cellH - pl.h * fit) / 2, fit, false, true);
      x.restore();
    });
    x.globalAlpha = a * span(t, T.s4 + 2.2, T.s4 + 2.8);
    serif(x, "Claude, in code, stroke by stroke. Every one is marked AI-made, and none gets the proof-of-hand badge.", 90, 1480, 44, 900, SOFT, true);
    x.globalAlpha = 1;
  }

  // 5. the dare, with the studio on a phone
  if (t >= T.s5 && t < T.s6) {
    const a = life(t, T.s5, T.s6);
    x.globalAlpha = a;
    headline(x, "CAN YOU BEAT", 90, 330, 150, PINK);
    headline(x, "THEM BY HAND?", 90, 480, 150, PINK);
    const k = span(t, T.s5 + 0.2, T.s5 + 1.0);
    const swap = span(t, T.s5 + 3.0, T.s5 + 3.8, inOut);
    // the studio, remixing the window; then the AI piece's page with its dare
    x.save();
    x.globalAlpha = a * (1 - swap);
    phone(x, phones.studio, 540 + (1 - k) * 700, 1090, 460, -0.035);
    x.restore();
    x.save();
    x.globalAlpha = a * swap;
    phone(x, phones.ai, 540, 1090 + (1 - swap) * 80, 460, 0.03);
    x.restore();
    x.globalAlpha = a;
    x.fillStyle = GROUND;
    x.globalAlpha = a * (1 - swap) * span(t, T.s5 + 1.0, T.s5 + 1.4);
    serif(x, "Remix one by hand, or start a blank sheet.", 540, 1690, 44, 900, INK, true, "center");
    x.globalAlpha = a * swap;
    serif(x, "Hand-made work goes up beside them, then in front.", 540, 1690, 44, 900, INK, true, "center");
    x.globalAlpha = 1;
  }

  // 6. where
  if (t >= T.s6) {
    const a = span(t, T.s6, T.s6 + 0.4);
    x.globalAlpha = a;
    logoRep.draw(span(t, T.s6, T.s6 + 1.1, (p) => 1 - Math.pow(1 - p, 2)));
    x.drawImage(logoCanvas, 540 - 300, 560, 600, 300);
    const k = span(t, T.s6 + 0.8, T.s6 + 1.4);
    x.globalAlpha = a * k;
    headline(x, "TILOART.COM", 540, 1080, 150, BLUE, "center");
    serif(x, "Free to draw, show and stamp. Nothing to install.", 540, 1180, 46, 900, INK, true, "center");
    x.globalAlpha = a * span(t, T.s6 + 1.4, T.s6 + 2.0);
    kicker(x, "Closed beta · invites: hello@tiloart.com", 540, 1320, PINK, "center", 28);
    x.globalAlpha = 1;
  }
}

/* ---------- out ---------- */
const [mode, dir] = process.argv.slice(2);
const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");
const frames = Math.round(T.end * FPS);

if (mode === "frames") {
  mkdirSync(dir, { recursive: true });
  // the replays only run forward, so the stills go in time order
  for (const t of [1.0, 2.9, 6.0, 9.5, 12.5, 15.0, 17.0, 19.5, 22.0, 24.5, 27.5, 30.0, 32.5]) {
    frame(ctx, t);
    writeFileSync(join(dir, `t${t.toFixed(1).padStart(4, "0")}.png`), await canvas.encode("png"));
  }
  console.log("stills in", dir);
} else {
  const out = join(HERE, "out");
  mkdirSync(out, { recursive: true });
  const silent = join(out, "tilo-intro-silent.mp4"), file = join(out, "tilo-intro.mp4");
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", silent], { stdio: ["pipe", "inherit", "inherit"] });
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    frame(ctx, i / FPS);
    const data = ctx.getImageData(0, 0, W, H).data;
    if (!ff.stdin.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength))) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 150 === 0) console.log(`frame ${i} of ${frames}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log("wrote", silent);
  if (existsSync(MUSIC)) {
    // the track's lift at 80.1 s lands on the reveal ("An AI drew all of these"); in and out with fades,
    // at the loudness Instagram and TikTok play at
    const from = MUSIC_LIFT - T.s4;
    const mux = spawn("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-ss", String(from), "-t", String(T.end), "-i", MUSIC, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
      "-af", `afade=t=in:d=0.6,afade=t=out:st=${T.end - 2.5}:d=2.5,loudnorm=I=-16:TP=-1.5:LRA=11`, "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", file], { stdio: "inherit" });
    await new Promise((r) => mux.on("close", r));
    console.log("wrote", file);
  } else console.log(`no ${MUSIC}: only the silent copy`);
}
