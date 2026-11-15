import type { Pt, Sketch } from "../engine/sketch";
import { below, blob, ellipse, ridge, sky as skyBands, speckle } from "./art";
import { arch, box, DARKWOOD, empty, hole, INK, ring, shape, SOFT, tint, WOOD } from "./wall-kit";

/* The wall's subjects from No. 7 on, drawn the way the first six are (wall-art.ts): outlines
   that Claude (an AI) drew in code, leaving room on purpose for members to fill in by hand.
   The sheet is 2000 x 1000. Each one is drawn from the same seed every time, so the server
   and every viewer get the same strokes. */

const PALETTE = ["#C9392F", "#2B37D4", "#3E7C6B", "#F2C14E", "#A1386B", "#E26D3D", "#6FA8C9", "#8C5A3C"];
const pick = (S: Sketch) => PALETTE[Math.floor(S.R() * PALETTE.length)];
const ground = (S: Sketch, y: number, c = INK) => S.line(0, y, 2000, y, "ink", c, 6, 2);
/** a curve through three points, as a run of points */
const bend = (a: Pt, m: Pt, b: Pt, n = 12): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1), u = 1 - t;
    return [u * u * a[0] + 2 * u * t * m[0] + t * t * b[0], u * u * a[1] + 2 * u * t * m[1] + t * t * b[1]] as Pt;
  });

/* ---- 7. a bookshelf, half of it empty ---- */
function shelf(S: Sketch) {
  const x0 = 220, x1 = 1780, top = 90, bot = 940, rows = 4, rh = (bot - top) / rows;
  tint(S, box(x0 - 34, top - 34, x1 - x0 + 68, bot - top + 68), WOOD, 0.6);
  tint(S, box(x0, top, x1 - x0, bot - top), "#E8D9C0", 0.9);
  ring(S, box(x0 - 34, top - 34, x1 - x0 + 68, bot - top + 68), DARKWOOD, 6, 1);
  ring(S, box(x0, top, x1 - x0, bot - top), DARKWOOD, 4, 1);
  tint(S, box(990, top, 20, bot - top), WOOD, 0.9);
  S.line(990, top, 990, bot, "ink", DARKWOOD, 3, 0.4);
  S.line(1010, top, 1010, bot, "ink", DARKWOOD, 3, 0.4);
  for (let r = 1; r < rows; r++) {
    const y = top + r * rh;
    tint(S, box(x0, y - 10, x1 - x0, 20), WOOD, 0.95);
    S.line(x0, y - 10, x1, y - 10, "ink", DARKWOOD, 3, 0.6);
    S.line(x0, y + 10, x1, y + 10, "ink", DARKWOOD, 3, 0.6);
  }
  // books in some of each compartment, pushed to one side; the rest is free
  for (let r = 0; r < rows; r++)
    for (let half = 0; half < 2; half++) {
      const left = half ? 1010 : x0, right = half ? x1 : 990, floor = top + (r + 1) * rh - (r === rows - 1 ? 0 : 10);
      const fromLeft = S.R() > 0.5, room = (right - left) * (0.3 + S.R() * 0.2);
      let used = 0;
      while (used < room) {
        const w = 26 + S.R() * 30, h = (rh - 20) * (0.55 + S.R() * 0.35);
        const x = fromLeft ? left + used : right - used - w;
        shape(S, box(x, floor - h, w, h), pick(S), 0.7, INK, 3, 0.4);
        S.line(x + 4, floor - h * 0.8, x + w - 4, floor - h * 0.8, "pencil", INK, 2, 0.2);
        used += w + 2;
      }
      // a book leaning on the last one, sometimes
      if (S.R() > 0.5) {
        const h = (rh - 30) * 0.7, x = fromLeft ? left + used : right - used, d = fromLeft ? 1 : -1;
        shape(S, [[x, floor], [x + d * 30, floor], [x + d * (30 + h * 0.4), floor - h * 0.92], [x + d * h * 0.4, floor - h]], pick(S), 0.7, INK, 3, 0.4);
      }
    }
  ground(S, 975, SOFT);
}

/* ---- 8. a long table laid for a supra, the plates empty ---- */
function supra(S: Sketch) {
  // the chairs behind the table, waiting
  for (let k = 0; k < 8; k++) {
    const cx = 210 + k * 225;
    const back = arch(cx - 60, 300, 120, 260);
    tint(S, back, WOOD, 0.45);
    ring(S, back, DARKWOOD, 4, 0.6);
    hole(S, arch(cx - 38, 330, 76, 170), DARKWOOD, 3, 0.4);
  }
  // the cloth, with its hem hanging over the front
  const top: Pt[] = [[110, 540], [1890, 540], [1960, 760], [40, 760]];
  tint(S, top, "#F4E3C8", 0.9);
  ring(S, top, INK, 5, 1);
  const hem: Pt[] = [[40, 760], [1960, 760], [1960, 860], ...Array.from({ length: 33 }, (_, k) => [1960 - k * 60, 860 + (k % 2) * 16] as Pt), [40, 860]];
  tint(S, hem, "#C9392F", 0.5);
  ring(S, hem, INK, 4, 0.6);
  for (let x = 70; x < 1960; x += 60) S.line(x, 770, x, 850, "pencil", "#8E2A22", 2, 0.4);
  for (const lx of [120, 1880]) S.line(lx, 860, lx, 990, "ink", DARKWOOD, 10, 0.6);
  // two rows of empty plates, the back row with glasses
  for (let row = 0; row < 2; row++)
    for (let k = 0; k < 8; k++) {
      const cx = 210 + k * 225 + (row ? 40 : 0), cy = row ? 700 : 590, rx = row ? 74 : 60;
      hole(S, ellipse(cx, cy, rx, rx * 0.32, 28), INK, 4, 0.4);
      S.poly(ellipse(cx, cy, rx * 0.62, rx * 0.2, 24), "pencil", SOFT, 2, 0.3);
      if (!row && k !== 3) S.poly([[cx + 80, cy - 10], [cx + 84, cy - 60], [cx + 108, cy - 60], [cx + 112, cy - 10], [cx + 80, cy - 10]], "ink", INK, 3, 0.3);
    }
  // a clay jug in the gap between the plates, waiting to pour
  const jug: Pt[] = [[975, 640], [955, 600], [960, 530], [985, 490], [980, 460], [1015, 460], [1010, 490], [1035, 530], [1040, 600], [1020, 640]];
  shape(S, jug, "#B5593A", 0.85, INK, 4, 0.6);
  ground(S, 990, SOFT);
}

/* ---- 9. the beach, the sea warm and the sand free ---- */
function beach(S: Sketch) {
  skyBands(S, 0, 2000, 0, 330, ["#EAF2F7", "#DDEBF3"], 10);
  S.circle(1750, 120, 60, "marker", "#F2C14E", 12, 2);
  tint(S, ellipse(1750, 120, 56, 56, 28), "#F7E3A1", 0.9);
  tint(S, below(ridge(0, 2000, 330, () => 0, 6, 31, 20), 560), "#4F8FBF", 0.55);
  for (let k = 0; k < 9; k++) {
    const y = 370 + k * 22;
    for (let x = S.R() * 120; x < 2000; x += 140 + S.R() * 120) S.poly([[x, y], [x + 20, y - 8], [x + 40, y]], "pencil", "#F4EEE0", 3, 0.3);
  }
  // the edge of the water, foamy, and the sand
  const edge = ridge(0, 2000, 560, (x) => 18 * Math.sin(x / 140), 10, 7, 16);
  tint(S, below(edge, 1000), "#EAD3A0", 0.8);
  S.poly(edge, "ink", "#F4EEE0", 8, 1);
  S.poly(edge.map(([x, y]) => [x, y + 6] as Pt), "pencil", "#4F8FBF", 3, 1);
  speckle(S, 0, 600, 2000, 400, 260, "#B08A4E", 3, "pencil");
  // empty towels laid out, an umbrella, a bucket
  for (const [tx, ty, c] of [[230, 700, "#C9392F"], [620, 800, "#2B37D4"], [1000, 690, "#F2C14E"], [1500, 820, "#3E7C6B"]] as [number, number, string][]) {
    const towel: Pt[] = [[tx, ty], [tx + 240, ty - 20], [tx + 270, ty + 90], [tx + 30, ty + 110]];
    tint(S, towel, c, 0.45);
    ring(S, towel, INK, 3, 0.6);
  }
  const ux = 1320;
  S.line(ux, 920, ux + 40, 560, "ink", INK, 6, 0.4);
  const canopy = ellipse(ux + 40, 600, 220, 120, 18, Math.PI, Math.PI * 2);
  for (let k = 0; k < 6; k++) tint(S, [[ux + 40, 600], ...canopy.slice(k * 3, k * 3 + 4)], k % 2 ? "#F4EEE0" : "#E26D3D", 0.85);
  S.poly(canopy, "ink", INK, 4, 0.6);
  S.line(ux - 180, 600, ux + 260, 600, "ink", INK, 3, 0.4);
  shape(S, [[1800, 880], [1810, 960], [1880, 960], [1890, 880]], "#E26D3D", 0.8, INK, 4, 0.4);
  S.poly(ellipse(1845, 880, 45, 20, 12, Math.PI, Math.PI * 2), "ink", INK, 3, 0.3);
}

/* ---- 10. a flower bed of stems, none of them in flower ---- */
function flowerbed(S: Sketch) {
  const soil = 860;
  // the picket fence behind
  for (let x = 30; x < 2000; x += 80) {
    const p: Pt[] = [[x, soil], [x, 560], [x + 25, 530], [x + 50, 560], [x + 50, soil]];
    tint(S, p, "#F4EEE0", 0.6);
    S.poly(p, "pencil", SOFT, 3, 0.6);
  }
  S.line(0, 610, 2000, 610, "pencil", SOFT, 4, 1);
  S.line(0, 790, 2000, 790, "pencil", SOFT, 4, 1);
  tint(S, below(ridge(0, 2000, soil, () => 0, 10, 13, 16), 1000), "#6B4A34", 0.75);
  speckle(S, 0, soil + 20, 2000, 120, 200, "#3A281C", 4, "pencil");
  // the stems, each with leaves and a bare tip
  for (let k = 0; k < 24; k++) {
    const x = 70 + k * 72 + (S.R() - 0.5) * 30, h = 260 + S.R() * 360, lean = (S.R() - 0.5) * 80;
    const stem: Pt[] = Array.from({ length: 10 }, (_, i) => [x + lean * Math.pow(i / 9, 2) + Math.sin(i / 2 + k) * 5, soil - (i / 9) * h] as Pt);
    S.path(stem, "brushpen", "#3E7C6B", 7, () => 0.8);
    for (let i = 2; i < 8; i += 2 + Math.floor(S.R() * 2)) {
      const [lx, ly] = stem[i], d = i % 4 ? 1 : -1;
      shape(S, blob(S, lx + d * 30, ly, 30, 10, 0.15, 14, d * -0.5), "#7FA650", 0.8, "#3E7C6B", 3, 0.3);
    }
    const [tx, ty] = stem[9];
    S.circle(tx, ty, 6, "ink", "#3E7C6B", 4, 0.5);
  }
  // a watering can at the end of the bed
  shape(S, [[1800, 950], [1810, 850], [1920, 850], [1930, 950]], "#6FA8C9", 0.8, INK, 4, 0.6);
  S.poly([[1810, 880], [1730, 820], [1720, 830]], "ink", INK, 6, 0.4);
  S.poly(ellipse(1865, 850, 50, 50, 12, Math.PI, Math.PI * 2), "ink", INK, 4, 0.3);
}

