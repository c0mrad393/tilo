import { Sketch, type Pt } from "../engine/sketch";
import type { Stroke } from "../engine/stroke";
import { below, blob, ellipse, ridge, sky as skyBands, speckle } from "./art";
import { PAPER, WALL_THEMES } from "./wall";

/* The wall's subjects, drawn: outlines that Claude (an AI) drew in code and that leave room
   on purpose (empty windows, bare branches, an empty sky) for members to fill in by hand. The
   outline says it was drawn by AI; the marks people add are theirs. tilo-api's worker draws
   the same outline into the wall's picture (the same seed gives the same strokes). */

const INK = "#2A2724", SOFT = "#6B645A";
const empty = (S: Sketch, pts: Pt[]) => S.lasso(pts, PAPER);
const box = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const arch = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y + h],
  [x, y + w / 2],
  ...ellipse(x + w / 2, y + w / 2, w / 2, w / 2, 16, Math.PI, Math.PI * 2),
  [x + w, y + h],
];
/** a light coat of colour, laid down the way a wash would be */
const tint = (S: Sketch, pts: Pt[], c: string, a = 0.32) => {
  const was = S.alpha;
  S.alpha = a;
  S.lasso(pts, c);
  S.alpha = was;
};

/* ---- 1. a street of old Tbilisi houses, every window empty ---- */
function street(S: Sketch) {
  const ground = 905;
  const facades = ["#E8C79B", "#BFD3C6", "#E9B9A6", "#CFC6E2", "#EAD6A0", "#B9CBDD"];
  let x = 40;
  let i = 0;
  while (x < 1900) {
    const w = 270 + S.R() * 90, h = 470 + S.R() * 220, top = ground - h;
    const right = Math.min(1960, x + w);
    tint(S, box(x, top, right - x, h), facades[i % facades.length], 0.42);
    S.rect(x, top, right - x, h, "ink", INK, 4, 1.5);
    // a pitched roof or a cornice
    if (i % 2) {
      S.poly([[x - 14, top], [(x + right) / 2, top - 70 - S.R() * 30], [right + 14, top]], "ink", INK, 5, 1.2);
      tint(S, [[x - 14, top], [(x + right) / 2, top - 70], [right + 14, top]], "#B5593A", 0.5);
    } else {
      S.line(x - 12, top - 14, right + 12, top - 14, "ink", INK, 6, 1);
      S.line(x - 4, top - 4, right + 4, top - 4, "pencil", SOFT, 4, 1);
    }
    // the carved wooden balcony on the first floor, with its lattice
    const by = top + h * 0.34, bh = 110;
    tint(S, box(x + 10, by, right - x - 20, bh), "#8C5A3C", 0.38);
    S.rect(x + 10, by, right - x - 20, bh, "ink", "#5A3A26", 4, 1);
    for (let lx = x + 26; lx < right - 20; lx += 22) S.line(lx, by + bh * 0.45, lx, by + bh, "pencil", "#5A3A26", 3, 0.6);
    S.line(x + 10, by + bh * 0.45, right - 10, by + bh * 0.45, "ink", "#5A3A26", 3, 0.6);
    // empty windows: tall arches above the balcony, squares on it, and a row below
    const cols = Math.max(2, Math.round((right - x) / 110));
    const ww = ((right - x) - 30 * (cols + 1)) / cols;
    for (let c = 0; c < cols; c++) {
      const wx = x + 30 + c * (ww + 30);
      const up = arch(wx, top + 40, ww, Math.min(150, by - top - 60));
      empty(S, up);
      S.poly([...up, up[0]], "ink", INK, 4, 0.8);
      const low = box(wx, by + bh + 50, ww, 120);
      empty(S, low);
      S.poly([...low, low[0]], "ink", INK, 4, 0.8);
      S.line(wx + ww / 2, by + bh + 50, wx + ww / 2, by + bh + 170, "pencil", SOFT, 2, 0.4);
    }
    // a door, ajar
    const dw = 70, dx = x + (right - x) / 2 - dw / 2;
    S.poly(arch(dx, ground - 170, dw, 170), "ink", INK, 4, 1);
    x = right + 6;
    i++;
  }
  S.line(0, ground, 2000, ground, "ink", INK, 6, 2);
  // cobbles
  for (let k = 0; k < 70; k++) {
    const cx = S.R() * 2000, cy = ground + 20 + S.R() * 75;
    S.poly(ellipse(cx, cy, 14 + S.R() * 10, 6 + S.R() * 4, 10), "pencil", SOFT, 2, 0.6);
  }
  // a street lamp and a vine climbing one house
  S.line(1000, ground, 1000, 560, "ink", INK, 6, 0.6);
  S.circle(1000, 540, 22, "ink", INK, 4);
  S.circle(1000, 540, 14, "marker", "#F2C14E", 10);
  const vine: Pt[] = Array.from({ length: 30 }, (_, k) => [300 + Math.sin(k / 2.5) * 18, ground - k * 18]);
  S.poly(vine, "ink", "#3E7C6B", 4, 1);
  for (let k = 3; k < 30; k += 3) S.poly(blob(S, vine[k][0] + 14, vine[k][1], 14, 8, 0.2, 10), "ink", "#3E7C6B", 3, 0.4);
}

