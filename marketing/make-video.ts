/* Tilo's first social video: 9:16, 1080 x 1920, 30 fps, about 33 seconds, set to "Inspired" by
   Kevin MacLeod (incompetech.com, CC BY 4.0: the post has to credit it). The track isn't in the
   repository: put Inspired.mp3 in marketing/music/ (from incompetech.com). Without it, or for
   music added in the app you post from, there is the silent copy. The timelapses are the sample
   pieces replayed by the studio's own engine, stroke by stroke, so they are what the site shows.
   The phone screens are marketing/shots/*.png (node marketing/shoot.mjs).
   Usage, from the repository root: npm run video [-- frames DIR | assets | assets-stills DIR]
     no argument: marketing/out/tilo-intro.mp4 (and -silent); `frames DIR`: stills of it to check;
     `assets`: the profile pictures, the Reel cover and one 15-second clip per sample in out/clips;
     `assets-stills DIR`: stills of those clips. */

import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BLUE, encode, FPS, ground, GROUND, H, headLines, headline, HERE, highlighter, INK, inOut, kicker, life, logoAt, logoCanvas, logoRep, measureHead, PAPER, phone, PINK, plate, drawPlate, serif, SOFT, span, clamp, trace, W, withMusic, type Plate } from "./kit";
import { samples } from "../src/data/samples";
import { drawnCount, type Piece } from "../src/engine/stroke";

const SAMPLES = samples();
const MUSIC = join(process.cwd(), "marketing", "music", "Inspired.mp3"), MUSIC_LIFT = 80.1;

const piece = (id: string) => SAMPLES.find((p) => p.id === id)!;
const SHOTS = join(HERE, "shots");
const shot = async (n: string) => loadImage(join(SHOTS, `${n}.png`));
const phones = { studio: await shot("studio"), ai: await shot("piece-ai"), home: await shot("home") };

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

/** a square for the round avatar: everything inside the middle circle */
function profile(bg: string, ink: string) {
  const c = createCanvas(1080, 1080), x = c.getContext("2d");
  x.fillStyle = bg;
  x.fillRect(0, 0, 1080, 1080);
  logoAt(x, ink, 540, 560, 720);
  return c;
}
/** the cover for the intro Reel: the promise in the middle, where the grid's 3:4 crop keeps it */
function cover() {
  const c = createCanvas(W, H), x = c.getContext("2d");
  ground(x);
  logoAt(x, INK, 540, 470, 420);
  const size = Math.min(230, (230 * 920) / measureHead(x, "NOT PROMPTS.", 230));
  const hw = measureHead(x, "HANDS,", size);
  headline(x, "DRAWN BY", 80, 860, size, BLUE);
  highlighter(x, 80 + size * 0.02, 80 + hw * 0.96, 1070 - size * 0.34, size * 0.74, 1);
  headline(x, "HANDS,", 80, 1070, size, BLUE);
  headline(x, "NOT PROMPTS.", 80, 1280, size, PINK);
  serif(x, "A free studio and gallery for art made stroke by stroke.", 80, 1420, 50, 900, SOFT, true);
  return c;
}