/* ---- 11. a gallery wall of empty frames ---- */
function frames(S: Sketch) {
  tint(S, box(0, 0, 2000, 880), "#E8E0D2", 0.55);
  S.line(0, 50, 2000, 50, "ink", DARKWOOD, 8, 1);
  tint(S, box(0, 880, 2000, 120), WOOD, 0.55);
  for (let x = 0; x < 2040; x += 90) S.line(x, 880, x - 40, 1000, "pencil", DARKWOOD, 2, 0.6);
  // frames of wood, gold and black, each on a cord from the rail
  const layout: [number, number, number, number][] = [
    [90, 170, 300, 380], [450, 130, 260, 220], [450, 420, 260, 220], [780, 160, 420, 520],
    [1270, 120, 240, 300], [1270, 480, 240, 200], [1580, 170, 330, 260], [1580, 490, 330, 220],
  ];
  const woods = ["#B08A4E", "#D4A93C", "#1B1E1D", WOOD];
  layout.forEach(([x, y, w, h], i) => {
    const b = 22 + (i % 3) * 6;
    S.line(x + w / 2, 50, x + w * 0.25, y, "pencil", SOFT, 2, 0.4);
    S.line(x + w / 2, 50, x + w * 0.75, y, "pencil", SOFT, 2, 0.4);
    shape(S, box(x, y, w, h), woods[i % woods.length], 0.8, INK, 4, 0.6);
    hole(S, box(x + b, y + b, w - b * 2, h - b * 2), INK, 3, 0.4);
  });
  // a bench for looking
  shape(S, box(760, 800, 480, 40), DARKWOOD, 0.8, INK, 4, 0.6);
  for (const lx of [790, 1200]) S.line(lx, 840, lx, 950, "ink", INK, 8, 0.4);
}

/* ---- 12. the harbour, boats tied up and nobody aboard ---- */
function harbour(S: Sketch) {
  // a town on the far shore
  for (let x = 0; x < 2000; x += 80 + S.R() * 50) {
    const h = 80 + S.R() * 110, w = 70 + S.R() * 40;
    shape(S, [[x, 470], [x, 470 - h], [x + w / 2, 440 - h], [x + w, 470 - h], [x + w, 470]], pick(S), 0.3, SOFT, 3, 0.6);
    hole(S, box(x + w / 2 - 10, 490 - h, 20, 26), SOFT, 2, 0.3);
  }
  tint(S, box(0, 470, 2000, 530), "#3F7FA8", 0.45);
  for (let k = 0; k < 120; k++) {
    const x = S.R() * 2000, y = 500 + S.R() * 480;
    S.line(x, y, x + 30 + S.R() * 30, y, "pencil", "#F4EEE0", 3, 0.3);
  }
  // the pier along the front, its posts in the water
  tint(S, box(0, 880, 2000, 40), WOOD, 0.85);
  S.rect(0, 880, 2000, 40, "ink", DARKWOOD, 4, 1);
  for (let x = 40; x < 2000; x += 160) S.line(x, 920, x, 1000, "ink", DARKWOOD, 12, 0.6);
  // five boats moored, the decks and the masts bare
  const hulls = ["#C9392F", "#2B37D4", "#F4EEE0", "#3E7C6B", "#F2C14E"];
  for (let i = 0; i < 5; i++) {
    const x = 90 + i * 380, y = 720 + (i % 2) * 40, w = 300;
    shape(S, [[x, y], [x + w, y], [x + w - 40, y + 90], [x + 40, y + 90]], hulls[i], 0.8, INK, 5, 0.6);
    S.line(x + 10, y + 20, x + w - 10, y + 20, "pencil", INK, 3, 0.4);
    if (i % 2) S.line(x + w / 2, y, x + w / 2, y - 360, "ink", DARKWOOD, 6, 0.6);
    else hole(S, box(x + 70, y - 90, 140, 90), INK, 4, 0.6);
    S.poly([[x + w - 30, y + 30], [x + w + 20, 880]], "pencil", SOFT, 2, 2);
  }
  for (const [gx, gy] of [[400, 180], [460, 210], [1300, 140]] as Pt[]) S.poly([[gx, gy], [gx + 18, gy - 10], [gx + 36, gy], [gx + 54, gy - 10], [gx + 72, gy]], "ink", INK, 3, 0.4);
}

/* ---- 13. a café terrace, the chairs free ---- */
function cafe(S: Sketch) {
  // the café behind: a wall, a big window, a door and a striped awning
  tint(S, box(0, 0, 2000, 640), "#E9C9A0", 0.4);
  for (let k = 0; k < 20; k++) tint(S, box(k * 100, 60, 100, 140), k % 2 ? "#F4EEE0" : "#3E7C6B", 0.8);
  S.poly(Array.from({ length: 41 }, (_, k) => [k * 50, 200 + (k % 2) * 24] as Pt), "ink", INK, 4, 0.6);
  S.line(0, 60, 2000, 60, "ink", INK, 4, 0.6);
  hole(S, box(140, 280, 820, 300), INK, 5, 1);
  S.line(550, 280, 550, 580, "ink", INK, 4, 0.6);
  shape(S, box(1100, 270, 200, 370), DARKWOOD, 0.6, INK, 4, 1);
  hole(S, box(1130, 300, 140, 160), INK, 3, 0.4);
  // the menu board, blank
  shape(S, box(1440, 300, 260, 320), "#1B1E1D", 0.85, INK, 4, 1);
  S.line(1480, 620, 1440, 700, "ink", DARKWOOD, 6, 0.4);
  S.line(1660, 620, 1700, 700, "ink", DARKWOOD, 6, 0.4);
  ground(S, 640);
  for (let x = 0; x < 2100; x += 120) S.line(x, 640, x - 80, 1000, "pencil", SOFT, 2, 0.6);
  // round tables, each with two empty chairs
  const chair = (x: number, y: number, d: number) => {
    S.poly([[x, y], [x, y - 150], [x + d * 10, y - 170]], "ink", INK, 5, 0.4);
    S.poly([[x, y - 70], [x + d * 70, y - 70], [x + d * 70, y]], "ink", INK, 5, 0.4);
    S.circle(x + d * 4, y - 120, 12, "pencil", INK, 3, 0.4);
  };
  for (const [tx, ty] of [[300, 900], [800, 830], [1300, 920], [1760, 850]] as Pt[]) {
    chair(tx - 150, ty + 40, 1);
    chair(tx + 150, ty + 40, -1);
    shape(S, ellipse(tx, ty - 140, 110, 30, 28), "#F4EEE0", 0.9, INK, 4, 0.4);
    S.line(tx, ty - 110, tx, ty + 30, "ink", INK, 6, 0.4);
    S.poly([[tx - 50, ty + 40], [tx, ty + 25], [tx + 50, ty + 40]], "ink", INK, 5, 0.4);
  }
}

/* ---- 14. a stage, the curtain up ---- */
function stage(S: Sketch) {
  // the wall at the back and the floor in perspective
  tint(S, box(260, 140, 1480, 560), "#2C2A3A", 0.12);
  const floor: Pt[] = [[260, 700], [1740, 700], [1960, 900], [40, 900]];
  tint(S, floor, WOOD, 0.75);
  ring(S, floor, DARKWOOD, 5, 1);
  for (let k = 1; k < 12; k++) S.line(260 + k * 123, 700, 40 + k * 160, 900, "pencil", DARKWOOD, 2, 0.4);
  tint(S, box(40, 900, 1920, 40), DARKWOOD, 0.9);
  // the footlights
  for (let x = 120; x < 1900; x += 120) {
    S.poly(ellipse(x, 900, 26, 12, 12, Math.PI, Math.PI * 2), "ink", INK, 3, 0.3);
    S.circle(x, 892, 8, "marker", "#F2C14E", 8, 0.5);
  }
  // a pool of light where someone should stand
  S.poly(ellipse(1000, 780, 240, 60, 30), "pencil", "#D4A93C", 4, 1);
  // the curtains, gathered at the sides, and the pelmet
  const curtain = (x0: number, d: number) => {
    const pts: Pt[] = [[x0, 0], [x0 + d * 300, 0], ...Array.from({ length: 12 }, (_, k) => [x0 + d * (300 - Math.sin((k / 11) * Math.PI) * 120 - (k / 11) * 120), (k / 11) * 940] as Pt), [x0, 940]];
    shape(S, pts, "#B23A2E", 0.85, "#6B1F19", 4, 1);
    for (let k = 1; k < 5; k++) S.poly(Array.from({ length: 10 }, (_, i) => [x0 + d * (k * 40 - Math.sin((i / 9) * Math.PI) * 20), (i / 9) * 900] as Pt), "pencil", "#6B1F19", 4, 1);
    S.poly([[x0 + d * 120, 420], [x0 + d * 200, 470]], "ink", "#D4A93C", 12, 0.4);
  };
  curtain(0, 1);
  curtain(2000, -1);
  const pelmet: Pt[] = [[0, 0], [2000, 0], ...Array.from({ length: 21 }, (_, k) => [2000 - k * 100, 110 + (k % 2 ? 40 : 0)] as Pt)];
  shape(S, pelmet, "#B23A2E", 0.9, "#6B1F19", 4, 1);
  S.poly(Array.from({ length: 21 }, (_, k) => [k * 100, 120 + (k % 2 ? 40 : 0)] as Pt), "ink", "#D4A93C", 6, 0.6);
}

/* ---- 15. a pantry shelf of empty jars ---- */
function jars(S: Sketch) {
  tint(S, box(0, 0, 2000, 1000), "#EFE6D6", 0.5);
  for (const y of [330, 640, 950]) {
    tint(S, box(60, y, 1880, 26), WOOD, 0.9);
    S.rect(60, y, 1880, 26, "ink", DARKWOOD, 4, 1);
  }
  const lids = ["#C9392F", "#F2C14E", "#3E7C6B", "#2B37D4", "#A1386B", "#D4A93C"];
  [330, 640, 950].forEach((y, r) => {
    let x = 100 + r * 30, k = 0;
    for (;;) {
      const w = 110 + S.R() * 60, h = 150 + S.R() * 90;
      if (x + w > 1910) break;
      const jar: Pt[] = [[x + 8, y], [x, y - h * 0.15], [x, y - h + 30], [x + 14, y - h + 14], [x + w - 14, y - h + 14], [x + w, y - h + 30], [x + w, y - h * 0.15], [x + w - 8, y]];
      tint(S, jar, "#CFE3E8", 0.35);
      ring(S, jar, INK, 4, 0.4);
      S.line(x + 14, y - h + 40, x + 14, y - 30, "pencil", "#F4EEE0", 6, 0.4);
      shape(S, box(x + 6, y - h - 16, w - 12, 30), lids[(k + r * 2) % lids.length], 0.85, INK, 3, 0.4);
      hole(S, box(x + 18, y - h * 0.62, w - 36, h * 0.3), INK, 2, 0.3);
      x += w + 40 + S.R() * 40;
      k++;
    }
  });
}

/* ---- 16. the Moon, nobody home ---- */
function moon(S: Sketch) {
  tint(S, box(0, 0, 2000, 680), "#1E2A5A", 0.5);
  speckle(S, 0, 0, 2000, 600, 90, "#F4EEE0", 6, "marker");
  // the Earth, up in the black
  const earth = ellipse(1640, 200, 110, 110, 40);
  tint(S, earth, "#4F8FBF", 0.95);
  for (const [cx, cy, r] of [[1600, 170, 40], [1690, 240, 34], [1650, 140, 20]]) tint(S, blob(S, cx, cy, r, r * 0.7, 0.3, 18), "#3E7C6B", 0.95);
  ring(S, earth, "#F4EEE0", 3, 0.4);
  // the ground, grey and cratered
  const edge = ridge(0, 2000, 620, (x) => 40 * Math.sin(x / 300) + 20 * Math.sin(x / 90), 14, 17, 16);
  tint(S, below(edge, 1000), "#B7B4AE", 0.95);
  S.poly(edge, "ink", INK, 5, 1);
  for (let k = 0; k < 16; k++) {
    const cx = S.R() * 2000, cy = 720 + S.R() * 240, r = 30 + S.R() * 80;
    tint(S, ellipse(cx, cy, r, r * 0.3, 24), "#8E8B86", 0.6);
    S.poly(ellipse(cx, cy, r, r * 0.3, 24, Math.PI, Math.PI * 2), "pencil", INK, 3, 0.6);
  }
  // footprints that stop, as if someone went home
  for (let k = 0; k < 9; k++) S.poly(ellipse(200 + k * 70, 900 - k * 18 + (k % 2) * 24, 14, 7, 10), "pencil", INK, 3, 0.4);
}