/* ---- 2. one big tree, its branches bare ---- */
function tree(S: Sketch) {
  const ground = 960;
  S.poly(ridge(0, 2000, ground, () => 0, 10, 5), "ink", "#3E7C6B", 5, 1);
  for (let k = 0; k < 140; k++) {
    const gx = S.R() * 2000;
    S.line(gx, ground + 4, gx + (S.R() - 0.5) * 10, ground - 10 - S.R() * 16, "pencil", "#3E7C6B", 2, 0.4);
  }
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    const pts: Pt[] = [];
    let cx = x, cy = y, ca = a;
    for (let k = 0; k <= 8; k++) {
      pts.push([cx, cy]);
      ca += (S.R() - 0.5) * 0.16;
      cx += Math.cos(ca) * (len / 8);
      cy += Math.sin(ca) * (len / 8);
    }
    S.path(pts, "brushpen", "#4A3426", w, (t) => 0.9 - t * 0.4);
    if (depth === 0 || w < 2) return;
    const n = depth > 3 ? 2 : 2 + (S.R() > 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const spread = 0.45 + S.R() * 0.4;
      branch(cx, cy, ca + (k - (n - 1) / 2) * spread * 1.3, len * (0.62 + S.R() * 0.1), w * 0.66, depth - 1);
    }
  };
  // the trunk, a little wider at its foot, with its bark
  const trunk: Pt[] = [[930, ground + 4], [962, 820], [972, 700], [968, 600], [1032, 600], [1030, 700], [1040, 820], [1074, ground + 4]];
  tint(S, trunk, "#6B4A34", 0.85);
  S.poly([...trunk.slice(0, 4)], "brushpen", "#4A3426", 6, 1);
  S.poly([...trunk.slice(4)], "brushpen", "#4A3426", 6, 1);
  for (let k = 0; k < 7; k++) {
    const bx = 978 + k * 8;
    S.poly([[bx, ground - 20 - S.R() * 40], [bx + (S.R() - 0.5) * 8, 760 - S.R() * 80]], "pencil", "#3A281C", 2, 1);
  }
  branch(975, 610, -Math.PI / 2 - 0.75, 190, 24, 5);
  branch(1025, 610, -Math.PI / 2 + 0.75, 200, 24, 5);
  branch(1000, 605, -Math.PI / 2 - 0.08, 170, 22, 5);
  branch(985, 700, Math.PI + 0.35, 210, 16, 4);
  branch(1015, 690, -0.3, 220, 16, 4);
  // a swing waiting under one branch, and one bird to start with
  S.line(1290, 455, 1290, 800, "pencil", INK, 3, 0.4);
  S.line(1400, 470, 1400, 800, "pencil", INK, 3, 0.4);
  S.line(1270, 800, 1420, 800, "ink", "#8C5A3C", 10, 0.6);
  S.poly([[600, 300], [625, 288], [650, 300]], "ink", INK, 4, 0.6);
  S.poly([[650, 300], [675, 288], [700, 300]], "ink", INK, 4, 0.6);
}

