/* "Things a prompt can't do": 9:16, 1080 x 1920, 30 fps, 31 seconds, set to "Convergence" by
   Scott Buckley (scottbuckley.com.au, CC BY 4.0: the post has to credit it). The track isn't in
   the repository: put Convergence.mp3 in marketing/music/. Its 4/4 kick comes in at 1:40.05
   (TRACK_KICK) and lands on "You can." (T.s7).
   Five things a hand does and a prompt doesn't, each shown with a line on a sheet. The lines
   are diagrams made in code, and the end card says so: nothing in it is passed off as a
   person's drawing. What it says about recordings is what /proof says: each stroke, in order,
   with the time it ended, so a pause between strokes is in the recording.
   Usage, from the repository root: npm run video:prompt [-- frames DIR]
     no argument: marketing/out/tilo-cant.mp4 (and -silent) and cant-cover.png;
     `frames DIR`: stills of it to check. */

import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BLUE, clamp, drawPlate, encode, FPS, ground, H, headline, HERE, highlighter, INK, kicker, life, logoAt, logoCanvas, logoRep,
  measureHead, PAPER, PINK, serif, SOFT, span, W, withMusic, type Plate,
} from "./kit";
import { Replayer, strokeWeight } from "../src/engine/replay";
import { Sketch, type Pt } from "../src/engine/sketch";
import type { Piece } from "../src/engine/stroke";

const MUSIC = join(process.cwd(), "marketing", "music", "Convergence.mp3");
const TRACK_KICK = 100.05;
const T = { s2: 3.0, s3: 7.2, s4: 11.4, s5: 15.6, s6: 19.8, s7: 24.0, end: 31.0 };

/* ---------- sheets with lines on them, replayed like strokes on Tilo ---------- */
const SHEET = { w: 1600, h: 924 };
const PLATE_W = 900, PLATE_H = Math.round((PLATE_W * SHEET.h) / SHEET.w), TOP = 690;
const k = PLATE_W / SHEET.w;
interface Sheet extends Plate { ends: number[] }
function sheet(seed: number, build: (S: Sketch) => void): Sheet {
  const S = new Sketch(seed);
  build(S);
  const canvas = createCanvas(PLATE_W, PLATE_H);
  const rep = new Replayer(canvas as unknown as HTMLCanvasElement, S.strokes, "smooth", SHEET.w, undefined, SHEET.h);
  // where each stroke ends, as a share of the whole replay
  const total = S.strokes.reduce((a, s) => a + strokeWeight(s), 0);
  let run = 0;
  const ends = S.strokes.map((s) => (run += strokeWeight(s)) / total);
  return { canvas, rep, piece: { id: "diagram", title: "", by: "", minutes: 0, strokes: S.strokes } as Piece, w: PLATE_W, h: PLATE_H, ends };
}
/** a replay position from keyframes [time, position], straight between them */
function keyed(t: number, keys: [number, number][]) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, p1] = keys[i], [t0, p0] = keys[i - 1];
    if (t <= t1) return p0 + (p1 - p0) * ((t - t0) / (t1 - t0));
  }
  return keys[keys.length - 1][1];
}
const along = (n: number, f: (u: number) => Pt): Pt[] => Array.from({ length: n + 1 }, (_, i) => f(i / n));
const press = (u: number) => clamp(0.35 + 0.4 * Math.pow(Math.sin(Math.PI * u), 0.6) + 0.05 * Math.sin(u * 17));
/** sheet coordinates to the frame */
const onFrame = ([sx, sy]: Pt): Pt => [90 + sx * k, TOP + sy * k];