/* ---- 17. under the field: burrows and empty rooms ---- */
function burrows(S: Sketch) {
  const top = 250;
  skyBands(S, 0, 2000, 0, top, ["#EAF2F7", "#E2EEF2"], 8);
  const grass = ridge(0, 2000, top, (x) => 10 * Math.sin(x / 200), 6, 19, 16);
  tint(S, below(grass, 1000), "#8C6A4A", 0.75);
  speckle(S, 0, top + 20, 2000, 740, 160, "#5A3A26", 5, "pencil");
  S.poly(grass, "ink", "#3E7C6B", 6, 1);
  for (let k = 0; k < 160; k++) {
    const gx = S.R() * 2000;
    S.line(gx, top, gx + (S.R() - 0.5) * 12, top - 12 - S.R() * 20, "pencil", "#3E7C6B", 3, 0.4);
  }
  // a tree, its roots going down
  S.line(1700, top, 1700, 90, "brushpen", DARKWOOD, 26, 0.6);
  shape(S, blob(S, 1700, 80, 160, 70, 0.2, 30), "#3E7C6B", 0.8, "#2F4A3A", 4, 1);
  for (let k = 0; k < 5; k++) S.path(Array.from({ length: 8 }, (_, i) => [1700 + (k - 2) * i * 14 + Math.sin(i) * 8, top + i * 26] as Pt), "brushpen", DARKWOOD, 8, (t) => 0.8 - t * 0.6);
  // rooms dug out of the earth, joined by tunnels
  const rooms: [number, number, number, number][] = [[250, 450, 140, 80], [640, 400, 120, 70], [560, 740, 170, 90], [1000, 580, 150, 80], [1330, 430, 120, 70], [1350, 810, 160, 90], [200, 830, 120, 70], [1760, 680, 130, 80]];
  const tunnels: [number, number][] = [[0, 1], [0, 6], [1, 2], [1, 3], [3, 4], [3, 5], [5, 7], [4, 7]];
  for (const [a, b] of tunnels) {
    const [ax, ay] = rooms[a], [bx, by] = rooms[b];
    const path = bend([ax, ay], [(ax + bx) / 2 + (S.R() - 0.5) * 100, (ay + by) / 2 + (S.R() - 0.5) * 80], [bx, by]);
    S.path(path, "marker", "#E9DCC4", 40, () => 1);
    S.poly(path.map(([x, y]) => [x, y - 22] as Pt), "pencil", DARKWOOD, 3, 1);
    S.poly(path.map(([x, y]) => [x, y + 22] as Pt), "pencil", DARKWOOD, 3, 1);
  }
  for (const [cx, cy, rx, ry] of rooms) hole(S, blob(S, cx, cy, rx, ry, 0.12, 28), DARKWOOD, 4, 0.6);
  // the way in
  S.path([[640, top], [640, 300], [640, 340]], "marker", "#E9DCC4", 40, () => 1);
  S.poly(ellipse(640, top, 40, 14, 16, 0, Math.PI), "ink", DARKWOOD, 4, 0.4);
}

/* ---- 18. a house cut open, every room bare ---- */
function house(S: Sketch) {
  const x0 = 360, x1 = 1640, floors = [300, 520, 740, 940];
  ground(S, 940);
  tint(S, below(ridge(0, 2000, 940, () => 0, 4, 23, 30), 1000), "#7FA650", 0.5);
  // the roof and the attic
  const roof: Pt[] = [[x0 - 60, 300], [1000, 60], [x1 + 60, 300]];
  shape(S, roof, "#B5593A", 0.75, INK, 6, 1);
  hole(S, [[x0 + 60, 290], [1000, 120], [x1 - 60, 290]], INK, 3, 0.6);
  shape(S, box(1380, 80, 70, 140), "#B5593A", 0.8, INK, 4, 0.6);
  // the rooms: the walls stand, the inside is paper
  for (let f = 0; f < 3; f++) {
    const top = floors[f], bot = floors[f + 1];
    tint(S, box(x0, top, x1 - x0, 26), "#8E9096", 0.7);
    const walls = f === 1 ? [x0, 900, x1] : [x0, 780, 1220, x1];
    for (let r = 0; r < walls.length - 1; r++) {
      const a = walls[r] + (r ? 10 : 0), b = walls[r + 1] - 10;
      // each room a different wallpaper, lightly
      tint(S, box(a, top + 26, b - a, bot - top - 26), ["#E9C9A0", "#BFD3C6", "#E9B9A6", "#CFC6E2"][(f + r) % 4], 0.35);
      const ww = 110, wx = (a + b) / 2 - ww / 2;
      hole(S, box(wx, top + 70, ww, 100), INK, 3, 0.4);
      S.line(wx + ww / 2, top + 70, wx + ww / 2, top + 170, "pencil", SOFT, 2, 0.3);
      S.line(wx - 10, top + 176, wx + ww + 10, top + 176, "ink", INK, 4, 0.3);
    }
    for (const wx of walls) S.line(wx, top, wx, bot, "ink", INK, wx === x0 || wx === x1 ? 8 : 5, 0.6);
    S.line(x0, top, x1, top, "ink", INK, 6, 0.6);
  }
  // the stairs up through the middle floor, and the front door
  for (let k = 0; k < 8; k++) S.poly([[900 + k * 30, 740 - k * 27], [930 + k * 30, 740 - k * 27], [930 + k * 30, 740 - (k + 1) * 27]], "ink", DARKWOOD, 4, 0.3);
  shape(S, arch(x1 - 160, 780, 90, 160), DARKWOOD, 0.6, INK, 4, 0.6);
}

/* ---- 19. a zoo of empty pens, every sign blank ---- */
function zoo(S: Sketch) {
  tint(S, box(0, 0, 2000, 1000), "#DDE8C8", 0.35);
  // the path between the two rows
  tint(S, box(0, 470, 2000, 90), "#E4C98E", 0.7);
  S.line(0, 470, 2000, 470, "pencil", SOFT, 3, 1);
  S.line(0, 560, 2000, 560, "pencil", SOFT, 3, 1);
  const pen = (x: number, y: number, w: number, h: number, kind: number) => {
    const floor = ["#7FA650", "#E4C98E", "#9CC6D8", "#7FA650"][kind];
    tint(S, box(x, y, w, h), floor, 0.35);
    if (kind === 2) shape(S, blob(S, x + w * 0.6, y + h * 0.6, w * 0.25, h * 0.18, 0.15, 24), "#4F8FBF", 0.5, INK, 3, 0.4);
    if (kind === 3) {
      S.line(x + w * 0.25, y + h, x + w * 0.25, y + 60, "brushpen", DARKWOOD, 14, 0.6);
      shape(S, blob(S, x + w * 0.25, y + 70, 80, 50, 0.2, 24), "#3E7C6B", 0.6, "#2F4A3A", 3, 0.6);
    }
    // the fence: a rail and bars
    S.line(x, y, x + w, y, "ink", INK, 5, 0.6);
    S.line(x, y + h, x + w, y + h, "ink", INK, 5, 0.6);
    S.line(x, y, x, y + h, "ink", INK, 5, 0.6);
    S.line(x + w, y, x + w, y + h, "ink", INK, 5, 0.6);
    for (let bx = x + 40; bx < x + w; bx += 40) S.line(bx, y + (y < 470 ? h - 60 : 0), bx, y + (y < 470 ? h : 60), "pencil", INK, 3, 0.3);
  };
  const signAt = (x: number, y: number) => {
    S.line(x, y, x, y + 70, "ink", DARKWOOD, 6, 0.3);
    shape(S, box(x - 70, y - 60, 140, 70), "#F4EEE0", 0.95, DARKWOOD, 4, 0.4);
  };
  for (let k = 0; k < 4; k++) {
    pen(40 + k * 490, 60, 440, 380, k);
    signAt(260 + k * 490, 400);
    pen(40 + k * 490, 590, 440, 370, (k + 2) % 4);
    signAt(260 + k * 490, 540);
  }
}

/* ---- 20. the big top, the ring waiting ---- */
function circus(S: Sketch) {
  // the tent's stripes, rising to the pole
  for (let k = 0; k < 16; k++) {
    const x = k * 125;
    tint(S, [[x, 700], [x + 125, 700], [1000 + (x + 125 - 1000) * 0.15, 0], [1000 + (x - 1000) * 0.15, 0]], k % 2 ? "#F4EEE0" : "#C9392F", 0.3);
  }
  S.line(1000, 0, 1000, 640, "ink", INK, 10, 0.6);
  // a trapeze and a rope
  S.line(700, 0, 700, 300, "pencil", INK, 3, 0.4);
  S.line(820, 0, 820, 300, "pencil", INK, 3, 0.4);
  S.line(690, 300, 830, 300, "ink", "#D4A93C", 8, 0.4);
  S.path([[1300, 0], [1305, 200], [1298, 400], [1302, 560]], "pencil", "#8C5A3C", 6, () => 0.7);
  // the stands, rows of empty benches
  for (let r = 0; r < 4; r++) S.poly(ellipse(1000, 760, 980 - r * 10, 230 - r * 50, 60, Math.PI, Math.PI * 2), "pencil", DARKWOOD, 5, 0.6);
  // the ring and two pedestals
  const ringOut = ellipse(1000, 800, 620, 150, 60);
  tint(S, ringOut, "#E4C98E", 0.8);
  S.poly(ringOut, "ink", "#C9392F", 14, 0.6);
  S.poly(ellipse(1000, 800, 590, 135, 60), "ink", "#F4EEE0", 6, 0.4);
  for (const px of [760, 1240]) {
    shape(S, box(px - 60, 700, 120, 90), "#2B37D4", 0.8, INK, 4, 0.4);
    shape(S, ellipse(px, 700, 60, 18, 20), "#F2C14E", 0.95, INK, 4, 0.3);
  }
  // spotlight beams from the top
  for (const [sx, ex] of [[300, 760], [1700, 1240]]) S.poly([[sx, 0], [ex - 70, 690], [ex + 70, 690], [sx, 0]], "pencil", "#D4A93C", 3, 0.6);
}

/* ---- 21. a washing line, only the pegs on it ---- */
function washing(S: Sketch) {
  skyBands(S, 0, 2000, 0, 800, ["#E3EEF6", "#EEF3F2"], 12);
  for (const [cx, cy] of [[400, 140], [1500, 220]] as Pt[]) shape(S, blob(S, cx, cy, 170, 50, 0.25, 30), "#F4EEE0", 0.9, "#9CB3C4", 3, 1);
  const grass = ridge(0, 2000, 840, (x) => 20 * Math.sin(x / 400), 8, 29, 16);
  tint(S, below(grass, 1000), "#7FA650", 0.6);
  S.poly(grass, "ink", "#3E7C6B", 5, 1);
  // the poles, the two lines sagging between them, and the pegs
  for (const px of [120, 1880]) {
    S.line(px, 860, px, 230, "ink", DARKWOOD, 14, 0.6);
    S.line(px - 70, 250, px + 70, 250, "ink", DARKWOOD, 10, 0.4);
  }
  for (const [y, sag] of [[250, 120], [250, 180]] as Pt[]) {
    const x0 = sag === 120 ? 50 : 190, x1 = sag === 120 ? 1810 : 1950;
    const line = bend([x0, y], [(x0 + x1) / 2, y + sag * 2], [x1, y], 30);
    S.poly(line, "pencil", INK, 3, 0.4);
    for (let i = 2; i < 29; i += 2 + Math.floor(S.R() * 2)) {
      const [px, py] = line[i];
      S.line(px, py - 14, px, py + 22, "ink", pick(S), 7, 0.2);
    }
  }
  // a basket on the grass
  const basket: Pt[] = [[820, 960], [800, 880], [1060, 880], [1040, 960]];
  shape(S, basket, "#C98B4E", 0.8, DARKWOOD, 4, 0.6);
  for (let x = 820; x < 1040; x += 30) S.line(x, 880, x + 10, 960, "pencil", DARKWOOD, 2, 0.3);
}