/* ---- 3. an aquarium with one fish in it ---- */
function aquarium(S: Sketch) {
  const tank: Pt[] = box(70, 70, 1860, 880);
  tint(S, tank, "#9CC6D8", 0.22);
  S.poly([...tank, tank[0]], "ink", INK, 6, 1.2);
  S.poly(box(56, 56, 1888, 908).concat([[56, 56]]), "pencil", SOFT, 3, 1);
  // the water line
  S.poly(Array.from({ length: 60 }, (_, k) => [70 + k * 31.6, 150 + Math.sin(k / 2) * 6] as Pt), "ink", "#2B5E8C", 4, 0.6);
  // sand, stones and weed
  const sand = below(ridge(70, 1930, 860, (x) => 30 * Math.sin(x / 300), 14, 9, 20), 950);
  tint(S, sand, "#E4C98E", 0.75);
  speckle(S, 80, 870, 1840, 70, 220, "#B08A4E", 3, "pencil");
  for (const [sx, r] of [[340, 46], [400, 30], [1500, 58], [1580, 34]] as [number, number][]) {
    const st = blob(S, sx, 870, r, r * 0.62, 0.18, 24);
    tint(S, st, "#8E9096", 0.7);
    S.poly([...st, st[0]], "ink", INK, 3, 0.6);
  }
  for (const wx of [200, 260, 760, 1180, 1240, 1760, 1830]) {
    const h = 260 + S.R() * 260;
    S.poly(Array.from({ length: 24 }, (_, k) => [wx + Math.sin(k / 2.4 + wx) * 22, 880 - (k / 23) * h] as Pt), "brushpen", "#3E7C6B", 8, 1);
  }
  // a little chest, shut
  S.rect(960, 770, 150, 100, "ink", "#5A3A26", 5, 1);
  tint(S, box(960, 770, 150, 100), "#8C5A3C", 0.5);
  S.line(960, 805, 1110, 805, "ink", "#5A3A26", 4, 0.5);
  // bubbles
  for (let k = 0; k < 9; k++) S.circle(1036 + Math.sin(k) * 14, 740 - k * 62, 6 + k * 1.4, "pencil", "#2B5E8C", 3, 1);
  // the one fish
  const fish = ellipse(1420, 420, 60, 32, 24);
  tint(S, fish, "#E26D3D", 0.9);
  S.poly([...fish, fish[0]], "ink", INK, 4, 0.5);
  S.poly([[1480, 420], [1530, 390], [1525, 450], [1480, 420]], "ink", INK, 4, 0.5);
  tint(S, [[1480, 420], [1530, 390], [1525, 450]], "#E26D3D", 0.9);
  S.circle(1385, 410, 5, "marker", INK, 8);
}

