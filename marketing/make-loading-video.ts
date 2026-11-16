/* "Loading…": a silent 9:16 clip for TikTok and Reels, to post with a sound picked in the app.
   A game-style loading screen: the bar fills, with stalls, while a Release week sample draws
   itself stroke by stroke above it, and the tips under it are true things about Tilo. At 100%
   (6.0 s, where a track's drop goes) it cuts to the event: the game's name and date in our own
   type, "draw while you wait", tiloart.com. The last half second goes back to the empty loading
   screen, so the loop is seamless. The piece is an AI-made sample, labelled so on screen; nothing
   in the clip comes from the game, and the end says Tilo has nothing to do with it.
   Usage, from the repository root: npm run video:loading [-- frames DIR] */

import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clamp, drawPlate, encode, FPS, H, HERE, headline, inOut, kicker, logoAt, PAPER, plate, serif, span, W, YELLOW } from "./kit";
import { samples } from "../src/data/samples";

const NIGHT = "#120A24", PINKS = "#FF4F9A", ORANGE = "#FF8A3D";
const DROP = 6.0, END = 12.5;
const piece = samples().find((p) => p.id === "lastgas")!;
const art = plate(piece, 920);
const blank = plate(piece, 920);
blank.rep.draw(0);
const ART_Y = 300;

/** how full the bar is: quick, a stall, quick, a stall near the end, then done on the drop */
const KEYS: [number, number][] = [[0, 0], [0.3, 0], [1.2, 0.18], [1.9, 0.37], [2.8, 0.38], [3.7, 0.63], [4.6, 0.88], [5.45, 0.89], [5.9, 1]];
function bar(t: number) {
  for (let i = 1; i < KEYS.length; i++) {
    const [t0, v0] = KEYS[i - 1], [t1, v1] = KEYS[i];
    if (t <= t1) return v0 + (v1 - v0) * inOut(clamp((t - t0) / (t1 - t0)));
  }
  return 1;
}
const TIPS = [
  "Tip: every stroke on Tilo is recorded. Anyone can replay how you drew it.",
  "Tip: this sample was drawn in code by Claude, an AI. Beat it by hand.",
  "Tip: the shared sunset wall is up until 20 November.",
];

const bg = (() => {
  const c = createCanvas(W, H), x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, H);
  [[0, NIGHT], [0.45, "#2A1650"], [0.75, "#6B2A7A"], [1, "#C2407E"]].forEach(([k, col]) => g.addColorStop(k as number, col as string));
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  return c;
})();

/** the loading screen at bar fill `k`, the art drawn as far as `k` too */
function loading(x: SKRSContext2D, t: number, k: number, pl = art) {
  x.drawImage(bg, 0, 0);
  logoAt(x, PAPER, 180, 200, 220);
  kicker(x, "Release week", 1000, 210, YELLOW, "right", 30);
  if (pl === art) art.rep.draw(k);
  drawPlate(x, pl, 80, ART_Y, 1, false, true);
  serif(x, "Sample drawn in code by Claude, an AI", 80, ART_Y + art.h + 50, 30, 1000, "rgba(251,250,245,0.7)", true);

  // the tip, changing every two seconds
  const i = Math.floor(t / 2) % TIPS.length, f = t % 2;
  x.globalAlpha = Math.min(span(f, 0, 0.25), 1 - span(f, 1.8, 2));
  serif(x, TIPS[i], 90, 1180, 46, 860, PAPER, true);
  x.globalAlpha = 1;

  // the bar: a track, the fill with moving stripes, the percentage and a spinner
  const bx = 90, by = 1420, bw = 820, bh = 30;
  kicker(x, `Loading… ${Math.round(k * 100)}%`, bx, by - 30, PAPER, "left", 30);
  x.save();
  x.translate(bx + bw - 20, by - 42);
  x.rotate(t * 6);
  x.strokeStyle = YELLOW;
  x.lineWidth = 6;
  x.lineCap = "round";
  x.beginPath();
  x.arc(0, 0, 18, 0, Math.PI * 1.4);
  x.stroke();
  x.restore();
  x.fillStyle = "rgba(251,250,245,0.18)";
  x.beginPath();
  x.roundRect(bx, by, bw, bh, bh / 2);
  x.fill();
  if (k > 0) {
    x.save();
    x.beginPath();
    x.roundRect(bx, by, Math.max(bh, bw * k), bh, bh / 2);
    x.clip();
    const g = x.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, PINKS);
    g.addColorStop(1, ORANGE);
    x.fillStyle = g;
    x.fillRect(bx, by, bw, bh);
    x.fillStyle = "rgba(255,255,255,0.22)";
    for (let s = -2; s < 30; s++) {
      const sx = bx + s * 40 + ((t * 80) % 40);
      x.beginPath();
      x.moveTo(sx, by + bh);
      x.lineTo(sx + 18, by + bh);
      x.lineTo(sx + 36, by);
      x.lineTo(sx + 18, by);
      x.fill();
    }
    x.restore();
  }
}

