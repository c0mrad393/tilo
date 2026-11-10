/* The hands video: what Tilo stands for, 9:16, 1080 x 1920, 30 fps, 36 seconds, set to
   "Wildflowers" by Scott Buckley (scottbuckley.com.au, CC BY 4.0: the post has to credit it).
   The tracks aren't in the repository: put Wildflowers.mp3 (and, for the other cut,
   WithTheseHands.mp3, same composer and licence) in marketing/music/. Wildflowers eases off
   under "nobody drew" and lifts on "somebody did" (DROP); With These Hands swells slowly the
   whole way, for a calmer cut (tilo-hands-alt.mp4).
   Every claim in it is one the site makes (home page, /proof): no uploads in the hand-made
   gallery, recordings no hand could make turned away, the Recorded on Tilo badge as a
   deterrent and not a guarantee, the AI samples labelled and never badged. It shows no art
   passed off as hand-made: the AI samples wear their tag, and the one stroke is a diagram.
   Usage, from the repository root: npm run video:hands [-- frames DIR]
     no argument: marketing/out/tilo-hands.mp4 (and -silent) and hands-cover.png;
     `frames DIR`: stills of it to check. */

import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BLUE, clamp, drawPlate, encode, FPS, ground, H, headline, HERE, highlighter, inOut, INK, kicker, life, logoAt, logoCanvas, logoRep,
  measureHead, PAPER, PINK, plate, serif, SOFT, span, W, withMusic, type Plate,
} from "./kit";
import { samples } from "../src/data/samples";
import { Replayer } from "../src/engine/replay";
import { Sketch } from "../src/engine/sketch";
import type { Piece } from "../src/engine/stroke";

const MUSIC = join(process.cwd(), "marketing", "music", "Wildflowers.mp3");
const ALT = join(process.cwd(), "marketing", "music", "WithTheseHands.mp3"), ALT_FROM = 36;
/** where the track's power section starts, and where in the video it lands */
const TRACK_DROP = 75.0, DROP = 9.0;
const T = { s2: 5.0, s3: DROP, s4: 14.0, s5: 20.0, s6: 26.0, s7: 31.0, end: 36.0 };

const out = (p: number) => 1 - Math.pow(1 - clamp(p), 3);
const setWidth = (x: SKRSContext2D) => ((x as unknown as { fontVariationSettings: string }).fontVariationSettings = "'wdth' 100, 'wght' 500");