/* ---- 4. a night market: the stalls are up, the tables bare ---- */
function market(S: Sketch) {
  const ground = 920;
  S.line(0, ground, 2000, ground, "ink", INK, 6, 2);
  // a string of lights across the top
  const wire: Pt[] = Array.from({ length: 41 }, (_, k) => [k * 50, 70 + Math.sin((k / 40) * Math.PI * 3) * 26 + 26] as Pt);
  S.poly(wire, "pencil", INK, 3, 0.6);
  for (let k = 1; k < 40; k += 2) {
    S.circle(wire[k][0], wire[k][1] + 18, 10, "marker", "#F2C14E", 12, 1);
    S.circle(wire[k][0], wire[k][1] + 18, 12, "pencil", INK, 2, 1);
  }
  const awnings = [["#C9392F", PAPER], ["#2B37D4", PAPER], ["#3E7C6B", "#F2C14E"], ["#A1386B", PAPER], ["#E26D3D", PAPER]];
  for (let i = 0; i < 5; i++) {
    const x = 40 + i * 392, w = 340, top = 300 + (i % 2) * 30;
    // posts
    S.line(x + 10, top, x + 10, ground, "ink", "#5A3A26", 8, 0.6);
    S.line(x + w - 10, top, x + w - 10, ground, "ink", "#5A3A26", 8, 0.6);
    // the striped awning, scalloped at its edge
    const stripes = 8;
    for (let k = 0; k < stripes; k++) {
      const sx = x - 10 + (k * (w + 20)) / stripes, ex = x - 10 + ((k + 1) * (w + 20)) / stripes;
      tint(S, [[sx + 8, top - 90], [ex + 8, top - 90], [ex, top], [sx, top]], awnings[i][k % 2], 0.85);
    }
    S.poly([[x - 2, top - 90], [x + w + 18, top - 90], [x + w + 10, top], [x - 10, top], [x - 2, top - 90]], "ink", INK, 4, 0.8);
    S.poly(Array.from({ length: stripes * 4 + 1 }, (_, k) => [x - 10 + (k * (w + 20)) / (stripes * 4), top + (k % 4 === 2 ? 18 : k % 2 ? 12 : 0)] as Pt), "ink", INK, 3, 0.5);
    // the bare table and empty crates under it
    S.rect(x + 20, 620, w - 40, 26, "ink", "#5A3A26", 5, 1);
    tint(S, box(x + 20, 620, w - 40, 26), "#8C5A3C", 0.6);
    S.line(x + 40, 646, x + 40, ground, "ink", "#5A3A26", 5, 0.5);
    S.line(x + w - 40, 646, x + w - 40, ground, "ink", "#5A3A26", 5, 0.5);
    for (let c = 0; c < 2; c++) {
      const cx = x + 60 + c * 120, cy = 800;
      S.rect(cx, cy, 100, 70, "pencil", "#8C5A3C", 4, 1);
      S.line(cx, cy + 35, cx + 100, cy + 35, "pencil", "#8C5A3C", 3, 0.4);
    }
    // a blank price board
    S.rect(x + w / 2 - 50, 500, 100, 70, "ink", INK, 3, 1);
    empty(S, box(x + w / 2 - 50, 500, 100, 70));
    S.line(x + w / 2, top, x + w / 2, 500, "pencil", SOFT, 2, 0.3);
  }
}

/* ---- 5. a long train, every seat free ---- */
function train(S: Sketch) {
  const rail = 860;
  // hills behind, and the rails
  S.poly(ridge(0, 2000, 520, (x) => 90 * Math.sin(x / 260) + 60, 20, 11), "pencil", "#3E7C6B", 4, 1);
  for (let x = 0; x < 2000; x += 40) S.line(x, rail + 22, x + 22, rail + 40, "ink", "#5A3A26", 6, 0.4);
  S.line(0, rail + 14, 2000, rail + 14, "ink", INK, 5, 0.6);
  S.line(0, rail + 30, 2000, rail + 30, "ink", INK, 4, 0.6);
  const colours = ["#2B37D4", "#C9392F", "#3E7C6B", "#A1386B"];
  // the engine, at the front, with its smoke
  const ex = 1650;
  tint(S, box(ex, 600, 300, 240), "#1B1E1D", 0.75);
  S.rect(ex, 600, 300, 240, "ink", INK, 5, 1);
  S.rect(ex + 30, 480, 110, 120, "ink", INK, 5, 1);
  tint(S, box(ex + 30, 480, 110, 120), "#1B1E1D", 0.75);
  empty(S, box(ex + 50, 500, 70, 70));
  S.rect(ex + 50, 500, 70, 70, "ink", INK, 3, 0.6);
  S.rect(ex + 210, 520, 40, 80, "ink", INK, 5, 0.6);
  for (let k = 0; k < 6; k++) S.circle(ex + 230 - k * 40, 470 - k * 46, 20 + k * 9, "pencil", SOFT, 3, 3);
  for (const wx of [ex + 60, ex + 200]) S.circle(wx, rail - 6, 34, "ink", INK, 6, 1);
  // four carriages, each window empty
  for (let i = 0; i < 4; i++) {
    const x = 40 + i * 400, w = 370, top = 590;
    tint(S, box(x, top, w, 250), colours[i], 0.3);
    S.rect(x, top, w, 250, "ink", INK, 5, 1);
    S.line(x - 8, top - 6, x + w + 8, top - 6, "ink", INK, 6, 0.6);
    for (let k = 0; k < 4; k++) {
      const wx = x + 22 + k * 88;
      empty(S, box(wx, top + 34, 68, 92));
      S.rect(wx, top + 34, 68, 92, "ink", INK, 3, 0.6);
    }
    S.line(x + 10, top + 170, x + w - 10, top + 170, "pencil", INK, 3, 0.6);
    for (const wx of [x + 70, x + w - 70]) S.circle(wx, rail - 6, 30, "ink", INK, 6, 1);
    if (i < 3) S.line(x + w, 800, x + w + 30, 800, "ink", INK, 6, 0.4);
  }
  S.line(1600, 800, 1650, 800, "ink", INK, 6, 0.4);
}