/* ---- 22. the bakery window, its trays empty ---- */
function bakery(S: Sketch) {
  shape(S, box(0, 0, 2000, 1000), "#3E7C6B", 0.55, INK, 4, 0);
  // the sign above, blank
  shape(S, box(500, 40, 1000, 120), "#F4EEE0", 0.95, "#D4A93C", 6, 0.6);
  // the window and the door
  hole(S, box(100, 210, 1400, 680), INK, 8, 1);
  shape(S, box(1600, 210, 300, 790), DARKWOOD, 0.7, INK, 5, 1);
  hole(S, box(1640, 250, 220, 320), INK, 3, 0.4);
  S.circle(1630, 650, 12, "ink", "#D4A93C", 6, 0.4);
  // inside: three shelves of empty trays and a cake stand
  for (const y of [400, 600, 800]) {
    S.line(130, y, 1470, y, "ink", WOOD, 10, 0.6);
    for (let x = 170; x < 1300; x += 320) {
      shape(S, [[x, y - 8], [x + 240, y - 8], [x + 220, y - 30], [x + 20, y - 30]], "#B7B4AE", 0.8, INK, 3, 0.3);
    }
  }
  S.line(800, 290, 800, 380, "ink", INK, 6, 0.3);
  shape(S, ellipse(800, 290, 130, 24, 24), "#F4EEE0", 0.9, INK, 4, 0.3);
  shape(S, ellipse(800, 380, 60, 14, 20), "#F4EEE0", 0.9, INK, 3, 0.3);
  // the striped awning over the sign
  for (let k = 0; k < 10; k++) tint(S, box(500 + k * 100, 160, 100, 30), k % 2 ? "#F4EEE0" : "#C9392F", 0.9);
}

/* ---- 23. the solar system, the planets missing ---- */
function planets(S: Sketch) {
  tint(S, box(0, 0, 2000, 1000), "#1E2A5A", 0.18);
  speckle(S, 0, 0, 2000, 1000, 150, "#3B3F8F", 5, "marker");
  // the sun, half off the sheet
  const sun = ellipse(-60, 500, 300, 300, 60);
  tint(S, sun, "#F2C14E", 0.95);
  S.poly(sun, "ink", "#E26D3D", 6, 1);
  for (let k = 0; k < 14; k++) {
    const a = -Math.PI / 2 + (k / 13) * Math.PI;
    S.line(-60 + Math.cos(a) * 320, 500 + Math.sin(a) * 320, -60 + Math.cos(a) * 380, 500 + Math.sin(a) * 380, "ink", "#E26D3D", 6, 0.4);
  }
  // the orbits, and a small empty ring on each where a world should be
  const radii = [430, 600, 780, 980, 1200, 1450, 1720, 2000];
  radii.forEach((r, i) => {
    S.poly(ellipse(-60, 500, r, r * 0.75, 90, -Math.PI / 2.2, Math.PI / 2.2), "pencil", SOFT, 3, 0.6);
    const a = -0.9 + ((i * 0.53) % 1.8), px = -60 + Math.cos(a) * r, py = 500 + Math.sin(a) * r * 0.75;
    if (px < 1960 && py > 30 && py < 970) {
      hole(S, ellipse(px, py, 34 + i * 4, 34 + i * 4, 24), SOFT, 3, 0.4);
    }
  });
}

/* ---- 24. a wall of screens, all on, all blank ---- */
function screens(S: Sketch) {
  tint(S, box(0, 0, 2000, 1000), "#2C2A3A", 0.12);
  ground(S, 950);
  // old sets stacked in a heap, each a different size, each screen blank and lit
  const sets: [number, number, number, number][] = [
    [80, 640, 360, 310], [460, 700, 300, 250], [780, 600, 420, 350], [1220, 680, 330, 270], [1570, 620, 360, 330],
    [140, 360, 300, 280], [470, 420, 280, 280], [790, 300, 400, 300], [1230, 400, 300, 280], [1560, 330, 300, 290],
    [330, 120, 280, 240], [660, 60, 300, 240], [1000, 70, 280, 230], [1310, 120, 290, 280],
  ];
  const bodies = ["#8C5A3C", "#8E9096", "#C9392F", "#3E7C6B", "#1B1E1D", "#E8C79B"];
  sets.forEach(([x, y, w, h], i) => {
    shape(S, box(x, y, w, h), bodies[i % bodies.length], 0.75, INK, 5, 0.6);
    const sw = w * 0.72, sh = h * 0.72;
    tint(S, box(x + 18, y + 18, sw, sh), "#DDEBF3", 0.9);
    ring(S, box(x + 18, y + 18, sw, sh), INK, 4, 0.4);
    S.circle(x + w - (w - sw - 18) / 2, y + 40, 12, "ink", INK, 4, 0.3);
    S.circle(x + w - (w - sw - 18) / 2, y + 90, 12, "ink", INK, 4, 0.3);
    if (i < 5) S.line(x + 30, y + h, x + 10, y + h + 20, "ink", INK, 5, 0.3);
  });
  // an aerial on top
  S.poly([[1140, 70], [1090, 0]], "ink", INK, 4, 0.3);
  S.poly([[1140, 70], [1200, 0]], "ink", INK, 4, 0.3);
}

/* ---- 25. a snowy hill, nobody on it yet ---- */
function snow(S: Sketch) {
  skyBands(S, 0, 2000, 0, 700, ["#DCE6F0", "#E8EEF4", "#F1EEEA"], 14);
  const far = ridge(0, 2000, 520, (x) => 120 * Math.sin(x / 380 + 1) + 40, 20, 41, 16);
  tint(S, below(far, 1000), "#C9D6E4", 0.8);
  S.poly(far, "pencil", "#6A7FA0", 4, 1);
  const hill = ridge(0, 2000, 700, (x) => 260 * Math.exp(-((x - 1350) ** 2) / 400000) - 80, 10, 43, 16);
  tint(S, below(hill, 1000), "#FBFAF5", 1);
  S.poly(hill, "ink", "#6A7FA0", 5, 1);
  // a few pines, a fence half buried, a house with smoke
  for (const [tx, ty, sc] of [[200, 760, 1], [300, 790, 0.7], [1750, 640, 1.1], [1850, 690, 0.8]]) {
    for (let k = 0; k < 4; k++) shape(S, [[tx - (90 - k * 18) * sc, ty - k * 60 * sc], [tx, ty - (k * 60 + 110) * sc], [tx + (90 - k * 18) * sc, ty - k * 60 * sc]], "#2F4A3A", 0.8, "#2F4A3A", 3, 0.4);
    S.line(tx, ty, tx, ty + 30 * sc, "ink", DARKWOOD, 10 * sc, 0.3);
  }
  for (let x = 500; x < 1000; x += 60) S.line(x, 900 - (x - 500) * 0.1, x, 840 - (x - 500) * 0.1, "ink", DARKWOOD, 6, 0.4);
  S.line(500, 870, 1000, 820, "ink", DARKWOOD, 5, 0.6);
  shape(S, box(1500, 420, 140, 100), "#B5593A", 0.7, INK, 4, 0.6);
  shape(S, [[1480, 425], [1570, 360], [1660, 425]], "#F4EEE0", 0.95, INK, 4, 0.6);
  hole(S, box(1530, 450, 40, 40), INK, 3, 0.3);
  for (let k = 0; k < 5; k++) S.circle(1620 + k * 20, 340 - k * 40, 14 + k * 6, "pencil", SOFT, 3, 2);
  // shadows in the snow
  for (let k = 0; k < 6; k++) {
    const x = 400 + k * 260;
    S.poly(bend([x, 900], [x + 80, 880 - S.R() * 30], [x + 180, 905]), "pencil", "#9CB3C4", 4, 1);
  }
}

/* ---- 26. a pond with lily pads, and nobody in it ---- */
function pond(S: Sketch) {
  tint(S, box(0, 0, 2000, 1000), "#7FA650", 0.35);
  const water = blob(S, 1000, 540, 860, 380, 0.08, 60);
  tint(S, water, "#4F8FBF", 0.5);
  S.poly([...water, water[0]], "ink", "#2B5E8C", 6, 1);
  for (let k = 0; k < 30; k++) {
    const x = 300 + S.R() * 1400, y = 300 + S.R() * 480;
    S.line(x, y, x + 40, y, "pencil", "#F4EEE0", 3, 0.3);
  }
  // lily pads, some with a flower bud
  for (const [lx, ly, r] of [[420, 420, 70], [560, 560, 90], [760, 380, 60], [1200, 650, 100], [1400, 420, 70], [1580, 600, 80], [900, 720, 70]]) {
    const pad = ellipse(lx, ly, r, r * 0.45, 24, 0.3, Math.PI * 2 - 0.1);
    shape(S, [...pad, [lx, ly]], "#3E7C6B", 0.8, "#2F4A3A", 3, 0.4);
  }
  // reeds and stones round the edge, and a log
  for (let k = 0; k < 40; k++) {
    const a = S.R() * Math.PI * 2, x = 1000 + Math.cos(a) * 880, y = 540 + Math.sin(a) * 400;
    S.path([[x, y + 20], [x + (S.R() - 0.5) * 30, y - 80 - S.R() * 80]], "brushpen", "#3E7C6B", 6, () => 0.7);
  }
  for (const [sx, sy] of [[200, 820], [260, 850], [1800, 260], [1850, 300]]) shape(S, blob(S, sx, sy, 50, 30, 0.2, 18), "#8E9096", 0.7, INK, 3, 0.4);
  shape(S, [[1300, 920], [1750, 840], [1770, 890], [1320, 970]], DARKWOOD, 0.7, INK, 4, 0.6);
}

/* ---- 27. the jungle, something hiding ---- */
function jungle(S: Sketch) {
  tint(S, box(0, 0, 2000, 1000), "#BFD9B0", 0.35);
  // trunks at the back
  for (const tx of [380, 900, 1500]) S.line(tx, 1000, tx + 20, 0, "brushpen", "#6B4A34", 50, 0.6);
  // vines hanging down
  for (let k = 0; k < 9; k++) {
    const x = 150 + k * 210;
    S.path(Array.from({ length: 12 }, (_, i) => [x + Math.sin(i / 1.6 + k) * 24, i * (40 + k * 4)] as Pt), "brushpen", "#3E7C6B", 5, () => 0.7);
  }
  // big leaves crowding the edges, a clearing in the middle
  const leaf = (x: number, y: number, len: number, a: number, c: string) => {
    const pts: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, w = Math.sin(t * Math.PI) * len * 0.32;
      pts.push([x + Math.cos(a) * len * t - Math.sin(a) * w, y + Math.sin(a) * len * t + Math.cos(a) * w]);
    }
    for (let i = 12; i >= 0; i--) {
      const t = i / 12, w = -Math.sin(t * Math.PI) * len * 0.32;
      pts.push([x + Math.cos(a) * len * t - Math.sin(a) * w, y + Math.sin(a) * len * t + Math.cos(a) * w]);
    }
    shape(S, pts, c, 0.85, "#2F4A3A", 3, 0.5);
    S.line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, "pencil", "#2F4A3A", 3, 0.3);
  };
  const greens = ["#3E7C6B", "#2F6B5A", "#7FA650", "#4E8B5A"];
  for (let k = 0; k < 44; k++) {
    const side = k % 4;
    const [x, y] = side === 0 ? [S.R() * 300, S.R() * 1000] : side === 1 ? [1700 + S.R() * 300, S.R() * 1000] : side === 2 ? [S.R() * 2000, 850 + S.R() * 150] : [S.R() * 2000, S.R() * 120];
    const a = Math.atan2(500 - y, 1000 - x) + (S.R() - 0.5) * 1.2;
    leaf(x, y, 180 + S.R() * 160, a, greens[k % greens.length]);
  }
  // two eyes in the dark, to start with
  for (const ex of [1560, 1600]) {
    S.circle(ex, 300, 12, "marker", "#F2C14E", 12, 0.4);
    S.circle(ex, 300, 4, "marker", INK, 6, 0.2);
  }
}