/* ---------- 1. the prompt box, and the pink line through it ---------- */
const PROMPT = "a girl reading by a window, oil painting, golden light, masterpiece, 4k";
const BOX = { x: 90, y: 720, w: 900, h: 360 };
function promptBox(x: SKRSContext2D, t: number) {
  const { x: bx, y: by, w, h } = BOX;
  x.save();
  x.fillStyle = PAPER;
  x.fillRect(bx, by, w, h);
  x.strokeStyle = INK;
  x.lineWidth = 5;
  x.strokeRect(bx, by, w, h);
  // the sentence, typed
  const n = Math.round(span(t, 0.5, 3.0, (p) => p) * PROMPT.length);
  const typed = PROMPT.slice(0, n);
  x.font = "500 48px Archivo";
  setWidth(x);
  x.fillStyle = INK;
  const words = typed.split(" ");
  let line = "", yy = by + 84, lastW = 0;
  for (const word of words) {
    const tryLine = line ? `${line} ${word}` : word;
    if (x.measureText(tryLine).width > w - 90 && line) {
      x.fillText(line, bx + 44, yy);
      line = word;
      yy += 62;
    } else line = tryLine;
  }
  x.fillText(line, bx + 44, yy);
  lastW = x.measureText(line).width;
  if (t < 3.2 && Math.floor(t * 2.4) % 2 === 0) x.fillRect(bx + 48 + lastW, yy - 42, 4, 52);
  // the button, pressed
  const press = span(t, 3.15, 3.3) * (1 - span(t, 3.3, 3.5));
  const bw = 290, bh = 84, px = bx + w - bw - 30, py = by + h - bh - 30;
  x.translate(px + bw / 2, py + bh / 2);
  x.scale(1 - press * 0.06, 1 - press * 0.06);
  x.fillStyle = t > 3.2 ? PINK : INK;
  x.fillRect(-bw / 2, -bh / 2, bw, bh);
  x.font = "700 38px Archivo";
  setWidth(x);
  x.fillStyle = PAPER;
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText("Generate", 0, 2);
  x.restore();
  // the wait: four seconds
  const g = span(t, 3.4, 4.5, (p) => p);
  if (g > 0) {
    x.fillStyle = "rgba(29,27,25,0.12)";
    x.fillRect(bx, by + h + 40, w, 12);
    x.fillStyle = INK;
    x.fillRect(bx, by + h + 40, w * g, 12);
    kicker(x, g < 1 ? "Generating…" : "Done. Four seconds.", bx, by + h + 110, INK, "left", 26);
  }
}
/** a full-frame sheet for marks drawn over everything, replayed like a stroke on Tilo */
function overlay(build: (S: Sketch) => void, seed = 3) {
  const S = new Sketch(seed);
  build(S);
  const c = createCanvas(W, H);
  return { c, rep: new Replayer(c as unknown as HTMLCanvasElement, S.strokes, null, W, undefined, H) };
}
const strike = overlay((S) => {
  S.poly([[70, 980], [400, 820], [720, 930], [1010, 760]], "marker", PINK, 30, 1.2, 16);
  S.poly([[80, 1110], [420, 960], [700, 1060], [1010, 900]], "marker", PINK, 30, 1.2, 16);
});

/* ---------- 4. one stroke, and its pressure, as a diagram ---------- */
const SHEET = { w: 1600, h: 924 };
const pressure = (u: number) => 0.28 + 0.5 * Math.pow(Math.sin(Math.PI * u), 0.7) + 0.08 * Math.sin(u * 23) + 0.05 * Math.sin(u * 61);
const strokePts: [number, number][] = [];
for (let i = 0; i <= 260; i++) {
  const u = i / 260;
  // a line that loops three times on its way across, the way a pen warms up
  strokePts.push([170 + 1260 * u + 95 * Math.cos(u * Math.PI * 6 + Math.PI), 470 + 170 * Math.sin(u * Math.PI * 2) + 120 * Math.sin(u * Math.PI * 6)]);
}
const one: Plate = (() => {
  const S = new Sketch(9);
  S.path(strokePts, "brushpen", INK, 26, (u) => clamp(pressure(u)));
  const w = 900, h = Math.round((w * SHEET.h) / SHEET.w);
  const canvas = createCanvas(w, h);
  const rep = new Replayer(canvas as unknown as HTMLCanvasElement, S.strokes, "smooth", SHEET.w, undefined, SHEET.h);
  return { canvas, rep, piece: { id: "line", title: "", by: "", minutes: 0, strokes: S.strokes } as Piece, w, h };
})();
function pressureGraph(x: SKRSContext2D, px: number, py: number, w: number, h: number, pos: number) {
  x.save();
  x.strokeStyle = "rgba(29,27,25,0.18)";
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(px, py + h);
  x.lineTo(px + w, py + h);
  x.stroke();
  x.strokeStyle = PINK;
  x.lineWidth = 5;
  x.lineJoin = "round";
  x.beginPath();
  const steps = Math.max(1, Math.round(200 * pos));
  for (let i = 0; i <= steps; i++) {
    const u = (i / 200);
    const yy = py + h - clamp(pressure(u)) * h;
    if (i === 0) x.moveTo(px, yy);
    else x.lineTo(px + w * u, yy);
  }
  x.stroke();
  x.restore();
}