/* ---------- one sample, replayed on its own: a short clip per piece ---------- */
const CLIP = { draw: 0.4, done: 11.4, dare: 12.0, end: 15.0 };
function clipFrame(x: SKRSContext2D, pl: Plate, no: number, t: number) {
  ground(x);
  const a = Math.min(span(t, 0, 0.4), 1);
  x.globalAlpha = a;
  const size = 110, lines = headLines(x, pl.piece.title, size, 900);
  // the whole block (kicker to the dare) centred between 200 and 1540, clear of TikTok's caption
  const block = 120 + (lines.length - 1) * size * 0.95 + 70 + pl.h + 310;
  const y0 = Math.max(200, 200 + (1340 - block) / 2);
  kicker(x, `AI-made sample · ${String(no).padStart(2, "0")} of ${SAMPLES.length}`, 90, y0, PINK);
  lines.forEach((l, i) => headline(x, l, 90, y0 + 120 + i * size * 0.95, size, INK));
  const top = y0 + 120 + (lines.length - 1) * size * 0.95 + 70;
  const pos = span(t, CLIP.draw, CLIP.done, (p) => 1 - Math.pow(1 - p, 1.6));
  const idx = pl.rep.draw(pos);
  const px = (W - pl.w) / 2;
  drawPlate(x, pl, px, top);
  const below = top + pl.h;
  trace(x, px, below + 46, pl.w, pos);
  kicker(x, `Stroke ${Math.min(idx + 1, pl.piece.strokes.length).toLocaleString("en")} of ${drawnCount(pl.piece.strokes).toLocaleString("en")} · drawn by Claude, in code`, px, below + 120, INK, "left", 26);
  // the dare, once the piece is finished
  const d = span(t, CLIP.dare, CLIP.dare + 0.6);
  if (d > 0) {
    x.globalAlpha = a * d;
    x.save();
    x.translate(0, (1 - d) * 24);
    headline(x, "CAN YOU BEAT IT BY HAND?", 540, below + 230, 96, PINK, "center");
    kicker(x, "tiloart.com · free, in your browser", 540, below + 300, INK, "center", 30);
    x.restore();
  }
  x.globalAlpha = 1;
}
const clipPlates = new Map<number, Plate>();
const plateFor = (p: Piece, i: number) => clipPlates.get(i) ?? clipPlates.set(i, plate(p, clipWidth(p))).get(i)!;
/** the width a sample's plate gets, so tall sheets still leave room for the dare */
const clipWidth = (p: Piece) => ({ land: 900, square: 760, port: 600 })[p.shape ?? "land"] ?? 900;

const [mode, dir] = process.argv.slice(2);
const out = join(HERE, "out");
mkdirSync(out, { recursive: true });
const music = existsSync(MUSIC);
if (!music) console.log(`no ${MUSIC}: silent copies only`);

if (mode === "frames") {
  mkdirSync(dir, { recursive: true });
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d");
  // the replays only run forward, so the stills go in time order
  for (const t of [1.0, 2.9, 6.0, 9.5, 12.5, 15.0, 17.0, 19.5, 22.0, 24.5, 27.5, 30.0, 32.5]) {
    frame(ctx, t);
    writeFileSync(join(dir, `t${t.toFixed(1).padStart(4, "0")}.png`), await canvas.encode("png"));
  }
  console.log("stills in", dir);
} else if (mode === "assets" || mode === "assets-stills") {
  writeFileSync(join(out, "profile-blue.png"), await profile(BLUE, PAPER).encode("png"));
  writeFileSync(join(out, "profile-cream.png"), await profile(GROUND, INK).encode("png"));
  writeFileSync(join(out, "cover.png"), await cover().encode("png"));
  const clips = join(out, "clips");
  mkdirSync(clips, { recursive: true });
  for (const [i, p] of SAMPLES.entries()) {
    const name = `tilo-${String(i + 1).padStart(2, "0")}-${p.id}`;
    if (mode === "assets-stills") {
      const pl = plate(p, clipWidth(p)), c = createCanvas(W, H), x = c.getContext("2d");
      for (const t of [6, 14.5]) {
        clipFrame(x, pl, i + 1, t);
        writeFileSync(join(dir, `${name}-${t}.png`), await c.encode("png"));
      }
      continue;
    }
    const silent = join(clips, `${name}-silent.mp4`);
    await encode(silent, Math.round(CLIP.end * FPS), (x, t) => clipFrame(x, plateFor(p, i), i + 1, t));
    // each clip gets a different stretch of the track
    if (music) await withMusic(MUSIC, silent, join(clips, `${name}.mp4`), 12 + i * 31, CLIP.end);
    console.log("clip", name);
  }
  console.log("assets in", out);
} else {
  const silent = join(out, "tilo-intro-silent.mp4");
  await encode(silent, Math.round(T.end * FPS), frame);
  console.log("wrote", silent);
  // the track's lift at 80.1 s lands on the reveal ("An AI drew all of these")
  if (music) await withMusic(MUSIC, silent, join(out, "tilo-intro.mp4"), MUSIC_LIFT - T.s4, T.end), console.log("wrote", join(out, "tilo-intro.mp4"));
}