/* ---- 28. the Svan towers under the mountains ---- */
function towers(S: Sketch) {
  skyBands(S, 0, 2000, 0, 600, ["#E3EAF2", "#EEF0F2"], 10);
  const peaks = ridge(0, 2000, 520, (x) => 260 * Math.abs(Math.sin(x / 330 + 0.4)) + 60, 20, 47, 14);
  tint(S, below(peaks, 1000), "#8A97B0", 0.75);
  S.poly(peaks, "ink", "#4A5A6E", 5, 1);
  // snow on the tops
  const line = peaks.map(([x, y]) => [x, y < 330 ? y + (330 - y) * 0.6 : y] as Pt);
  tint(S, [...peaks, ...line.reverse()], "#F4EEE0", 0.95);
  const meadow = ridge(0, 2000, 760, (x) => 30 * Math.sin(x / 250), 10, 49, 16);
  tint(S, below(meadow, 1000), "#7FA650", 0.6);
  S.poly(meadow, "ink", "#3E7C6B", 4, 1);
  // the towers: tall, square, a little narrower at the top, each with empty windows
  for (const [tx, h, w] of [[260, 560, 120], [560, 640, 130], [900, 520, 110], [1240, 600, 130], [1600, 540, 120]]) {
    const base = 800 + (tx % 3) * 20, top = base - h;
    const t: Pt[] = [[tx - w / 2, base], [tx - w / 2 + 10, top], [tx + w / 2 - 10, top], [tx + w / 2, base]];
    shape(S, t, "#B8AE9C", 0.9, INK, 5, 0.8);
    shape(S, [[tx - w / 2 + 4, top], [tx, top - 50], [tx + w / 2 - 4, top]], "#6B645A", 0.9, INK, 4, 0.6);
    for (let k = 0; k < 3; k++) hole(S, box(tx - 14, top + 40 + k * (h / 3.4), 28, 46), INK, 3, 0.3);
    speckle(S, tx - w / 2, top, w, h, 24, "#6B645A", 6, "pencil");
    // a low house at the foot
    shape(S, box(tx + w / 2, base - 120, 160, 120), "#B8AE9C", 0.8, INK, 4, 0.6);
    shape(S, [[tx + w / 2 - 10, base - 120], [tx + w / 2 + 80, base - 170], [tx + w / 2 + 170, base - 120]], "#6B645A", 0.8, INK, 4, 0.6);
    hole(S, box(tx + w / 2 + 60, base - 90, 40, 40), INK, 3, 0.3);
  }
}

/* ---- 29. a treasure map, nothing named ---- */
function island(S: Sketch) {
  tint(S, box(0, 0, 2000, 1000), "#E9DCC0", 0.8);
  ring(S, box(30, 30, 1940, 940), DARKWOOD, 6, 1.4);
  // the sea's little waves, and the island
  for (let k = 0; k < 60; k++) {
    const x = 80 + S.R() * 1840, y = 70 + S.R() * 860;
    S.poly([[x, y], [x + 14, y - 8], [x + 28, y], [x + 42, y - 8], [x + 56, y]], "pencil", "#4F8FBF", 3, 0.3);
  }
  const land = blob(S, 1000, 500, 640, 330, 0.18, 60);
  shape(S, land, "#E4C98E", 0.95, DARKWOOD, 5, 1.4);
  S.poly(blob(S, 1000, 500, 680, 370, 0.18, 60), "pencil", "#4F8FBF", 3, 1);
  // hills, a forest, a lake and a dotted way with no end yet
  for (const [hx, hy] of [[760, 380], [840, 360], [920, 390]]) S.poly([[hx - 50, hy + 30], [hx, hy - 30], [hx + 50, hy + 30]], "ink", DARKWOOD, 4, 0.6);
  for (let k = 0; k < 12; k++) {
    const tx = 1150 + (k % 4) * 60 + S.R() * 20, ty = 360 + Math.floor(k / 4) * 60;
    S.circle(tx, ty, 22, "ink", "#3E7C6B", 4, 1);
    S.line(tx, ty + 22, tx, ty + 40, "ink", DARKWOOD, 3, 0.3);
  }
  shape(S, blob(S, 900, 600, 110, 60, 0.2, 24), "#6FA8C9", 0.7, "#2B5E8C", 3, 0.6);
  const way = bend([480, 640], [700, 760], [1050, 680], 18);
  for (let i = 0; i < way.length - 1; i += 2) S.line(way[i][0], way[i][1], way[i + 1][0], way[i + 1][1], "ink", "#C9392F", 5, 0.3);
  // a compass rose and blank scrolls for the names
  S.circle(1750, 820, 70, "ink", DARKWOOD, 4, 0.6);
  S.poly([[1750, 730], [1765, 820], [1750, 910], [1735, 820], [1750, 730]], "ink", DARKWOOD, 4, 0.3);
  S.poly([[1660, 820], [1750, 805], [1840, 820], [1750, 835], [1660, 820]], "ink", DARKWOOD, 4, 0.3);
  for (const [sx, sy] of [[150, 110], [1500, 120], [180, 830]] as Pt[]) hole(S, [[sx, sy], [sx + 260, sy], [sx + 240, sy + 40], [sx + 260, sy + 80], [sx, sy + 80], [sx + 20, sy + 40]], DARKWOOD, 4, 0.6);
}

/* ---- 30. a carousel, nobody riding ---- */
function carousel(S: Sketch) {
  // the canopy, scalloped, and its top
  const roof: Pt[] = [[300, 260], [1000, 60], [1700, 260]];
  for (let k = 0; k < 14; k++) {
    const x = 300 + k * 100;
    tint(S, [[1000, 60], [x, 260], [x + 100, 260]], k % 2 ? "#F4EEE0" : "#A1386B", 0.75);
  }
  ring(S, roof, INK, 5, 0.6);
  S.poly(Array.from({ length: 29 }, (_, k) => [300 + k * 50, 260 + (k % 2) * 40] as Pt), "ink", INK, 4, 0.6);
  S.circle(1000, 40, 20, "ink", "#D4A93C", 8, 0.4);
  for (let x = 330; x < 1700; x += 100) S.circle(x, 280, 8, "marker", "#F2C14E", 8, 0.3);
  // the centre column and the platform
  shape(S, box(930, 300, 140, 520), "#D4A93C", 0.5, INK, 4, 0.6);
  hole(S, box(955, 360, 90, 140), INK, 3, 0.3);
  const deck = ellipse(1000, 830, 760, 110, 60);
  shape(S, deck, "#8C5A3C", 0.75, INK, 5, 0.6);
  S.poly(ellipse(1000, 850, 760, 110, 60, 0, Math.PI), "ink", INK, 4, 0.6);
  // the brass poles, each with nothing on it
  for (let k = 0; k < 9; k++) {
    const a = Math.PI * (0.1 + (k / 8) * 0.8), x = 1000 - Math.cos(a) * 640, y = 820 + Math.sin(a) * 60;
    if (Math.abs(x - 1000) < 90) continue;
    S.line(x, 300, x, y, "ink", "#D4A93C", 10, 0.3);
    for (let t = 340; t < y; t += 40) S.line(x - 5, t, x + 5, t + 14, "pencil", "#8C6A1A", 2, 0.2);
  }
  ground(S, 960, SOFT);
}

/* ---- 31. a stadium, every seat empty ---- */
function stadium(S: Sketch) {
  // the stands, rows of seats in colour blocks
  const seats = ["#C9392F", "#2B37D4", "#F2C14E"];
  for (let r = 0; r < 7; r++) {
    const y = 80 + r * 52;
    tint(S, box(0, y, 2000, 46), "#8E9096", 0.35);
    for (let x = 10 + (r % 2) * 18; x < 2000; x += 36) {
      const c = seats[Math.floor(x / 500) % 3];
      S.poly([[x, y + 40], [x, y + 14], [x + 26, y + 14], [x + 26, y + 40]], "ink", c, 4, 0.2);
    }
  }
  S.line(0, 80, 2000, 80, "ink", INK, 5, 0.6);
  S.line(0, 450, 2000, 450, "ink", INK, 6, 0.6);
  // a blank scoreboard
  shape(S, box(820, 10, 360, 60), "#1B1E1D", 0.9, INK, 4, 0.4);
  // the pitch, its stripes and its lines
  tint(S, box(0, 450, 2000, 550), "#5E9A50", 0.7);
  for (let k = 0; k < 10; k += 2) tint(S, box(k * 200, 450, 200, 550), "#7FA650", 0.5);
  ring(S, box(120, 500, 1760, 460), "#F4EEE0", 6, 0.6);
  S.line(1000, 500, 1000, 960, "ink", "#F4EEE0", 6, 0.4);
  S.poly(ellipse(1000, 730, 130, 80, 40), "ink", "#F4EEE0", 6, 0.4);
  for (const gx of [120, 1880]) {
    const d = gx < 1000 ? 1 : -1;
    S.poly([[gx, 620], [gx + d * 200, 620], [gx + d * 200, 840], [gx, 840]], "ink", "#F4EEE0", 5, 0.4);
    S.poly([[gx, 680], [gx - d * 50, 680], [gx - d * 50, 780], [gx, 780]], "ink", INK, 5, 0.4);
  }
  S.circle(1000, 730, 14, "ink", INK, 4, 0.3);
}

/* ---- 32. a lighthouse over an empty sea ---- */
function lighthouse(S: Sketch) {
  skyBands(S, 0, 2000, 0, 560, ["#D6E0EC", "#E6EBF0", "#EFE6DA"], 12);
  const sea = ridge(0, 2000, 560, () => 0, 4, 53, 30);
  tint(S, below(sea, 1000), "#3F7FA8", 0.6);
  for (let k = 0; k < 90; k++) {
    const x = S.R() * 2000, y = 590 + S.R() * 400;
    S.poly([[x, y], [x + 20, y - 8], [x + 40, y]], "pencil", "#F4EEE0", 3, 0.3);
  }
  // the rocks and the tower on them
  const rocks = [[260, 930, 300, 140], [480, 960, 200, 90], [120, 980, 180, 90]] as [number, number, number, number][];
  for (const [rx, ry, w, h] of rocks) shape(S, blob(S, rx, ry, w, h, 0.25, 20), "#6B645A", 0.85, INK, 4, 1);
  const tower: Pt[] = [[200, 840], [240, 300], [340, 300], [380, 840]];
  shape(S, tower, "#F4EEE0", 0.95, INK, 5, 0.6);
  for (const y of [420, 560, 700]) tint(S, [[200 + ((840 - y) / 540) * 40 - 4, y], [380 - ((840 - y) / 540) * 40 + 4, y], [380 - ((840 - y - 60) / 540) * 40 + 4, y + 60], [200 + ((840 - y - 60) / 540) * 40 - 4, y + 60]], "#C9392F", 0.85);
  shape(S, box(230, 220, 120, 80), "#F2C14E", 0.7, INK, 4, 0.4);
  shape(S, [[220, 220], [290, 160], [360, 220]], "#C9392F", 0.9, INK, 4, 0.4);
  S.line(210, 300, 370, 300, "ink", INK, 6, 0.4);
  // the beam across the water
  S.poly([[350, 240], [1800, 120], [1800, 360], [350, 270]], "pencil", "#D4A93C", 3, 0.6);
  tint(S, [[350, 240], [1800, 120], [1800, 360], [350, 270]], "#F2C14E", 0.15);
}

/* ---- 33. the desert, a long way to go ---- */
function desert(S: Sketch) {
  skyBands(S, 0, 2000, 0, 560, ["#F6E9D2", "#F3DDB8"], 10);
  S.circle(1650, 160, 80, "marker", "#E26D3D", 12, 2);
  tint(S, ellipse(1650, 160, 76, 76, 30), "#F2A65A", 0.8);
  for (const [base, amp, seed, c] of [[560, 90, 55, "#E8C08A"], [700, 120, 57, "#E3B270"], [860, 80, 59, "#D9A25E"]] as [number, number, number, string][]) {
    const dune = ridge(0, 2000, base, (x) => amp * Math.sin(x / (240 + seed) + seed), 6, seed, 16);
    tint(S, below(dune, 1000), c, 0.8);
    S.poly(dune, "pencil", "#8C5A3C", 4, 1);
  }
  // cacti, a skull of rock, and a track running off
  const cactus = (x: number, y: number, h: number) => {
    S.path([[x, y], [x, y - h]], "brushpen", "#3E7C6B", 30, () => 1);
    S.path([[x, y - h * 0.5], [x - 50, y - h * 0.5], [x - 50, y - h * 0.8]], "brushpen", "#3E7C6B", 20, () => 1);
    S.path([[x, y - h * 0.35], [x + 46, y - h * 0.35], [x + 46, y - h * 0.65]], "brushpen", "#3E7C6B", 20, () => 1);
  };
  cactus(300, 820, 260);
  cactus(1500, 760, 200);
  cactus(1780, 900, 300);
  for (let k = 0; k < 14; k++) S.poly(ellipse(700 + k * 70, 950 - k * 22, 12, 6, 10), "pencil", DARKWOOD, 3, 0.3);
}