/* ---------- 5. the badge, landing like a stamp ---------- */
function stamp(x: SKRSContext2D, text: string, cx: number, cy: number, rot: number, color: string, k: number, size = 64) {
  if (k <= 0) return;
  const s = 1 + (1 - k) * 0.8;
  x.save();
  x.globalAlpha *= Math.min(1, k * 1.6);
  x.translate(cx, cy);
  x.rotate(rot);
  x.scale(s, s);
  x.font = `800 ${size}px Archivo`;
  (x as unknown as { fontVariationSettings: string }).fontVariationSettings = "'wdth' 68, 'wght' 800";
  (x as unknown as { letterSpacing: string }).letterSpacing = `${size * 0.06}px`;
  const w = x.measureText(text).width + size * 1.2, h = size * 1.9;
  x.fillStyle = "rgba(251,250,245,0.92)";
  x.fillRect(-w / 2, -h / 2, w, h);
  x.strokeStyle = color;
  x.lineWidth = size * 0.11;
  x.strokeRect(-w / 2, -h / 2, w, h);
  x.lineWidth = size * 0.04;
  x.strokeRect(-w / 2 + size * 0.2, -h / 2 + size * 0.2, w - size * 0.4, h - size * 0.4);
  x.fillStyle = color;
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(text, 0, size * 0.06);
  x.restore();
}
/** a drawn mark before a line: a pink cross (turned away) or a blue tick (badge) */
function mark(x: SKRSContext2D, kind: "no" | "yes", cx: number, cy: number) {
  x.save();
  x.lineWidth = 9;
  x.lineCap = "round";
  x.strokeStyle = kind === "no" ? PINK : BLUE;
  x.beginPath();
  if (kind === "no") {
    x.moveTo(cx - 18, cy - 18); x.lineTo(cx + 18, cy + 18);
    x.moveTo(cx + 18, cy - 18); x.lineTo(cx - 18, cy + 18);
  } else {
    x.moveTo(cx - 20, cy); x.lineTo(cx - 5, cy + 16); x.lineTo(cx + 22, cy - 20);
  }
  x.stroke();
  x.restore();
}

/* ---------- 6. the AI samples, tagged, and a sheet for yours ---------- */
const SAMPLES = samples();
const ai = ["gergeti", "oldtown", "raintram"].map((id) => {
  const pl = plate(SAMPLES.find((p) => p.id === id)!, 380);
  pl.rep.draw(1);
  return pl;
});
function blankSheet(x: SKRSContext2D, px: number, py: number, w: number, h: number) {
  x.save();
  x.shadowColor = "rgba(29,27,25,0.32)";
  x.shadowBlur = 50;
  x.shadowOffsetY = 22;
  x.fillStyle = PAPER;
  x.fillRect(px, py, w, h);
  x.restore();
  x.save();
  x.strokeStyle = "rgba(29,27,25,0.55)";
  x.lineWidth = 2;
  const o = 18, l = 28;
  for (const [cx, cy, sx, sy] of [[px, py, -1, -1], [px + w, py, 1, -1], [px, py + h, -1, 1], [px + w, py + h, 1, 1]] as const) {
    x.beginPath();
    x.moveTo(cx + sx * o, cy); x.lineTo(cx + sx * (o + l), cy);
    x.moveTo(cx, cy + sy * o); x.lineTo(cx, cy + sy * (o + l));
    x.stroke();
  }
  x.restore();
  serif(x, "Yours goes here.", px + w / 2, py + h / 2 + 18, 58, w - 60, SOFT, true, "center");
}