// 1. a line that stops, and goes on: two strokes, with the pause between them
const first = (u: number): Pt => [180 + 620 * u, 560 - 130 * Math.sin(u * Math.PI * 0.9)];
const STOP = first(1);
const hesitate = sheet(1, (S) => {
  S.path(along(90, first), "brushpen", INK, 22, press);
  S.path(along(90, (u) => [STOP[0] + 620 * u, STOP[1] + 40 * Math.sin(u * Math.PI * 1.4) - 90 * u]), "brushpen", INK, 22, press);
});
// 2. heading one way, then a turn: where it was going stays as a dashed ghost
const TURN: Pt = [760, 360];
const mind = sheet(2, (S) => {
  S.path(along(90, (u) => [170 + (TURN[0] - 170) * u, 760 - (760 - TURN[1]) * Math.pow(u, 0.9)]), "brushpen", INK, 22, press);
  S.path(along(110, (u) => [TURN[0] + 640 * u, TURN[1] + 420 * Math.sin(u * Math.PI * 0.62)]), "brushpen", INK, 22, press);
});
// 3. a line with a hand's tremor in it
const shake = sheet(3, (S) => {
  let s = 41;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) - 0.5;
  S.path(along(260, (u) => [170 + 1260 * u, 470 - 150 * Math.sin(u * Math.PI * 1.6) + 5 * Math.sin(u * 55) + 3 * Math.sin(u * 131) + 6 * rnd()]), "brushpen", INK, 20, (u) => clamp(press(u) + 0.12 * rnd()));
});
// 4. the same circle three times, rounder each time
const circles = sheet(4, (S) => {
  const centres = [330, 800, 1270];
  const tries = [
    { wob: 0.2, gap: 0.16, lumps: 3 },
    { wob: 0.09, gap: 0.06, lumps: 4 },
    { wob: 0.025, gap: 0, lumps: 5 },
  ];
  tries.forEach(({ wob, gap, lumps }, i) => {
    const r = 170;
    S.path(along(120, (u) => {
      const a = -Math.PI / 2 + u * Math.PI * 2 * (1 - gap);
      const rr = r * (1 + wob * Math.sin(a * lumps + i) + wob * 0.5 * Math.sin(a * 2.3));
      return [centres[i] + rr * Math.cos(a), 440 + rr * Math.sin(a) * (1 - wob * 0.6)];
    }), "brushpen", INK, 20, press);
  });
});

/* ---------- pieces of the frame ---------- */
/** the number and the two lines of a scene's headline */
function title(x: SKRSContext2D, no: string, l1: string, l2: string, c2 = INK) {
  kicker(x, no, 90, 300, PINK, "left", 34);
  headline(x, l1, 90, 440, 140, INK);
  headline(x, l2, 90, 580, 140, c2);
}
/** a small label on a pill, pointing at a spot on the sheet */
function pill(x: SKRSContext2D, text: string, at: Pt, a: number) {
  if (a <= 0) return;
  const [cx, cy] = onFrame(at);
  x.save();
  x.globalAlpha *= a;
  x.font = "700 26px Archivo";
  (x as unknown as { letterSpacing: string }).letterSpacing = "2px";
  const w = x.measureText(text).width + 40, h = 52, px = cx - w / 2, py = cy - 120 + (1 - a) * 14;
  x.fillStyle = PINK;
  x.beginPath();
  x.roundRect(px, py, w, h, 26);
  x.fill();
  x.beginPath();
  x.moveTo(cx - 10, py + h - 1);
  x.lineTo(cx, py + h + 14);
  x.lineTo(cx + 10, py + h - 1);
  x.fill();
  x.fillStyle = PAPER;
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(text, cx, py + h / 2 + 2);
  x.restore();
  // the pen, resting
  x.save();
  x.globalAlpha *= a;
  x.fillStyle = PINK;
  x.beginPath();
  x.arc(cx, cy, 9 + 4 * Math.sin(a * Math.PI * 4), 0, Math.PI * 2);
  x.fill();
  x.restore();
}
/** a dashed line on the sheet: where a stroke was heading */
function ghost(x: SKRSContext2D, from: Pt, to: Pt, a: number) {
  if (a <= 0) return;
  const [x0, y0] = onFrame(from), [x1, y1] = onFrame(to);
  x.save();
  x.globalAlpha *= a * 0.7;
  x.strokeStyle = SOFT;
  x.lineWidth = 5;
  x.setLineDash([16, 14]);
  x.lineCap = "round";
  x.beginPath();
  x.moveTo(x0, y0);
  x.lineTo(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a);
  x.stroke();
  x.restore();
}
function note(x: SKRSContext2D, text: string, a: number) {
  x.save();
  x.globalAlpha *= a;
  serif(x, text, 90, TOP + PLATE_H + 110, 48, 900, SOFT, true);
  x.restore();
}