/* ---- 34. a factory belt with nothing on it ---- */
function factory(S: Sketch) {
  tint(S, box(0, 0, 2000, 1000), "#C8CDD2", 0.35);
  // pipes and dials along the top
  S.line(0, 90, 2000, 90, "ink", "#8E9096", 26, 0.4);
  S.line(0, 150, 1200, 150, "ink", "#B5593A", 18, 0.4);
  for (const x of [300, 900, 1500]) {
    S.circle(x, 220, 50, "ink", INK, 5, 0.4);
    hole(S, ellipse(x, 220, 44, 44, 24), INK, 2, 0.3);
    S.line(x, 220, x + 30, 190, "ink", "#C9392F", 4, 0.2);
    S.line(x, 90, x, 170, "ink", "#8E9096", 10, 0.3);
  }
  // the machine at the start, with its mouth, and the box at the end
  shape(S, box(40, 380, 320, 420), "#3E7C6B", 0.7, INK, 5, 0.6);
  hole(S, box(250, 560, 110, 120), INK, 4, 0.4);
  for (let k = 0; k < 3; k++) S.circle(110 + k * 60, 440, 14, "marker", ["#C9392F", "#F2C14E", "#3E7C6B"][k], 10, 0.3);
  shape(S, [[1680, 640], [1960, 640], [1930, 920], [1710, 920]], "#C98B4E", 0.75, INK, 5, 0.6);
  // the belt running across, its rollers and legs
  shape(S, box(360, 660, 1300, 40), "#3A3A3A", 0.8, INK, 5, 0.4);
  for (let x = 400; x < 1660; x += 70) S.circle(x, 710, 16, "ink", INK, 4, 0.3);
  for (const x of [450, 1000, 1550]) S.line(x, 720, x, 940, "ink", INK, 10, 0.3);
  for (let x = 400; x < 1640; x += 90) S.line(x, 665, x + 20, 695, "pencil", "#8E9096", 3, 0.2);
  ground(S, 940);
}

/* ---- 35. a museum hall, every plinth empty ---- */
function museum(S: Sketch) {
  tint(S, box(0, 0, 2000, 760), "#EAE3D6", 0.5);
  // columns and arches at the back
  for (let k = 0; k < 6; k++) {
    const x = 90 + k * 370;
    shape(S, box(x, 120, 60, 640), "#F4EEE0", 0.95, SOFT, 3, 0.4);
    S.line(x - 14, 120, x + 74, 120, "ink", SOFT, 6, 0.3);
    S.line(x - 14, 760, x + 74, 760, "ink", SOFT, 6, 0.3);
    if (k < 5) S.poly(ellipse(x + 215, 120, 155, 80, 20, Math.PI, Math.PI * 2), "pencil", SOFT, 3, 0.4);
  }
  tint(S, box(0, 760, 2000, 240), "#B7A890", 0.5);
  for (let x = 0; x < 2100; x += 140) S.line(x, 760, x - 100, 1000, "pencil", SOFT, 2, 0.4);
  ground(S, 760, SOFT);
  // the plinths, white, each with a little label
  for (const [px, w, h] of [[260, 200, 260], [700, 160, 340], [1100, 240, 200], [1540, 180, 300]]) {
    const top = 880 - h;
    shape(S, box(px - w / 2, top, w, h), "#F4EEE0", 0.98, INK, 4, 0.4);
    shape(S, box(px - w / 2 - 14, top - 16, w + 28, 16), "#F4EEE0", 0.98, INK, 3, 0.3);
    hole(S, box(px + w / 2 + 20, 760, 70, 40), INK, 2, 0.3);
    // the rope in front
  }
  for (let k = 0; k < 3; k++) {
    const x0 = 430 + k * 420;
    S.line(x0, 960, x0, 860, "ink", "#D4A93C", 6, 0.3);
    S.poly(bend([x0, 870], [x0 + 210, 920], [x0 + 420, 870]), "ink", "#A1386B", 6, 0.4);
  }
  S.line(1690, 960, 1690, 860, "ink", "#D4A93C", 6, 0.3);
}

/* ---- 36. a rack of blank postcards ---- */
function postcards(S: Sketch) {
  // a wire rack turning, three tiers of pockets
  S.line(1000, 60, 1000, 960, "ink", "#8E9096", 10, 0.3);
  S.poly(ellipse(1000, 960, 240, 30, 24), "ink", "#8E9096", 6, 0.4);
  const tints = ["#E9C9A0", "#BFD3C6", "#E9B9A6", "#CFC6E2", "#EAD6A0", "#B9CBDD"];
  for (let r = 0; r < 3; r++) {
    const y = 100 + r * 280;
    S.line(160, y + 230, 1840, y + 230, "ink", "#8E9096", 5, 0.4);
    for (let k = 0; k < 6; k++) {
      const x = 170 + k * 280, tilt = (S.R() - 0.5) * 0.06, w = 250, h = 200;
      const c = Math.cos(tilt), sn = Math.sin(tilt);
      const card: Pt[] = [[0, 0], [w, 0], [w, h], [0, h]].map(([px, py]) => [x + px * c - py * sn, y + 20 + px * sn + py * c] as Pt);
      tint(S, card, tints[(k + r) % tints.length], 0.25);
      hole(S, card.map(([px, py], i) => [px + (i === 0 || i === 3 ? 14 : -14), py + (i < 2 ? 14 : -14)] as Pt), INK, 3, 0.4);
      ring(S, card, INK, 3, 0.4);
      S.line(x - 4, y + 180, x + w + 4, y + 180, "ink", "#8E9096", 4, 0.3);
    }
  }
}

/* ---- 37. a patchwork quilt with empty squares ---- */
function quilt(S: Sketch) {
  const cols = 10, rows = 5, size = 176, x0 = (2000 - cols * size) / 2, y0 = (1000 - rows * size) / 2;
  shape(S, box(x0 - 40, y0 - 40, cols * size + 80, rows * size + 80), "#3B3F8F", 0.6, INK, 5, 1);
  const fabrics = ["#C9392F", "#F2C14E", "#3E7C6B", "#A1386B", "#6FA8C9", "#E26D3D"];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * size, y = y0 + r * size;
      // every third square is patterned, the rest are left for people
      if ((r * cols + c) % 3 === 1) {
        const f = fabrics[(r + c * 2) % fabrics.length];
        tint(S, box(x, y, size, size), f, 0.55);
        const kind = (r + c) % 3;
        if (kind === 0) for (let k = 1; k < 4; k++) S.line(x + 8, y + (k * size) / 4, x + size - 8, y + (k * size) / 4, "pencil", INK, 2, 0.4);
        else if (kind === 1) for (let k = 0; k < 9; k++) S.circle(x + 30 + (k % 3) * 58, y + 30 + Math.floor(k / 3) * 58, 8, "ink", "#F4EEE0", 4, 0.3);
        else S.poly([[x, y], [x + size, y + size]], "pencil", INK, 3, 0.4), S.poly([[x + size, y], [x, y + size]], "pencil", INK, 3, 0.4);
      } else empty(S, box(x, y, size, size));
      // the stitches
      for (let k = 6; k < size; k += 22) S.line(x + k, y + 6, x + k + 10, y + 6, "pencil", SOFT, 2, 0.2);
      ring(S, box(x, y, size, size), INK, 3, 0.3);
    }
}

/* ---- 38. a bus stop, the bus late ---- */
function busstop(S: Sketch) {
  tint(S, box(0, 0, 2000, 780), "#E3E6E2", 0.4);
  // buildings behind
  for (let x = 0; x < 2000; x += 260) {
    const h = 380 + S.R() * 200;
    shape(S, box(x, 780 - h, 240, h), pick(S), 0.18, SOFT, 3, 0.6);
    for (let k = 0; k < 6; k++) hole(S, box(x + 30 + (k % 3) * 66, 780 - h + 40 + Math.floor(k / 3) * 110, 44, 70), SOFT, 2, 0.3);
  }
  // pavement, kerb and road
  tint(S, box(0, 780, 2000, 120), "#B7B4AE", 0.6);
  ground(S, 900);
  tint(S, box(0, 900, 2000, 100), "#5E6B78", 0.6);
  for (let x = 40; x < 2000; x += 220) S.line(x, 955, x + 110, 955, "ink", "#F4EEE0", 8, 0.3);
  // the shelter: glass, a roof, a bench, a timetable with nothing on it
  shape(S, box(560, 400, 860, 30), "#2B37D4", 0.8, INK, 4, 0.4);
  for (const x of [580, 1400]) S.line(x, 430, x, 840, "ink", INK, 8, 0.3);
  tint(S, box(600, 440, 780, 260), "#CFE3E8", 0.35);
  ring(S, box(600, 440, 780, 260), SOFT, 3, 0.4);
  shape(S, box(700, 700, 560, 30), WOOD, 0.85, INK, 4, 0.4);
  for (const x of [740, 1220]) S.line(x, 730, x, 820, "ink", INK, 6, 0.3);
  // the stop's sign
  S.line(1600, 840, 1600, 380, "ink", "#8E9096", 10, 0.3);
  S.circle(1600, 360, 60, "ink", INK, 5, 0.4);
  tint(S, ellipse(1600, 360, 56, 56, 24), "#F2C14E", 0.9);
  hole(S, box(1550, 480, 100, 140), INK, 3, 0.3);
}

/* ---- 39. a park, nobody about yet ---- */
function park(S: Sketch) {
  tint(S, box(0, 0, 2000, 1000), "#BFD9B0", 0.45);
  // paths that cross at a fountain
  const paths = [bend([0, 900], [600, 640], [1000, 560]), bend([2000, 900], [1400, 640], [1000, 560]), bend([1000, 560], [960, 300], [1100, 0])];
  for (const p of paths) S.path(p, "marker", "#E4C98E", 120, () => 1);
  const fountain = ellipse(1000, 560, 200, 70, 40);
  shape(S, fountain, "#9CC6D8", 0.8, INK, 5, 0.6);
  S.poly(ellipse(1000, 560, 230, 85, 40), "ink", "#8E9096", 8, 0.4);
  S.line(1000, 560, 1000, 450, "ink", "#8E9096", 14, 0.3);
  for (const d of [-1, 1]) S.poly(bend([1000, 450], [1000 + d * 60, 380], [1000 + d * 110, 520]), "pencil", "#4F8FBF", 4, 0.4);
  // trees and benches
  for (const [tx, ty, r] of [[200, 300, 150], [520, 200, 120], [1500, 230, 140], [1820, 380, 160], [300, 700, 110]]) {
    S.line(tx, ty + r * 0.6, tx, ty + r * 1.4, "brushpen", DARKWOOD, 20, 0.4);
    shape(S, blob(S, tx, ty, r, r * 0.75, 0.2, 30), "#3E7C6B", 0.7, "#2F4A3A", 4, 1);
  }
  const bench = (x: number, y: number) => {
    shape(S, box(x, y, 220, 22), WOOD, 0.9, INK, 4, 0.3);
    shape(S, box(x, y - 60, 220, 18), WOOD, 0.9, INK, 4, 0.3);
    for (const lx of [x + 20, x + 200]) S.line(lx, y - 60, lx, y + 70, "ink", INK, 6, 0.3);
  };
  bench(560, 820);
  bench(1300, 820);
  bench(1250, 380);
  // a lamp post
  S.line(700, 560, 700, 260, "ink", INK, 8, 0.3);
  S.circle(700, 240, 22, "ink", INK, 4, 0.3);
}