function frame(x: SKRSContext2D, t: number) {
  ground(x);

  // 1. a sentence becomes a painting in four seconds
  if (t < T.s2) {
    const a = life(t, -1, T.s2);
    x.globalAlpha = a;
    kicker(x, "Art, these days", 90, 300, PINK);
    headline(x, "TYPE A SENTENCE.", 90, 440, 140, INK);
    x.globalAlpha = a * span(t, 3.3, 3.8);
    headline(x, "GET A PAINTING.", 90, 580, 140, INK);
    x.globalAlpha = a;
    promptBox(x, t);
    strike.rep.draw(span(t, 4.55, 4.95, (p) => p));
    x.drawImage(strike.c, 0, 0);
    x.globalAlpha = 1;
  }

  // 2. in the music's pause
  if (t >= T.s2 && t < T.s3) {
    const a = life(t, T.s2, T.s3, 0.25);
    x.globalAlpha = a * span(t, T.s2 + 0.1, T.s2 + 0.6);
    kicker(x, "The feed is filling up with", 84, 560, SOFT, "left", 34);
    const size = Math.min(250, (250 * 920) / measureHead(x, "PICTURES", 250));
    [["PICTURES", 780], ["NOBODY", 1010], ["DREW.", 1240]].forEach(([text, y], i) => {
      const k = span(t, T.s2 + 0.5 + i * 0.55, T.s2 + 1.0 + i * 0.55);
      if (k <= 0) return;
      x.save();
      x.globalAlpha = a * k;
      x.translate(0, (1 - k) * 40);
      headline(x, text as string, 80, y as number, size, INK);
      x.restore();
    });
    x.globalAlpha = 1;
  }

  // 3. the drop: what Tilo is for
  if (t >= T.s3 && t < T.s4) {
    const a = life(t, T.s3, T.s4, 0.15);
    x.globalAlpha = a;
    logoRep.draw(span(t, T.s3, T.s3 + 1.0, (p) => 1 - Math.pow(1 - p, 2)));
    x.drawImage(logoCanvas, 80, 210, 360, 180);
    const lx = 80, size = Math.min(210, (210 * 920) / measureHead(x, "SOMEBODY DID.", 210));
    const lines: [string, string, number][] = [["TILO IS FOR", INK, 720], ["THE ONES", BLUE, 925], ["SOMEBODY DID.", PINK, 1130]];
    lines.forEach(([text, color, y], i) => {
      const k = span(t, T.s3 + i * 0.28, T.s3 + 0.35 + i * 0.28);
      if (k <= 0) return;
      if (i === 2) {
        const hw = measureHead(x, text, size);
        highlighter(x, lx + size * 0.02, lx + hw * 0.96, y - size * 0.34, size * 0.74, span(t, T.s3 + 1.0, T.s3 + 1.7, inOut));
      }
      x.save();
      x.globalAlpha = a * k;
      x.translate(0, (1 - k) * 50);
      headline(x, text, lx, y, size, color);
      x.restore();
    });
    x.globalAlpha = a * span(t, T.s3 + 1.6, T.s3 + 2.1);
    serif(x, "A studio and gallery for art made by hand, stroke by stroke, in your browser.", lx, 1300, 50, 900, SOFT, true);
    x.globalAlpha = 1;
  }

  // 4. no uploads: every piece is drawn here, and recorded
  if (t >= T.s4 && t < T.s5) {
    const a = life(t, T.s4, T.s5);
    x.globalAlpha = a;
    kicker(x, "0 uploads in the hand-made gallery", 90, 300, PINK);
    headline(x, "NO UPLOAD", 90, 440, 140, INK);
    headline(x, "BUTTON.", 90, 580, 140, INK);
    const pos = span(t, T.s4 + 0.5, T.s5 - 1.4, (p) => p);
    one.rep.draw(pos);
    drawPlate(x, one, 90, 690, 1, true, false);
    const gy = 690 + one.h + 70;
    kicker(x, "Pressure", 90, gy, SOFT, "left", 24);
    kicker(x, `0:${(pos * 3.4).toFixed(1).padStart(4, "0")}`, 990, gy, INK, "right", 24);
    pressureGraph(x, 90, gy + 24, 900, 110, pos);
    x.globalAlpha = a * span(t, T.s4 + 1.0, T.s4 + 1.5);
    serif(x, "Every piece is drawn on Tilo, and its recording travels with it: each stroke in order, with its timing and pressure.", 90, gy + 230, 44, 900, SOFT, true);
    x.globalAlpha = 1;
  }

  // 5. the recording is the signature
  if (t >= T.s5 && t < T.s6) {
    const a = life(t, T.s5, T.s6);
    x.globalAlpha = a;
    kicker(x, "Proof of hand", 90, 300, PINK);
    headline(x, "THE RECORDING", 90, 440, 140, INK);
    headline(x, "IS THE SIGNATURE.", 90, 580, 140, BLUE);
    const bounce = (p: number) => { p = clamp(p); return p < 0.7 ? out(p / 0.7) * 1.05 : 1.05 - 0.05 * ((p - 0.7) / 0.3); };
    stamp(x, "RECORDED ON TILO", 540, 820, -0.05, BLUE, span(t, T.s5 + 0.5, T.s5 + 0.85, bounce));
    const rows: ["no" | "yes", string][] = [
      ["no", "Strokes faster than a hand: turned away."],
      ["no", "Times that run backwards: turned away."],
      ["yes", "Reads like a person drawing: the badge."],
    ];
    rows.forEach(([kind, text], i) => {
      const k = span(t, T.s5 + 1.4 + i * 0.6, T.s5 + 1.8 + i * 0.6);
      if (k <= 0) return;
      x.save();
      x.globalAlpha = a * k;
      x.translate((1 - k) * 30, 0);
      mark(x, kind, 120, 1040 + i * 110);
      serif(x, text, 170, 1056 + i * 110, 46, 860, INK, false);
      x.restore();
    });
    x.globalAlpha = a * span(t, T.s5 + 3.6, T.s5 + 4.1);
    serif(x, "It isn't a guarantee. It makes faking more work than drawing.", 90, 1420, 44, 900, SOFT, true);
    x.globalAlpha = 1;
  }

  // 6. AI work is labelled, and hand-made goes in front
  if (t >= T.s6 && t < T.s7) {
    const a = life(t, T.s6, T.s7);
    x.globalAlpha = a;
    kicker(x, "And the AI-made work?", 90, 300, PINK);
    headline(x, "IT WEARS", 90, 440, 140, INK);
    headline(x, "A LABEL.", 90, 580, 140, INK);
    const back = span(t, T.s6 + 2.0, T.s6 + 2.7, inOut);
    const spots: [number, number, number][] = [[60, 760, -0.04], [350, 700, 0.02], [640, 770, 0.05]];
    ai.forEach((pl, i) => {
      const k = span(t, T.s6 + 0.3 + i * 0.2, T.s6 + 0.8 + i * 0.2);
      if (k <= 0) return;
      const [px, py, rot] = spots[i];
      x.save();
      x.globalAlpha = a * k * (1 - back * 0.55);
      x.translate(px + pl.w / 2, py + pl.h / 2 + (1 - k) * 40 - back * 40);
      x.rotate(rot);
      x.scale(1 - back * 0.1, 1 - back * 0.1);
      drawPlate(x, pl, -pl.w / 2, -pl.h / 2, 1, false, true);
      x.restore();
    });
    // a sheet for a drawing by hand, in front of them
    if (back > 0) {
      x.save();
      x.globalAlpha = a * back;
      x.translate(0, (1 - back) * 120);
      blankSheet(x, 190, 930, 700, 470);
      stamp(x, "RECORDED ON TILO", 740, 1370, -0.06, BLUE, span(t, T.s6 + 2.9, T.s6 + 3.2, (p) => out(p)), 30);
      x.restore();
    }
    x.globalAlpha = a * span(t, T.s6 + 1.0, T.s6 + 1.5);
    serif(x, "Tilo's own AI samples never get the badge. Work by hand hangs beside them, then in front.", 90, 1520, 44, 900, SOFT, true);
    x.globalAlpha = 1;
  }

  // 7. the line, and where
  if (t >= T.s7) {
    const a = span(t, T.s7, T.s7 + 0.4);
    x.globalAlpha = a;
    logoRep.draw(span(t, T.s7, T.s7 + 1.1, (p) => 1 - Math.pow(1 - p, 2)));
    x.drawImage(logoCanvas, 540 - 300, 420, 600, 300);
    const k = span(t, T.s7 + 0.6, T.s7 + 1.2);
    x.globalAlpha = a * k;
    headline(x, "DRAWN BY HANDS,", 540, 930, 140, BLUE, "center", 920);
    headline(x, "NOT PROMPTS.", 540, 1070, 140, PINK, "center", 920);
    x.globalAlpha = a * span(t, T.s7 + 1.4, T.s7 + 2.0);
    headline(x, "TILOART.COM", 540, 1250, 96, INK, "center");
    serif(x, "Free, in your browser. Nothing to install.", 540, 1330, 44, 900, INK, true, "center");
    x.globalAlpha = a * span(t, T.s7 + 2.0, T.s7 + 2.6);
    kicker(x, "Closed beta · invites: hello@tiloart.com", 540, 1450, PINK, "center", 28);
    x.globalAlpha = 1;
  }
}