function frame(x: SKRSContext2D, t: number) {
  ground(x);

  // the hook
  if (t < T.s2) {
    const a = life(t, -1, T.s2);
    x.globalAlpha = a * span(t, 0.1, 0.5);
    kicker(x, "Tilo · drawn by hand", 84, 640, PINK, "left", 34);
    const size = Math.min(230, (230 * 920) / measureHead(x, "THINGS A PROMPT", 230));
    const k1 = span(t, 0.2, 0.7), k2 = span(t, 0.6, 1.1);
    x.save();
    x.globalAlpha = a * k1;
    x.translate(0, (1 - k1) * 40);
    headline(x, "THINGS A PROMPT", 80, 860, size, INK);
    x.restore();
    if (k2 > 0) {
      const hw = measureHead(x, "CAN'T DO.", size * 1.25);
      x.globalAlpha = a;
      highlighter(x, 80 + size * 0.02, 80 + hw * 0.98, 1110 - size * 0.42, size * 0.9, span(t, 1.2, 1.9));
      x.save();
      x.globalAlpha = a * k2;
      x.translate(0, (1 - k2) * 40);
      headline(x, "CAN'T DO.", 80, 1110, size * 1.25, PINK);
      x.restore();
    }
    x.globalAlpha = 1;
  }

  // 01: hesitate. The pen stops between two strokes, and the recording keeps the pause.
  if (t >= T.s2 && t < T.s3) {
    const a = life(t, T.s2, T.s3);
    x.globalAlpha = a;
    title(x, "01", "IT CAN'T", "HESITATE.");
    const b = hesitate.ends[0], s = T.s2;
    hesitate.rep.draw(keyed(t, [[s + 0.3, 0], [s + 1.5, b], [s + 2.6, b], [s + 3.7, 1]]));
    drawPlate(x, hesitate, 90, TOP, 1, true, false);
    pill(x, "PAUSE · 1.1 S", STOP, span(t, s + 1.5, s + 1.7) * (1 - span(t, s + 2.6, s + 2.8)));
    note(x, "A hand stops to think, then goes on. The recording keeps the pause.", span(t, s + 0.8, s + 1.3));
    x.globalAlpha = 1;
  }

  // 02: change its mind halfway
  if (t >= T.s3 && t < T.s4) {
    const a = life(t, T.s3, T.s4);
    x.globalAlpha = a;
    title(x, "02", "IT CAN'T CHANGE", "ITS MIND HALFWAY.");
    const b = mind.ends[0], s = T.s3;
    mind.rep.draw(keyed(t, [[s + 0.3, 0], [s + 1.4, b], [s + 2.1, b], [s + 3.6, 1]]));
    drawPlate(x, mind, 90, TOP, 1, true, false);
    ghost(x, TURN, [1430, 40], span(t, s + 1.4, s + 2.0));
    note(x, "Halfway through a line, a hand can decide it was wrong.", span(t, s + 0.8, s + 1.3));
    x.globalAlpha = 1;
  }

  // 03: shake
  if (t >= T.s4 && t < T.s5) {
    const a = life(t, T.s4, T.s5);
    x.globalAlpha = a;
    title(x, "03", "IT CAN'T", "SHAKE.");
    const s = T.s4;
    shake.rep.draw(span(t, s + 0.3, s + 3.3, (p) => p));
    drawPlate(x, shake, 90, TOP, 1, true, false);
    note(x, "The wobble in a line is a person. Nobody else's hand wobbles quite like yours.", span(t, s + 0.8, s + 1.3));
    x.globalAlpha = 1;
  }

  // 04: get better at it
  if (t >= T.s5 && t < T.s6) {
    const a = life(t, T.s5, T.s6);
    x.globalAlpha = a;
    title(x, "04", "IT CAN'T GET", "BETTER AT IT.");
    const s = T.s5, [e1, e2] = circles.ends;
    circles.rep.draw(keyed(t, [[s + 0.3, 0], [s + 1.2, e1], [s + 1.4, e1], [s + 2.3, e2], [s + 2.5, e2], [s + 3.4, 1]]));
    drawPlate(x, circles, 90, TOP, 1, true, false);
    ["Monday", "Wednesday", "Friday"].forEach((day, i) => {
      x.save();
      x.globalAlpha = a * span(t, s + 0.3 + i * 1.1, s + 0.6 + i * 1.1);
      kicker(x, day, onFrame([[330, 800, 1270][i], 0])[0], TOP + PLATE_H - 34, SOFT, "center", 22);
      x.restore();
    });
    note(x, "Draw it again, and again. The getting better is yours.", span(t, s + 0.8, s + 1.3));
    x.globalAlpha = 1;
  }

  // 05: mean it
  if (t >= T.s6 && t < T.s7) {
    const a = life(t, T.s6, T.s7, 0.2);
    const s = T.s6;
    x.globalAlpha = a;
    kicker(x, "05", 90, 640, PINK, "left", 34);
    const size = 230;
    headline(x, "IT CAN'T", 80, 860, size, INK);
    const hw = measureHead(x, "MEAN IT.", size);
    highlighter(x, 80 + size * 0.02, 80 + hw * 0.98, 1080 - size * 0.34, size * 0.74, span(t, s + 0.7, s + 1.4));
    headline(x, "MEAN IT.", 80, 1080, size, BLUE);
    x.globalAlpha = a * span(t, s + 1.4, s + 1.9);
    serif(x, "A prompt describes a picture. A hand decides every line of one.", 84, 1250, 50, 900, SOFT, true);
    x.globalAlpha = 1;
  }

  // you can: on the kick
  if (t >= T.s7) {
    const s = T.s7;
    const a = span(t, s, s + 0.12);
    x.globalAlpha = a;
    const size = 330, hit = 1 + 0.06 * (1 - span(t, s, s + 0.5));
    x.save();
    x.translate(540, 760);
    x.scale(hit, hit);
    headline(x, "YOU CAN.", 0, 0, size, PINK, "center", 940);
    x.restore();
    x.globalAlpha = a * span(t, s + 1.0, s + 1.5);
    logoRep.draw(span(t, s + 1.0, s + 2.0, (p) => 1 - Math.pow(1 - p, 2)));
    x.drawImage(logoCanvas, 540 - 210, 890, 420, 210);
    x.globalAlpha = a * span(t, s + 1.8, s + 2.3);
    serif(x, "Draw by hand on Tilo. Every stroke recorded, in your browser.", 540, 1200, 48, 860, INK, true, "center");
    headline(x, "TILOART.COM", 540, 1370, 110, BLUE, "center");
    x.globalAlpha = a * span(t, s + 2.6, s + 3.1);
    kicker(x, "The lines in this video are diagrams, drawn in code", 540, 1480, SOFT, "center", 22);
    x.globalAlpha = 1;
  }
}