/* ---- 40. an old stone bridge over the river ---- */
function bridge(S: Sketch) {
  skyBands(S, 0, 2000, 0, 520, ["#E6EDF2", "#F0EBE2"], 10);
  // the banks and their houses
  for (const [x0, x1] of [[0, 380], [1620, 2000]]) {
    tint(S, box(x0, 420, x1 - x0, 580), "#B8AE9C", 0.6);
    for (let x = x0; x < x1 - 60; x += 120) {
      const h = 140 + S.R() * 120;
      shape(S, box(x + 10, 420 - h, 100, h), pick(S), 0.3, SOFT, 3, 0.6);
      hole(S, box(x + 40, 450 - h, 40, 50), SOFT, 2, 0.3);
    }
  }
  // the river
  tint(S, box(380, 560, 1240, 440), "#4F8FBF", 0.5);
  for (let k = 0; k < 60; k++) {
    const x = 400 + S.R() * 1200, y = 720 + S.R() * 260;
    S.line(x, y, x + 50, y, "pencil", "#F4EEE0", 3, 0.3);
  }
  // the bridge: the deck, the parapet, three arches
  const deck: Pt[] = [[340, 400], [1660, 400], [1660, 700], [340, 700]];
  tint(S, deck, "#B8AE9C", 0.9);
  for (const [cx, r] of [[640, 170], [1000, 210], [1360, 170]]) {
    const a = [...ellipse(cx, 700, r, r * 1.05, 24, Math.PI, Math.PI * 2)];
    tint(S, [...a, [cx + r, 720], [cx - r, 720]], "#4F8FBF", 0.9);
    S.poly(a, "ink", INK, 5, 0.6);
    for (let k = 1; k < a.length - 1; k += 3) S.line(a[k][0], a[k][1], a[k][0] + (a[k][0] - cx) * 0.18, a[k][1] + (a[k][1] - 700) * 0.18, "pencil", INK, 3, 0.2);
  }
  S.line(340, 400, 1660, 400, "ink", INK, 6, 0.6);
  S.line(340, 330, 1660, 330, "ink", INK, 6, 0.6);
  for (let x = 360; x < 1660; x += 60) S.line(x, 334, x, 396, "pencil", INK, 3, 0.2);
  speckle(S, 340, 420, 1320, 260, 50, "#6B645A", 6, "pencil");
  for (const lx of [500, 1000, 1500]) {
    S.line(lx, 330, lx, 170, "ink", INK, 6, 0.3);
    S.circle(lx, 150, 20, "ink", INK, 4, 0.3);
    S.circle(lx, 150, 12, "marker", "#F2C14E", 10, 0.3);
  }
}

/* ---- 41. a vineyard, the vines tied and bare ---- */
function vineyard(S: Sketch) {
  skyBands(S, 0, 2000, 0, 420, ["#E6EEF4", "#F2EAD8"], 10);
  const hills = ridge(0, 2000, 420, (x) => 70 * Math.sin(x / 300 + 2) + 40, 10, 61, 16);
  tint(S, below(hills, 1000), "#A9B87A", 0.5);
  S.poly(hills, "pencil", "#3E7C6B", 4, 1);
  // a little stone house on the hill
  shape(S, box(1560, 300, 160, 100), "#B8AE9C", 0.85, INK, 4, 0.6);
  shape(S, [[1540, 305], [1640, 250], [1740, 305]], "#B5593A", 0.85, INK, 4, 0.6);
  hole(S, box(1620, 330, 40, 50), INK, 3, 0.3);
  // rows of vines running to the hill, posts and wires
  const vx = 1000, vy = 430;
  for (let r = -6; r <= 6; r++) {
    const bx = 1000 + r * 360;
    for (const w of [0, 50]) S.line(bx, 1000 - w, vx + r * 30, vy + 20 - w * 0.06, "pencil", SOFT, 2, 0.3);
    for (let t = 0.15; t < 1; t += 0.17) {
      const x = bx + (vx + r * 30 - bx) * t, y = 1000 + (vy - 1000) * t, h = 160 * (1 - t) + 18;
      S.line(x, y, x, y - h, "ink", DARKWOOD, Math.max(2, 8 * (1 - t)), 0.2);
      // the bare vine, twisting up and along the wire
      S.path([[x + 6, y], [x + 14 * (1 - t), y - h * 0.4], [x - 6, y - h * 0.7], [x + 30 * (1 - t), y - h * 0.82]], "brushpen", "#6B4A34", Math.max(2, 7 * (1 - t)), () => 0.7);
    }
  }
  // a basket at the end of a row, empty
  shape(S, [[150, 960], [130, 880], [330, 880], [310, 960]], "#C98B4E", 0.8, DARKWOOD, 4, 0.6);
  S.poly(ellipse(230, 880, 100, 50, 16, Math.PI, Math.PI * 2), "ink", DARKWOOD, 5, 0.4);
}

/* ---- 42. a cable car over the valley, every cabin empty ---- */
function cablecar(S: Sketch) {
  skyBands(S, 0, 2000, 0, 600, ["#E3EDF5", "#EEF2F2"], 10);
  // hills on each side and a town in the valley
  const left = below([[0, 180], [200, 200], [420, 320], [620, 560], [800, 760]], 1000);
  const right = below([[1300, 760], [1500, 540], [1700, 380], [1880, 300], [2000, 290]], 1000);
  tint(S, box(0, 760, 2000, 240), "#A9B87A", 0.5);
  for (let x = 640; x < 1360; x += 90) {
    const h = 60 + S.R() * 80;
    shape(S, [[x, 900], [x, 900 - h], [x + 40, 870 - h], [x + 80, 900 - h], [x + 80, 900]], pick(S), 0.35, SOFT, 3, 0.4);
  }
  shape(S, left, "#7FA650", 0.6, "#3E7C6B", 4, 1);
  shape(S, right, "#7FA650", 0.6, "#3E7C6B", 4, 1);
  // the stations at each end
  shape(S, box(80, 100, 200, 110), "#8E9096", 0.8, INK, 4, 0.6);
  shape(S, box(1760, 210, 200, 110), "#8E9096", 0.8, INK, 4, 0.6);
  // the cables, sagging a little, and the cabins on them
  const top = bend([280, 140], [1000, 330], [1760, 250], 30), low = bend([280, 180], [1000, 370], [1760, 290], 30);
  S.poly(top, "ink", INK, 4, 0.3);
  S.poly(low, "pencil", INK, 3, 0.3);
  const colours = ["#C9392F", "#2B37D4", "#F2C14E", "#3E7C6B", "#A1386B"];
  for (let k = 0; k < 5; k++) {
    const [cx, cy] = top[3 + k * 6];
    S.line(cx, cy, cx, cy + 90, "ink", INK, 5, 0.2);
    const cab = box(cx - 80, cy + 90, 160, 130);
    shape(S, cab, colours[k], 0.75, INK, 5, 0.6);
    hole(S, box(cx - 62, cy + 110, 124, 64), INK, 3, 0.3);
    S.line(cx, cy + 110, cx, cy + 174, "pencil", INK, 2, 0.2);
  }
}

/* ---- 43. an orchestra, the chairs empty ---- */
function orchestra(S: Sketch) {
  tint(S, box(0, 0, 2000, 1000), "#2C2A3A", 0.1);
  const floor: Pt[] = [[0, 380], [2000, 380], [2000, 1000], [0, 1000]];
  tint(S, floor, WOOD, 0.45);
  S.line(0, 380, 2000, 380, "ink", DARKWOOD, 5, 0.6);
  // rows of chairs in arcs, each with a stand, facing the podium
  const cx = 1000, cy = 960;
  for (let r = 2; r >= 0; r--) {
    const rx = 400 + r * 260, ry = 190 + r * 120, n = 5 + r * 2, sc = 1.15 - r * 0.15;
    for (let k = 0; k < n; k++) {
      const a = Math.PI * (0.12 + (k / (n - 1)) * 0.76), x = cx - Math.cos(a) * rx, y = cy - Math.sin(a) * ry;
      // the chair: back, seat, legs
      shape(S, box(x - 32 * sc, y - 96 * sc, 64 * sc, 28 * sc), "#1B1E1D", 0.8, INK, 3, 0.2);
      S.line(x - 30 * sc, y - 70 * sc, x - 30 * sc, y - 20 * sc, "ink", INK, 5, 0.2);
      S.line(x + 30 * sc, y - 70 * sc, x + 30 * sc, y - 20 * sc, "ink", INK, 5, 0.2);
      shape(S, box(x - 34 * sc, y - 22 * sc, 68 * sc, 14 * sc), "#1B1E1D", 0.8, INK, 3, 0.2);
      S.line(x - 28 * sc, y - 8 * sc, x - 28 * sc, y + 30 * sc, "ink", INK, 4, 0.2);
      S.line(x + 28 * sc, y - 8 * sc, x + 28 * sc, y + 30 * sc, "ink", INK, 4, 0.2);
      // the stand, in front of the chair, towards the podium
      const sx = x + (cx - x) * 0.12, sy = y + 70 * sc;
      S.line(sx, sy, sx, sy - 80 * sc, "pencil", INK, 3, 0.2);
      shape(S, [[sx - 36 * sc, sy - 80 * sc], [sx + 36 * sc, sy - 80 * sc], [sx + 30 * sc, sy - 120 * sc], [sx - 30 * sc, sy - 120 * sc]], "#8E9096", 0.85, INK, 3, 0.2);
    }
  }
  // the podium at the front, and the piano at the back
  shape(S, ellipse(cx, 960, 110, 30, 24), "#B23A2E", 0.85, INK, 4, 0.4);
  S.line(cx + 40, 960, cx + 40, 870, "pencil", INK, 3, 0.2);
  shape(S, [[200, 360], [200, 230], [420, 210], [520, 260], [520, 360]], "#1B1E1D", 0.85, INK, 4, 0.4);
  for (const lx of [220, 500]) S.line(lx, 360, lx, 420, "ink", INK, 6, 0.2);
}

/* ---- 44. a valley where something big lives ---- */
function valley(S: Sketch) {
  skyBands(S, 0, 2000, 0, 600, ["#F1E4CF", "#EAD9C0"], 10);
  // the volcano, smoking
  const volcano: Pt[] = [[1100, 600], [1400, 200], [1500, 200], [1850, 600]];
  shape(S, volcano, "#7A6A5E", 0.85, INK, 5, 1);
  shape(S, [[1400, 200], [1430, 260], [1460, 230], [1500, 200]], "#E26D3D", 0.9, INK, 3, 0.4);
  for (let k = 0; k < 6; k++) S.circle(1450 + k * 30, 160 - k * 30, 30 + k * 12, "pencil", SOFT, 4, 3);
  const land = ridge(0, 2000, 600, (x) => 30 * Math.sin(x / 260), 10, 67, 16);
  tint(S, below(land, 1000), "#A9B87A", 0.65);
  S.poly(land, "ink", "#3E7C6B", 4, 1);
  // a lake, ferns and tall trees
  shape(S, blob(S, 600, 800, 360, 90, 0.12, 40), "#6FA8C9", 0.7, "#2B5E8C", 4, 0.6);
  const fern = (x: number, y: number, h: number, d: number) => {
    const stem = bend([x, y], [x + d * h * 0.3, y - h * 0.7], [x + d * h * 0.6, y - h * 0.8], 10);
    S.path(stem, "brushpen", "#3E7C6B", 6, () => 0.7);
    for (let i = 1; i < 9; i++) {
      const [px, py] = stem[i], l = 50 * (1 - i / 10);
      S.line(px, py, px - l * 0.6, py - l, "ink", "#3E7C6B", 4, 0.3);
      S.line(px, py, px + l, py - l * 0.3, "ink", "#3E7C6B", 4, 0.3);
    }
  };
  for (const [fx, fy, h, d] of [[100, 980, 300, 1], [260, 990, 240, 1], [1900, 990, 320, -1], [1700, 980, 240, -1], [1200, 990, 200, 1]]) fern(fx, fy, h, d);
  for (const tx of [380, 1020]) {
    S.path([[tx, 700], [tx + 20, 450], [tx + 10, 300]], "brushpen", "#6B4A34", 22, () => 0.9);
    for (let k = 0; k < 6; k++) {
      const a = Math.PI + (k / 5) * Math.PI;
      S.path(bend([tx + 10, 300], [tx + 10 + Math.cos(a) * 120, 260 + Math.sin(a) * 60], [tx + 10 + Math.cos(a) * 200, 330 + Math.sin(a) * 20]), "brushpen", "#3E7C6B", 14, (t) => 0.9 - t * 0.6);
    }
  }
  // a footprint, very big
  shape(S, blob(S, 1450, 880, 70, 40, 0.15, 20), "#7A6A5E", 0.5, INK, 3, 0.4);
  for (let k = 0; k < 3; k++) shape(S, ellipse(1390 + k * 55, 820 - (k === 1 ? 14 : 0), 16, 24, 12), "#7A6A5E", 0.5, INK, 3, 0.3);
}