/** a word that lands: big, then settles */
function slam(x: SKRSContext2D, text: string, cx: number, y: number, size: number, color: string, t: number, at: number) {
  if (t < at) return;
  const p = clamp((t - at) / 0.22);
  const s = 1 + 0.35 * (1 - p) * (1 - p);
  x.save();
  x.globalAlpha = Math.min(1, p * 2);
  x.translate(cx, y);
  x.scale(s, s);
  x.shadowColor = "rgba(18,10,36,0.8)";
  x.shadowOffsetX = 8;
  x.shadowOffsetY = 10;
  headline(x, text, 0, 0, size, color, "center", 980);
  x.restore();
}

function frame(x: SKRSContext2D, t: number) {
  if (t < DROP) return loading(x, t, bar(t));

  // after the drop: the finished piece, close up and dark, under the words
  const d = t - DROP;
  x.drawImage(bg, 0, 0);
  const z = 2.95 + d * 0.05;
  x.save();
  x.translate(540, 960);
  x.scale(z, z);
  x.drawImage(art.canvas, -art.w / 2 - 40, -art.h / 2, art.w, art.h);
  x.restore();
  x.fillStyle = "rgba(18,10,36,0.62)";
  x.fillRect(0, 0, W, H);

  if (d < 1.6) {
    slam(x, "GTA VI", 540, 860, 300, PAPER, t, DROP + 0.05);
    slam(x, "19 NOV", 540, 1130, 300, PINKS, t, DROP + 0.6);
  } else if (d < 3.4) {
    slam(x, "DRAW", 540, 760, 280, PAPER, t, DROP + 1.6);
    slam(x, "WHILE YOU", 540, 1000, 200, PAPER, t, DROP + 1.85);
    slam(x, "WAIT.", 540, 1250, 280, PINKS, t, DROP + 2.1);
  } else {
    logoAt(x, PAPER, 540, 560, 360);
    slam(x, "TILOART.COM", 540, 980, 170, YELLOW, t, DROP + 3.4);
    x.globalAlpha = span(t, DROP + 3.7, DROP + 4.0);
    serif(x, "Free. In your browser. By hand.", 540, 1100, 54, 960, PAPER, true, "center");
    serif(x, "Tilo has nothing to do with Rockstar Games or GTA VI.", 540, 1220, 30, 960, "rgba(251,250,245,0.75)", true, "center");
    x.globalAlpha = 1;
  }
  // a white flash on the drop
  if (d < 0.3) {
    x.fillStyle = `rgba(255,248,235,${1 - d / 0.3})`;
    x.fillRect(0, 0, W, H);
  }
  // back to the empty loading screen, so the loop meets its own start
  const back = span(t, END - 0.5, END, inOut);
  if (back > 0) {
    const c = createCanvas(W, H), o = c.getContext("2d");
    loading(o, 0, 0, blank);
    x.globalAlpha = back;
    x.drawImage(c, 0, 0);
    x.globalAlpha = 1;
  }
}

const [mode, dir] = process.argv.slice(2);
if (mode === "frames") {
  mkdirSync(dir, { recursive: true });
  const c = createCanvas(W, H), x = c.getContext("2d");
  for (const t of [0, 1.5, 3, 4.8, 5.95, 6.1, 6.9, 7.9, 8.8, 10.5, 12.4]) {
    frame(x, t);
    writeFileSync(join(dir, `t${t.toFixed(2).padStart(5, "0")}.png`), await c.encode("png"));
  }
  console.log("stills in", dir);
} else {
  const out = join(HERE, "out", "tilo-loading.mp4");
  await encode(out, Math.round(END * FPS), frame);
  console.log("wrote", out);
}