/** the Reel cover: the line in the middle, where the grid's 3:4 crop keeps it */
function cover() {
  const c = createCanvas(W, H), x = c.getContext("2d");
  ground(x);
  logoAt(x, INK, 540, 470, 420);
  const size = Math.min(220, (220 * 920) / measureHead(x, "SOMEBODY DID.", 220));
  const hw = measureHead(x, "SOMEBODY DID.", size);
  headline(x, "TILO IS FOR", 80, 860, size, INK);
  headline(x, "THE ONES", 80, 1065, size, BLUE);
  highlighter(x, 80 + size * 0.02, 80 + hw * 0.96, 1270 - size * 0.34, size * 0.74, 1);
  headline(x, "SOMEBODY DID.", 80, 1270, size, PINK);
  serif(x, "Art made by hand, stroke by stroke. No uploads, no prompts.", 80, 1410, 50, 900, SOFT, true);
  return c;
}

const [mode, dir] = process.argv.slice(2);
const outDir = join(HERE, "out");
mkdirSync(outDir, { recursive: true });

if (mode === "frames") {
  mkdirSync(dir, { recursive: true });
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d");
  // the replays only run forward, so the stills go in time order
  for (const t of [2.0, 3.9, 4.8, 7.2, 9.4, 11.5, 15.5, 18.5, 21.0, 24.5, 27.0, 29.8, 32.0, 35.0]) {
    frame(ctx, t);
    writeFileSync(join(dir, `t${t.toFixed(1).padStart(4, "0")}.png`), await canvas.encode("png"));
  }
  writeFileSync(join(dir, "cover.png"), await cover().encode("png"));
  console.log("stills in", dir);
} else {
  writeFileSync(join(outDir, "hands-cover.png"), await cover().encode("png"));
  const silent = join(outDir, "tilo-hands-silent.mp4");
  await encode(silent, Math.round(T.end * FPS), frame);
  console.log("wrote", silent);
  if (existsSync(MUSIC)) {
    await withMusic(MUSIC, silent, join(outDir, "tilo-hands.mp4"), TRACK_DROP - DROP, T.end, true);
    console.log("wrote", join(outDir, "tilo-hands.mp4"));
  } else console.log(`no ${MUSIC}: silent copy only`);
  if (existsSync(ALT)) {
    await withMusic(ALT, silent, join(outDir, "tilo-hands-alt.mp4"), ALT_FROM, T.end, true);
    console.log("wrote", join(outDir, "tilo-hands-alt.mp4"));
  }
}