/* ---- 45. a campfire, the logs free to sit on ---- */
function camp(S: Sketch) {
  skyBands(S, 0, 2000, 0, 640, ["#2C3460", "#3B3F8F", "#6A5A8C"], 14);
  speckle(S, 0, 0, 2000, 420, 70, "#F4EEE0", 6, "marker");
  const trees = ridge(0, 2000, 640, (x) => 60 + 40 * Math.abs(Math.sin(x / 45)), 20, 71, 10);
  tint(S, below(trees, 1000), "#1F3A30", 0.9);
  tint(S, box(0, 700, 2000, 300), "#4E5E3A", 0.8);
  S.line(0, 700, 2000, 700, "ink", "#1F3A30", 6, 1);
  // the fire, its stones and its glow
  S.poly(ellipse(1000, 860, 260, 70, 40), "pencil", "#F2C14E", 8, 1);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    shape(S, blob(S, 1000 + Math.cos(a) * 110, 880 + Math.sin(a) * 30, 26, 16, 0.2, 12), "#8E9096", 0.9, INK, 3, 0.3);
  }
  const flames: [string, number][] = [["#C9392F", 1], ["#E26D3D", 0.75], ["#F2C14E", 0.45]];
  for (const [c, k] of flames) shape(S, [[1000 - 80 * k, 870], [1000 - 60 * k, 760], [1000 - 20 * k, 800], [1000, 640 + (1 - k) * 120], [1000 + 30 * k, 790], [1000 + 70 * k, 740], [1000 + 80 * k, 870]], c, 0.9, c, 3, 0.6);
  // logs to sit on, and two tents
  for (const [lx, ly, w] of [[560, 900, 260], [1300, 920, 280], [880, 975, 240]]) {
    shape(S, box(lx, ly, w, 44), DARKWOOD, 0.85, INK, 4, 0.4);
    S.poly(ellipse(lx + w, ly + 22, 12, 22, 12), "ink", INK, 3, 0.3);
  }
  for (const [tx, c] of [[260, "#E26D3D"], [1700, "#F2C14E"]] as [number, string][]) {
    shape(S, [[tx - 200, 860], [tx, 600], [tx + 200, 860]], c, 0.8, INK, 5, 0.6);
    hole(S, [[tx - 60, 860], [tx, 720], [tx + 60, 860]], INK, 3, 0.4);
  }
}

/* ---- 46. a maze with a way through ---- */
function maze(S: Sketch) {
  const cols = 22, rows = 10, size = 84, x0 = (2000 - cols * size) / 2, y0 = (1000 - rows * size) / 2;
  tint(S, box(x0 - 20, y0 - 20, cols * size + 40, rows * size + 40), "#7FA650", 0.35);
  // a perfect maze: every square reachable from every other, by one way only
  const seen = new Set<number>(), open = new Set<string>();
  const stack = [0];
  seen.add(0);
  while (stack.length) {
    const c = stack[stack.length - 1], x = c % cols, y = Math.floor(c / cols);
    const next = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as Pt[])
      .map(([dx, dy]) => [x + dx, y + dy])
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen.has(ny * cols + nx));
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [nx, ny] = next[Math.floor(S.R() * next.length)], n = ny * cols + nx;
    open.add(`${Math.min(c, n)}-${Math.max(c, n)}`);
    seen.add(n);
    stack.push(n);
  }
  const hedge = "#2F6B5A";
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const c = y * cols + x, px = x0 + x * size, py = y0 + y * size;
      if (x < cols - 1 && !open.has(`${c}-${c + 1}`)) S.line(px + size, py, px + size, py + size, "ink", hedge, 10, 0.4);
      if (y < rows - 1 && !open.has(`${c}-${c + cols}`)) S.line(px, py + size, px + size, py + size, "ink", hedge, 10, 0.4);
    }
  // the outside, open at the entrance (top left) and the way out (bottom right)
  S.line(x0 + size, y0, x0 + cols * size, y0, "ink", hedge, 12, 0.4);
  S.line(x0, y0, x0, y0 + rows * size, "ink", hedge, 12, 0.4);
  S.line(x0, y0 + rows * size, x0 + (cols - 1) * size, y0 + rows * size, "ink", hedge, 12, 0.4);
  S.line(x0 + cols * size, y0, x0 + cols * size, y0 + rows * size, "ink", hedge, 12, 0.4);
  S.poly([[x0 + size / 2, y0 - 60], [x0 + size / 2, y0 - 10], [x0 + size / 2 - 16, y0 - 30], [x0 + size / 2, y0 - 10], [x0 + size / 2 + 16, y0 - 30]], "ink", "#C9392F", 5, 0.3);
}

/* ---- 47. a class photo, every face blank ---- */
function classphoto(S: Sketch) {
  tint(S, box(0, 0, 2000, 1000), "#DCE3EA", 0.4);
  // the steps they stand on
  for (let r = 0; r < 3; r++) shape(S, box(140, 520 + r * 150, 1720, 150), "#B7B4AE", 0.35 + r * 0.1, SOFT, 3, 0.6);
  const clothes = ["#C9392F", "#2B37D4", "#3E7C6B", "#F2C14E", "#A1386B", "#E26D3D", "#6FA8C9", "#8E9096"];
  for (let r = 0; r < 3; r++) {
    const n = 9 - (r === 2 ? 1 : 0), y = 300 + r * 200, gap = 1600 / n;
    for (let k = 0; k < n; k++) {
      const x = 200 + gap / 2 + k * gap + (r === 1 ? gap * 0.1 : 0) + (S.R() - 0.5) * 20;
      // shoulders, then the face, left blank
      const body: Pt[] = [[x - 70, y + 230], [x - 66, y + 140], [x - 30, y + 110], [x + 30, y + 110], [x + 66, y + 140], [x + 70, y + 230]];
      shape(S, body, clothes[(k * 3 + r) % clothes.length], 0.75, INK, 4, 0.6);
      hole(S, ellipse(x, y + 50, 48, 60, 28), INK, 4, 0.6);
    }
  }
  // the board at the front, blank
  shape(S, box(820, 942, 360, 50), "#1B1E1D", 0.85, INK, 4, 0.4);
}

/* ---- 48. a long road and no traffic ---- */
function road(S: Sketch) {
  skyBands(S, 0, 2000, 0, 420, ["#DDE9F2", "#EEF0EC"], 10);
  const far = ridge(0, 2000, 420, (x) => 90 * Math.abs(Math.sin(x / 260 + 1)) + 20, 10, 73, 16);
  tint(S, below(far, 1000), "#9AA7C0", 0.6);
  // fields in strips
  const fields = ["#A9B87A", "#E4C98E", "#7FA650", "#D9B26A"];
  for (let k = 0; k < 6; k++) tint(S, box(0, 440 + k * 95, 2000, 95), fields[k % fields.length], 0.55);
  // the road winding from the front to the hills
  const mid = bend([1000, 1000], [400, 700], [1150, 440], 30);
  mid.forEach(([x, y], i) => {
    if (i === mid.length - 1) return;
    const w = 6 + ((y - 430) / 570) * 220, [nx, ny] = mid[i + 1], nw = 6 + ((ny - 430) / 570) * 220;
    tint(S, [[x - w, y], [x + w, y], [nx + nw, ny], [nx - nw, ny]], "#5E6B78", 0.85);
    if (i % 2 === 0) S.line(x, y, nx, ny, "ink", "#F4EEE0", Math.max(2, w / 18), 0.2);
  });
  // telegraph poles and two blank signs
  for (let k = 0; k < 6; k++) {
    const [x, y] = mid[4 + k * 4], h = 40 + ((y - 430) / 570) * 280, dx = 60 + ((y - 430) / 570) * 260;
    S.line(x + dx, y, x + dx, y - h, "ink", DARKWOOD, Math.max(2, h / 30), 0.2);
    S.line(x + dx - h * 0.15, y - h * 0.9, x + dx + h * 0.15, y - h * 0.9, "ink", DARKWOOD, Math.max(2, h / 50), 0.2);
  }
  for (const [sx, sy] of [[300, 900], [1500, 700]] as Pt[]) {
    S.line(sx, sy, sx, sy - 200, "ink", INK, 8, 0.2);
    shape(S, box(sx - 90, sy - 300, 180, 110), "#3E7C6B", 0.85, INK, 4, 0.4);
    hole(S, box(sx - 74, sy - 284, 148, 78), "#F4EEE0", 2, 0.2);
  }
}

/* ---- 49. a five-tier cake, undecorated ---- */
function cake(S: Sketch) {
  tint(S, box(0, 0, 2000, 1000), "#F3E6EC", 0.4);
  // the table and the stand
  shape(S, box(0, 900, 2000, 100), WOOD, 0.6, DARKWOOD, 4, 0.6);
  shape(S, ellipse(1000, 880, 420, 40, 40), "#F4EEE0", 0.95, INK, 4, 0.4);
  S.line(1000, 880, 1000, 900, "ink", INK, 30, 0.2);
  // the tiers, each a little narrower, plain icing
  const icing = ["#F4E3C8", "#F2D3DA", "#F4EEE0", "#E3EFD9", "#F2D3DA"];
  let y = 870;
  for (let k = 0; k < 5; k++) {
    const w = 360 - k * 62, h = 140 - k * 12;
    shape(S, [[1000 - w, y], [1000 - w, y - h], [1000 + w, y - h], [1000 + w, y]], icing[k], 0.95, INK, 4, 0.4);
    S.poly(ellipse(1000, y - h, w, 22, 40), "ink", INK, 3, 0.3);
    S.poly(ellipse(1000, y, w, 22, 40, 0, Math.PI), "pencil", SOFT, 3, 0.3);
    y -= h;
  }
  // one candle on the top, not yet lit
  S.line(1000, y - 10, 1000, y - 110, "ink", "#2B37D4", 14, 0.2);
  S.line(1000, y - 110, 1000, y - 128, "ink", INK, 3, 0.2);
  // a cake slice server and an empty plate beside it
  shape(S, ellipse(1600, 890, 120, 22, 30), "#F4EEE0", 0.95, INK, 3, 0.3);
  S.poly([[300, 880], [520, 860], [560, 875], [520, 890], [300, 890]], "ink", "#8E9096", 4, 0.3);
}

/* ---- 50. a greenhouse of pots, nothing growing ---- */
function greenhouse(S: Sketch) {
  // the glass house: frame, panes, roof
  const house: Pt[] = [[120, 960], [120, 300], [1000, 60], [1880, 300], [1880, 960]];
  tint(S, house, "#DCEDE8", 0.5);
  ring(S, house, "#F4EEE0", 14, 0.4);
  ring(S, house, INK, 4, 0.6);
  for (let x = 300; x < 1880; x += 180) {
    const top = x < 1000 ? 300 - ((x - 120) / 880) * 240 : 60 + ((x - 1000) / 880) * 240;
    S.line(x, 960, x, top, "ink", "#8E9096", 4, 0.3);
  }
  S.line(120, 300, 1880, 300, "ink", "#8E9096", 4, 0.3);
  S.line(120, 600, 1880, 600, "pencil", "#8E9096", 3, 0.3);
  // two long shelves of pots, each holding only soil
  for (const y of [560, 860]) {
    shape(S, box(160, y, 1680, 24), WOOD, 0.9, DARKWOOD, 4, 0.4);
    for (let x = 200; x < 1780; x += 150 + Math.floor(S.R() * 40)) {
      const w = 90 + S.R() * 30, h = 90 + S.R() * 30;
      shape(S, [[x, y - h], [x + w, y - h], [x + w - 14, y], [x + 14, y]], "#B5593A", 0.85, INK, 4, 0.4);
      shape(S, ellipse(x + w / 2, y - h, w / 2, 12, 16), "#5A3A26", 0.9, INK, 3, 0.3);
    }
  }
  // a watering can on the floor
  shape(S, [[1690, 955], [1700, 905], [1810, 905], [1820, 955]], "#3E7C6B", 0.8, INK, 4, 0.4);
  S.poly([[1700, 920], [1640, 890]], "ink", INK, 6, 0.3);
}

export const MORE: Record<string, (S: Sketch) => void> = {
  shelf, supra, beach, flowerbed, frames, harbour, cafe, stage, jars, moon, burrows,
  house, zoo, circus, washing, bakery, planets, screens, snow, pond, jungle, towers,
  island, carousel, stadium, lighthouse, desert, factory, museum, postcards, quilt, busstop, park,
  bridge, vineyard, cablecar, orchestra, valley, camp, maze, classphoto, road, cake, greenhouse,
};