/** the Reel cover: the title in the middle, where the grid's 3:4 crop keeps it */
function cover() {
  const c = createCanvas(W, H), x = c.getContext("2d");
  ground(x);
  logoAt(x, INK, 540, 470, 420);
  const size = Math.min(230, (230 * 920) / measureHead(x, "THINGS A PROMPT", 230));
  headline(x, "THINGS A PROMPT", 80, 920, size, INK);
  const hw = measureHead(x, "CAN'T DO.", size * 1.25);
  highlighter(x, 80 + size * 0.02, 80 + hw * 0.98, 1170 - size * 0.42, size * 0.9, 1);
  headline(x, "CAN'T DO.", 80, 1170, size * 1.25, PINK);
  serif(x, "Five things only a hand does.", 80, 1320, 52, 900, SOFT, true);
  return c;
}

const [mode, dir] = process.argv.slice(2);
const outDir = join(HERE, "out");
mkdirSync(outDir, { recursive: true });

if (mode === "frames") {
  mkdirSync(dir, { recursive: true });
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d");
  // the replays only run forward, so the stills go in time order
  for (const t of [2.2, 5.0, 6.5, 9.0, 10.6, 13.0, 14.6, 17.0, 18.9, 21.8, 24.2, 25.5, 28.0]) {
    frame(ctx, t);
    writeFileSync(join(dir, `t${t.toFixed(1).padStart(4, "0")}.png`), await canvas.encode("png"));
  }
  writeFileSync(join(dir, "cover.png"), await cover().encode("png"));
  console.log("stills in", dir);
} else {
  writeFileSync(join(outDir, "cant-cover.png"), await cover().encode("png"));
  const silent = join(outDir, "tilo-cant-silent.mp4");
  await encode(silent, Math.round(T.end * FPS), frame);
  console.log("wrote", silent);
  if (existsSync(MUSIC)) {
    await withMusic(MUSIC, silent, join(outDir, "tilo-cant.mp4"), TRACK_KICK - T.s7, T.end, true);
    console.log("wrote", join(outDir, "tilo-cant.mp4"));
  } else console.log(`no ${MUSIC}: silent copy only`);
}