/* ---- 6. the city at dusk, under an empty sky ---- */
function sky(S: Sketch) {
  // the evening, faint at the top, warmer down at the hills
  skyBands(S, 0, 2000, 0, 800, ["#EEF2F6", "#E8EDF4", "#F3E6D6", "#F6DCC0"], 20);
  S.circle(1700, 190, 70, "marker", "#F2C14E", 12, 2);
  const moon = ellipse(1700, 190, 64, 64, 32);
  tint(S, moon, "#F7E3A1", 0.9);
  // the hill with the old fortress, and the roofs below it
  const hill = below(ridge(0, 2000, 800, (x) => 150 * Math.exp(-((x - 520) ** 2) / 90000) + 30 * Math.sin(x / 180), 12, 21, 16), 1000);
  tint(S, hill, "#6A6E8C", 0.8);
  const fort: Pt[] = [[380, 660], [380, 600], [410, 600], [410, 625], [450, 625], [450, 580], [480, 580], [480, 625], [540, 625], [540, 600], [570, 600], [570, 660]];
  tint(S, [...fort, [570, 680], [380, 680]], "#4A4E6A", 0.95);
  // a church with its pointed dome, a tower, and rows of roofs
  tint(S, [[1180, 860], [1180, 740], [1215, 700], [1215, 650], [1240, 600], [1265, 650], [1265, 700], [1300, 740], [1300, 860]], "#4A4E6A", 0.95);
  tint(S, [[1500, 860], [1500, 580], [1515, 450], [1530, 580], [1530, 860]], "#4A4E6A", 0.95);
  for (let x = 0; x < 2000; x += 70 + S.R() * 40) {
    const h = 40 + S.R() * 70, y = 900 - h;
    tint(S, [[x, 1000], [x, y], [x + 40, y - 30], [x + 80, y], [x + 80, 1000]], "#3A3E58", 0.9);
    for (let k = 0; k < 2; k++) if (S.R() > 0.4) S.lasso(box(x + 14 + k * 30, y + 20, 14, 18), "#F2C14E");
  }
  // three stars to begin with
  for (const [sx, sy] of [[300, 140], [820, 90], [1260, 220]] as Pt[]) {
    S.line(sx - 12, sy, sx + 12, sy, "ink", SOFT, 3, 0.2);
    S.line(sx, sy - 12, sx, sy + 12, "ink", SOFT, 3, 0.2);
  }
}

const DRAW: Record<string, (S: Sketch) => void> = { street, tree, aquarium, market, train, sky };

const drawn = new Map<string, Stroke[]>();
/** a subject's outline, drawn once; the same seed gives every viewer and the server the same strokes */
export function outline(id: string): Stroke[] {
  let s = drawn.get(id);
  if (!s) {
    const i = Math.max(0, WALL_THEMES.findIndex((t) => t.id === id));
    const S = new Sketch(4100 + i * 31);
    DRAW[WALL_THEMES[i].id](S);
    drawn.set(id, (s = S.strokes));
  }
  return s;
}
