import type { Sketch, Pt } from "../engine/sketch";
import type { ToolId } from "../engine/stroke";
import { crossings, ellipse } from "./art";
import { blank, inEllipse, lay, outline, set, type Grid } from "./pixel-art";

/* Drawings in a child's hand, for the schools demo. Claude, an AI, made them in code with
   the studio's own tools, the way a pupil draws: the outlines first, then colouring in back
   and forth with felt tips, going over the lines here and there. Each one replays like a
   pupil's recording. Every generator takes a seeded Sketch, so each pupil's version differs. */

export const CRAYON = {
  red: "#E0392B", orange: "#F2861E", yellow: "#F6CB2C", lime: "#8CC63F", green: "#2E9B47", teal: "#1F8A8A",
  sky: "#5DB7EE", blue: "#2C64D4", navy: "#22306E", purple: "#7A4BC4", pink: "#EF79AE", brown: "#8A5530",
  tan: "#D9A867", skin: "#F3C7A0", grey: "#8E9196", black: "#232323", white: "#FFFFFF",
};
const C = CRAYON;

const pick = <T,>(S: Sketch, a: readonly T[]) => a[Math.floor(S.R() * a.length) % a.length];
const between = (S: Sketch, a: number, b: number) => a + S.R() * (b - a);

interface Hand {
  /** how much the line wanders */
  wob: number;
  /** how far colouring goes over the line, in brush widths */
  over: number;
  /** the felt tip's width */
  tip: number;
}
/** A pupil's hand: younger hands wobble more and colour further over the lines. */
const handOf = (S: Sketch, age: "young" | "older"): Hand =>
  age === "young" ? { wob: between(S, 2.5, 4.5), over: between(S, 0.4, 0.9), tip: between(S, 13, 18) } : { wob: between(S, 1.4, 2.4), over: between(S, 0.1, 0.35), tip: between(S, 11, 15) };

/** A line around a shape, closed, with the hand's wobble. */
function line(S: Sketch, h: Hand, poly: Pt[], c = C.black, w = 5, tool: ToolId = "brushpen", closed = true) {
  return S.poly(closed ? [...poly, poly[0]] : poly, tool, c, w, h.wob, 12);
}

/** Colours a shape in back and forth, a few rows to a stroke, the way a felt tip is used. */
function colourIn(S: Sketch, h: Hand, poly: Pt[], c: string, o: { tool?: ToolId; w?: number; gap?: number; angle?: number; rows?: number } = {}) {
  const tool = o.tool ?? "marker", w = o.w ?? h.tip, gap = o.gap ?? w * 1.5, angle = o.angle ?? (S.R() - 0.5) * 0.9, rows = o.rows ?? 10;
  const co = Math.cos(-angle), si = Math.sin(-angle);
  const rot = poly.map(([x, y]) => [x * co - y * si, x * si + y * co] as Pt);
  const back = (x: number, y: number): Pt => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
  const ys = rot.map((p) => p[1]);
  let pts: Pt[] = [];
  let side = 0, prev = NaN;
  const flush = () => {
    if (pts.length > 1) S.poly(pts, tool, c, w, h.wob * 0.6, 40);
    pts = pts.length ? [pts[pts.length - 1]] : [];
  };
  for (let y = Math.min(...ys) + w * 0.3; y < Math.max(...ys) - w * 0.2; y += gap * 0.5 * (0.8 + S.R() * 0.4)) {
    const xs = crossings(rot, y);
    if (xs.length < 2) continue;
    // the widest span at this height, so a hollow shape isn't joined across its gap
    let a = xs[0], b = xs[1];
    for (let i = 2; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > b - a) (a = xs[i]), (b = xs[i + 1]);
    const slip = () => (S.R() * (1 + h.over) - 0.6) * w;
    const x = side ? b + slip() : a - slip();
    if (!Number.isNaN(prev) && Math.abs(x - prev) > (b - a) * 1.6 + w * 4) {
      flush();
      pts = [];
    }
    pts.push(back(x, y));
    prev = x;
    side ^= 1;
    if (pts.length > rows) flush();
  }
  flush();
}

const rect = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const tri = (a: Pt, b: Pt, c: Pt): Pt[] => [a, b, c];
/** a cloud: bumps along the top, flat-ish underneath */
function cloud(cx: number, cy: number, w: number, h: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const top = Math.sin(a) < 0;
    const r = top ? 1 + 0.16 * Math.abs(Math.sin(a * 3.5)) : 0.9;
    pts.push([cx + Math.cos(a) * w * 0.5 * r, cy + Math.sin(a) * h * 0.5 * r * (top ? 1 : 0.6)]);
  }
  return pts;
}
function star(cx: number, cy: number, r: number, turn = 0): Pt[] {
  return Array.from({ length: 10 }, (_, i) => {
    const a = turn - Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as Pt;
  });
}

function sun(S: Sketch, h: Hand, cx: number, cy: number, r: number, face: boolean) {
  line(S, h, ellipse(cx, cy, r, r, 30), C.orange, 6, "marker");
  colourIn(S, h, ellipse(cx, cy, r * 0.95, r * 0.95, 30), C.yellow);
  const n = 8 + Math.floor(S.R() * 5), a0 = S.R();
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2, r1 = r + 22, r2 = r + between(S, 60, 110);
    S.line(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2, "marker", i % 2 ? C.orange : C.yellow, h.tip * 0.7, h.wob);
  }
  if (face) {
    S.path([[cx - r * 0.35, cy - r * 0.2], [cx - r * 0.35 + 1, cy - r * 0.2 + 1]], "brushpen", C.black, 9);
    S.path([[cx + r * 0.35, cy - r * 0.2], [cx + r * 0.35 + 1, cy - r * 0.2 + 1]], "brushpen", C.black, 9);
    S.poly(ellipse(cx, cy + r * 0.05, r * 0.45, r * 0.4, 12, 0.5, Math.PI - 0.5), "brushpen", C.black, 5, h.wob);
  }
}

function flower(S: Sketch, h: Hand, x: number, y: number, size: number, petal: string) {
  S.poly([[x, y], [x + between(S, -10, 10), y - size * 1.6]], "marker", C.green, h.tip * 0.6, h.wob, 14);
  const fy = y - size * 1.6;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + S.R() * 0.3;
    const px = x + Math.cos(a) * size * 0.55, py = fy + Math.sin(a) * size * 0.55;
    colourIn(S, h, ellipse(px, py, size * 0.42, size * 0.42, 16), petal, { w: h.tip * 0.7, rows: 30 });
  }
  colourIn(S, h, ellipse(x, fy, size * 0.3, size * 0.3, 14), C.yellow, { w: h.tip * 0.6, rows: 30 });
}

function grass(S: Sketch, h: Hand, top: number, colour = C.green) {
  colourIn(S, h, [[-20, top], [1620, top + between(S, -20, 20)], [1620, 1220], [-20, 1220]], colour, { w: h.tip * 1.3, angle: between(S, -0.2, 0.2) });
  for (let x = 20 + S.R() * 40; x < 1600; x += between(S, 40, 110)) {
    const y = top + between(S, -6, 10);
    S.poly([[x - 12, y - 4], [x, y - 34], [x + 8, y - 2], [x + 22, y - 30]], "brushpen", "#1E7A36", 4, h.wob, 10);
  }
}

/* ---- My house (ages 6 to 8) ---- */
export function kidHouse(S: Sketch) {
  const h = handOf(S, "young");
  const sunLeft = S.R() < 0.5;
  const hx = sunLeft ? between(S, 560, 760) : between(S, 300, 520), hw = between(S, 440, 560), hy = between(S, 540, 620), hb = 990;
  const wall = pick(S, [C.yellow, C.orange, C.pink, C.sky, C.lime]);
  const roof = pick(S, [C.red, C.brown, C.purple].filter((c) => c !== wall));
  const peak = hy - between(S, 240, 330);

  // the house first, as most children start: walls, roof, door, windows
  const body = rect(hx, hy, hw, hb - hy);
  const roofTri = tri([hx - 50, hy], [hx + hw / 2 + between(S, -30, 30), peak], [hx + hw + 50, hy]);
  line(S, h, body);
  line(S, h, roofTri);
  const dw = 130, dh = 230, dx = hx + hw / 2 - dw / 2 + between(S, -40, 40);
  const door = rect(dx, hb - dh, dw, dh);
  line(S, h, door);
  const win = 105, wy = hy + 70;
  const wins = [rect(hx + 50, wy, win, win), rect(hx + hw - 50 - win, wy, win, win)];
  wins.forEach((w) => line(S, h, w));
  const chx = hx + hw * 0.72;
  const chimney = rect(chx, peak + (hy - peak) * 0.35 - 70, 60, 150);
  line(S, h, chimney);

  colourIn(S, h, body, wall);
  colourIn(S, h, roofTri, roof);
  colourIn(S, h, chimney, C.red, { w: h.tip * 0.8 });
  colourIn(S, h, door, C.brown);
  S.path([[dx + dw - 30, hb - dh / 2], [dx + dw - 29, hb - dh / 2 + 1]], "brushpen", C.black, 12);
  for (const [x, y] of wins.map((w) => w[0])) {
    colourIn(S, h, rect(x, y, win, win), C.sky, { tool: "gouache", w: h.tip * 0.9, rows: 30 });
    S.line(x + win / 2, y + 4, x + win / 2, y + win - 4, "brushpen", C.black, 4, h.wob);
    S.line(x + 4, y + win / 2, x + win - 4, y + win / 2, "brushpen", C.black, 4, h.wob);
    line(S, h, rect(x, y, win, win));
  }
  // smoke curling out of the chimney
  const sx = chx + 30, sy = chimney[0][1] - 20;
  S.poly(Array.from({ length: 30 }, (_, i) => [sx + Math.sin(i / 3) * 26 + i * 4, sy - i * 9] as Pt), "pencil", C.grey, 6, h.wob, 10);

  // the sky things
  const sunX = sunLeft ? 190 : 1410;
  sun(S, h, sunX, 180, between(S, 80, 105), S.R() < 0.6);
  const cx = sunLeft ? between(S, 700, 1300) : between(S, 300, 900);
  line(S, h, cloud(cx, 170, 260, 110), C.blue, 5, "marker");
  if (S.R() < 0.6) line(S, h, cloud(cx + (sunLeft ? 380 : -380), 280, 200, 90), C.blue, 5, "marker");
  if (S.R() < 0.5) {
    // the sky coloured in, around the sun
    const [x0, x1] = sunLeft ? [340, 1620] : [-20, 1260];
    colourIn(S, h, rect(x0, -10, x1 - x0, 110), C.sky, { w: h.tip * 1.2 });
  }

  grass(S, h, hb - 6);
  // a tree on the free side
  const tx = sunLeft ? between(S, 180, 330) : between(S, 1150, 1330);
  const trunk = rect(tx - 30, 640, 60, hb - 640);
  line(S, h, trunk, C.brown, 5);
  colourIn(S, h, trunk, C.brown, { w: h.tip * 0.8 });
  const crown = ellipse(tx, 560, between(S, 140, 170), between(S, 130, 160), 30);
  line(S, h, crown, "#1E7A36", 6, "marker");
  colourIn(S, h, crown, C.green);
  if (S.R() < 0.6) for (let i = 0; i < 6; i++) colourIn(S, h, ellipse(tx + between(S, -100, 100), 560 + between(S, -90, 90), 20, 20, 12), C.red, { w: 10, rows: 30 });

  const flowers = 3 + Math.floor(S.R() * 4);
  for (let i = 0; i < flowers; i++) flower(S, h, between(S, 60, 1540), between(S, 1060, 1160), between(S, 34, 48), pick(S, [C.pink, C.red, C.purple, C.orange]));
}

/* ---- My cat (ages 6 to 8) ---- */
export function kidCat(S: Sketch) {
  const h = handOf(S, "young");
  const fur = pick(S, [C.orange, C.grey, C.black, C.brown, C.tan]);
  const stripes = fur === C.orange || fur === C.tan || fur === C.grey;
  const cx = between(S, 680, 860);
  const body = ellipse(cx, 790, between(S, 210, 250), between(S, 240, 270), 36);
  const head = ellipse(cx, 430, between(S, 165, 185), between(S, 150, 165), 36);
  const earL = tri([cx - 150, 360], [cx - 130, 200], [cx - 40, 290]);
  const earR = tri([cx + 40, 290], [cx + 130, 200], [cx + 150, 360]);

  // a rug or the floor
  const rug = S.R() < 0.6;
  if (rug) {
    const r = ellipse(cx, 1060, 520, 110, 40);
    line(S, h, r, C.red, 6, "marker");
    colourIn(S, h, r, pick(S, [C.pink, C.purple, C.sky]));
  } else S.poly([[0, 1040], [1600, 1030]], "marker", C.brown, h.tip, h.wob, 20);

  line(S, h, body);
  const tail: Pt[] = Array.from({ length: 16 }, (_, i) => [cx + 200 + i * 16, 960 - Math.sin(i / 5) * 260 - i * 6] as Pt);
  S.poly(tail, "brushpen", C.black, 5, h.wob, 10);
  line(S, h, head);
  line(S, h, earL);
  line(S, h, earR);
  colourIn(S, h, body, fur);
  S.poly(tail, "marker", fur, 34, h.wob, 14);
  colourIn(S, h, head, fur);
  colourIn(S, h, earL, fur, { w: h.tip * 0.7 });
  colourIn(S, h, earR, fur, { w: h.tip * 0.7 });
  colourIn(S, h, tri([cx - 130, 340], [cx - 122, 240], [cx - 70, 300]), C.pink, { w: 9, rows: 30 });
  colourIn(S, h, tri([cx + 70, 300], [cx + 122, 240], [cx + 130, 340]), C.pink, { w: 9, rows: 30 });
  if (stripes) {
    const dark = fur === C.grey ? C.black : C.brown;
    for (let i = 0; i < 5; i++) {
      const y = 640 + i * 70;
      S.poly([[cx - 200 + i * 6, y], [cx - 120, y + 20], [cx - 60, y + 10]], "marker", dark, 12, h.wob, 14);
      S.poly([[cx + 200 - i * 6, y], [cx + 120, y + 20], [cx + 60, y + 10]], "marker", dark, 12, h.wob, 14);
    }
    for (let i = -1; i <= 1; i++) S.line(cx + i * 40, 290, cx + i * 30, 340, "marker", dark, 12, h.wob);
  }
  // the face
  const eye = pick(S, [C.green, C.yellow, C.sky]);
  for (const s of [-1, 1]) {
    const ex = cx + s * 65;
    colourIn(S, h, ellipse(ex, 420, 34, 40, 18), eye, { tool: "gouache", w: 12, rows: 40 });
    line(S, h, ellipse(ex, 420, 34, 40, 18), C.black, 4);
    S.line(ex, 392, ex, 448, "brushpen", C.black, 12, 1);
    for (let k = 0; k < 3; k++) S.line(cx + s * 70, 500 + k * 16, cx + s * (190 + k * 10), 480 + k * 26, "pencil", C.black, 4, h.wob);
  }
  const nose = tri([cx - 20, 470], [cx + 20, 470], [cx, 495]);
  colourIn(S, h, nose, C.pink, { w: 8, rows: 40 });
  line(S, h, nose, C.black, 4);
  S.poly([[cx - 40, 520], [cx - 20, 535], [cx, 515], [cx + 20, 535], [cx + 40, 520]], "brushpen", C.black, 4, h.wob, 8);
  // paws, then the ball of wool
  for (const s of [-1, 1]) {
    const paw = ellipse(cx + s * 90, 1020, 70, 40, 20);
    colourIn(S, h, paw, fur, { w: 12 });
    line(S, h, paw, C.black, 4);
  }
  const bx = cx > 760 ? 330 : 1280, wool = pick(S, [C.blue, C.red, C.purple, C.green]);
  colourIn(S, h, ellipse(bx, 960, 95, 95, 30), wool);
  for (let i = 0; i < 4; i++) S.poly(ellipse(bx, 960, 90 - i * 18, 70 - i * 14, 20, i, i + 4.5), "brushpen", C.black, 3, h.wob, 10);
  S.poly([[bx + (bx < cx ? 90 : -90), 990], [(bx + cx) / 2, 1100], [cx + (bx < cx ? -120 : 120), 1030]], "marker", wool, 7, h.wob, 14);
  // a heart, or the cat's name in hearts
  if (S.R() < 0.7) {
    const hx = bx, hy = 260, r = 50;
    const heart: Pt[] = Array.from({ length: 40 }, (_, i) => {
      const t = (i / 40) * Math.PI * 2;
      return [hx + (16 * Math.sin(t) ** 3 * r) / 16, hy - ((13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * r) / 16];
    });
    colourIn(S, h, heart, C.red, { w: 12 });
    line(S, h, heart, C.red, 5, "marker");
  }
}

/* ---- A mirror butterfly (ages 6 to 8): drawn with Mirror on, so one half makes both ---- */
export function kidButterfly(S: Sketch) {
  const h = handOf(S, "young");
  const from = S.strokes.length;
  const a = pick(S, [C.orange, C.blue, C.purple, C.pink, C.yellow]);
  const b = pick(S, [C.yellow, C.sky, C.pink, C.lime, C.red].filter((c) => c !== a));
  const tilt = between(S, -0.4, -0.15);
  const up = ellipse(560, 450, between(S, 230, 270), between(S, 190, 220), 32).map(([x, y]) => [x + (y - 450) * tilt * 0.5, y] as Pt);
  const low = ellipse(610, 800, between(S, 160, 190), between(S, 150, 170), 28);
  line(S, h, up);
  line(S, h, low);
  colourIn(S, h, up, a);
  colourIn(S, h, low, b);
  // spots on the wings
  for (const [x, y, r, c] of [[520, 420, 70, b], [430, 520, 40, C.white], [600, 820, 55, a], [660, 330, 30, C.black]] as const) {
    colourIn(S, h, ellipse(x + between(S, -20, 20), y + between(S, -20, 20), r, r, 20), c, { tool: "gouache", w: 12, rows: 40 });
  }
  // the body and feelers sit on the middle line
  const body = ellipse(800, 620, 32, 240, 24);
  colourIn(S, h, body, C.black, { tool: "brushpen", w: 10, rows: 60 });
  S.poly([[790, 400], [760, 320], [720, 250], [690, 230], [680, 250], [700, 262]], "brushpen", C.black, 5, h.wob, 10);
  // dots and little flowers around it
  for (let i = 0; i < 6; i++) colourIn(S, h, ellipse(between(S, 80, 380), between(S, 120, 1100), 16, 16, 12), pick(S, [C.pink, C.lime, C.sky, C.yellow]), { w: 10, rows: 40 });
  flower(S, h, between(S, 120, 300), 1150, 40, pick(S, [C.pink, C.red, C.purple]));
  for (let i = from; i < S.strokes.length; i++) S.strokes[i].m = "v";
}

/* ---- Under the sea (ages 9 to 11) ---- */
export function kidSea(S: Sketch) {
  const h = handOf(S, "older");
  const horizon = between(S, 230, 300);
  // a fish or three first: the part they wanted to draw
  const fish = 3 + Math.floor(S.R() * 3);
  const shapes: { body: Pt[]; tail: Pt[]; c: string; x: number; y: number; dir: number; s: number }[] = [];
  for (let i = 0; i < fish; i++) {
    const s = between(S, 0.7, 1.25), x = 250 + (i / fish) * 1150 + between(S, -60, 60), y = horizon + 220 + S.R() * (880 - horizon - 220), dir = S.R() < 0.5 ? -1 : 1;
    const body = ellipse(x, y, 120 * s, 70 * s, 28);
    const tx = x - dir * 110 * s;
    const tail = tri([tx, y], [tx - dir * 90 * s, y - 70 * s], [tx - dir * 90 * s, y + 70 * s]);
    shapes.push({ body, tail, c: pick(S, [C.orange, C.yellow, C.pink, C.purple, C.red, C.lime]), x, y, dir, s });
  }
  for (const f of shapes) {
    line(S, h, f.body, C.navy, 4);
    line(S, h, f.tail, C.navy, 4);
  }
  // the sea, coloured around them with long sweeps
  colourIn(S, h, rect(-20, horizon, 1640, 1000 - horizon), C.blue, { w: 20, angle: between(S, -0.1, 0.1) });
  colourIn(S, h, rect(-20, horizon + 450, 1640, 560 - 20), C.navy, { w: 16, angle: between(S, -0.1, 0.1) });
  for (const f of shapes) {
    colourIn(S, h, f.body, f.c, { tool: "gouache", w: 14 });
    colourIn(S, h, f.tail, f.c, { tool: "gouache", w: 12 });
    const stripe = f.c === C.yellow ? C.orange : C.yellow;
    for (let k = -1; k <= 1; k++) S.line(f.x + k * 34 * f.s, f.y - 55 * f.s, f.x + k * 34 * f.s, f.y + 55 * f.s, "gouache", stripe, 10 * f.s, h.wob);
    colourIn(S, h, ellipse(f.x + f.dir * 70 * f.s, f.y - 15 * f.s, 15 * f.s, 15 * f.s, 12), C.white, { tool: "gouache", w: 8, rows: 40 });
    S.path([[f.x + f.dir * 74 * f.s, f.y - 14 * f.s], [f.x + f.dir * 75 * f.s, f.y - 13 * f.s]], "brushpen", C.black, 9);
    line(S, h, f.body, C.navy, 4);
    for (let k = 0; k < 3; k++) {
      const bx = f.x + f.dir * (140 + k * 30) * f.s, by = f.y - (40 + k * 60) * f.s;
      S.circle(bx, by, 10 + k * 5, "pencil", C.white, 4, 1);
    }
  }
  // sand, weed, a starfish
  const sand: Pt[] = [[-20, 1010], ...Array.from({ length: 9 }, (_, i) => [i * 200, 1000 + Math.sin(i) * 20] as Pt), [1620, 1010], [1620, 1220], [-20, 1220]];
  colourIn(S, h, sand, C.tan, { w: 18 });
  for (let i = 0; i < 5; i++) {
    const x = between(S, 60, 1540);
    S.poly(Array.from({ length: 12 }, (_, k) => [x + Math.sin(k / 1.6 + i) * 22, 1030 - k * between(S, 22, 34)] as Pt), "marker", C.green, 16, h.wob, 12);
  }
  const st = star(between(S, 300, 1300), 1110, 55, S.R());
  colourIn(S, h, st, C.orange, { tool: "gouache", w: 10, rows: 40 });
  line(S, h, st, C.red, 4);
  // the sky and a boat on top
  colourIn(S, h, rect(-20, -20, 1640, horizon + 20), C.sky, { w: 18 });
  const sx = between(S, 1200, 1450);
  colourIn(S, h, ellipse(sx, 110, 70, 70, 24), C.yellow, { tool: "gouache", w: 14 });
  const bx = between(S, 300, 800), hull = [[bx - 130, horizon - 50], [bx + 130, horizon - 50], [bx + 90, horizon + 10], [bx - 90, horizon + 10]] as Pt[];
  colourIn(S, h, hull, C.brown, { tool: "gouache", w: 12 });
  S.line(bx, horizon - 50, bx, horizon - 230, "brushpen", C.black, 5, h.wob);
  const sail = tri([bx + 8, horizon - 225], [bx + 8, horizon - 65], [bx + 120, horizon - 70]);
  colourIn(S, h, sail, C.white, { tool: "gouache", w: 12 });
  line(S, h, sail, C.black, 4);
  S.poly(Array.from({ length: 33 }, (_, i) => [i * 50, horizon + Math.sin(i * 1.3) * 8] as Pt), "brushpen", C.navy, 5, h.wob, 10);
}

/* ---- Warm and cold (ages 9 to 11): a warm sky over cold mountains ---- */
export function kidWarmCold(S: Sketch) {
  const h = handOf(S, "older");
  const warm = [C.yellow, C.orange, C.red, C.pink];
  const bands = 4 + Math.floor(S.R() * 2);
  const H = between(S, 560, 660);
  for (let i = 0; i < bands; i++) {
    const y0 = (i / bands) * H - 10, y1 = ((i + 1) / bands) * H + 10;
    colourIn(S, h, rect(-20, y0, 1640, y1 - y0), warm[(bands - 1 - i) % warm.length], { tool: "gouache", w: 22, angle: between(S, -0.08, 0.08) });
  }
  const sx = between(S, 400, 1200);
  colourIn(S, h, ellipse(sx, H - 210, 110, 110, 30), C.yellow, { tool: "gouache", w: 18 });
  // mountains, back to front, in blues and purples: each peak a triangle, then the land under them
  const cold = [C.purple, C.navy, C.blue, C.teal];
  for (let m = 0; m < 3; m++) {
    const base = H + 30 + m * 150, colour = cold[(m + Math.floor(S.R() * 2)) % cold.length];
    for (let x = between(S, -200, 0); x < 1700; x += between(S, 220, 380)) {
      const w = between(S, 200, 330), top = base - between(S, 140, 300) + m * 30;
      const peak = tri([x - w, base + 4], [x + between(S, -30, 30), top], [x + w, base + 4]);
      colourIn(S, h, peak, colour, { tool: "gouache", w: 18 });
      line(S, h, peak.slice(0, 3), C.navy, 4, "brushpen", false);
      if (m === 0 && S.R() < 0.6) {
        const cap = tri([peak[1][0] - w * 0.22, top + (base - top) * 0.22], peak[1], [peak[1][0] + w * 0.22, top + (base - top) * 0.22]);
        colourIn(S, h, cap, C.white, { tool: "gouache", w: 12, rows: 40 });
      }
    }
    colourIn(S, h, rect(-20, base, 1640, 1220 - base), colour, { tool: "gouache", w: 20 });
  }
  // birds in the warm sky, a cold lake at the front
  for (let i = 0; i < 4; i++) {
    const bx = between(S, 120, 1480), by = between(S, 80, H - 200), w = between(S, 22, 40);
    S.poly([[bx - w, by], [bx - w / 3, by - w / 2], [bx, by], [bx + w / 3, by - w / 2], [bx + w, by]], "brushpen", C.black, 4, h.wob, 8);
  }
  colourIn(S, h, rect(-20, 1100, 1640, 120), C.teal, { tool: "gouache", w: 18 });
}

/* ---- Pixel art: fruit on 16 × 16 (ages 9 to 11) ---- */
const FRUIT: Record<string, { rows: string[]; ink: Record<string, string> }> = {
  apple: {
    rows: [
      "................",
      "........b.......",
      "........b.GG....",
      ".......bGGgg....",
      "....kkkbkkk.....",
      "...krrrrrrrrk...",
      "..krwwrrrrrrrk..",
      "..krwrrrrrrrrk..",
      "..krrrrrrrrrrk..",
      "..krrrrrrrrrRk..",
      "..krrrrrrrrrRk..",
      "..krrrrrrrrRRk..",
      "...krrrrrrRRk...",
      "....krrkkrRk....",
      ".....kk..kk.....",
      "................",
    ],
    ink: { k: C.black, r: C.red, R: "#A3241B", w: C.white, b: C.brown, g: C.lime, G: C.green },
  },
  cherries: {
    rows: [
      "................",
      ".........gGG....",
      "........gG......",
      ".......g..g.....",
      "......g....g....",
      ".....g......g...",
      "....g........g..",
      "..kkk.......g...",
      ".krrrk....kkkk..",
      "krwrrrk..krrrrk.",
      "krwrrRk.krwrrrRk",
      "krrrrRk.krrrrrRk",
      ".kRRRk..krrrrRRk",
      "..kkk....kRRRRk.",
      "..........kkkk..",
      "................",
    ],
    ink: { k: C.black, r: C.red, R: "#A3241B", w: C.white, g: C.green, G: C.lime },
  },
  pear: {
    rows: [
      "................",
      ".......b........",
      ".......bGG......",
      "......kkkk......",
      ".....kyyyyk.....",
      ".....kywyyk.....",
      "....kyyyyyyk....",
      "....kyyyyyyk....",
      "...kyyyyyyyyk...",
      "..kywyyyyyyyOk..",
      "..kyyyyyyyyyOk..",
      "..kyyyyyyyyOOk..",
      "..kyyyyyyyyOOk..",
      "...kyyyyyyOOk...",
      "....kkkkkkkk....",
      "................",
    ],
    ink: { k: C.black, y: C.lime, O: C.green, w: C.white, b: C.brown, G: C.green },
  },
  strawberry: {
    rows: [
      "................",
      ".....G.GG.G.....",
      "....GGGGGGGG....",
      "...kkGGkkGGkk...",
      "..krrrrrrrrrrk..",
      "..krwrryrrryrk..",
      "..krrrrrrrrrrk..",
      "..kryrrryrrrRk..",
      "...krrrrrryRk...",
      "...krryrrrrRk...",
      "....krrrryRk....",
      "....krrrrrRk....",
      ".....kryrRk.....",
      "......krRk......",
      ".......kk.......",
      "................",
    ],
    ink: { k: C.black, r: C.red, R: "#A3241B", w: C.white, y: C.yellow, G: C.green },
  },
  melon: {
    rows: [
      "................",
      "................",
      "................",
      "kkkkkkkkkkkkkkkk",
      "krrrrrrrrrrrrrrk",
      ".krrbrrrrrrbrrk.",
      ".krrrrrrbrrrrrk.",
      "..krrbrrrrrbrk..",
      "...krrrrbrrrk...",
      "....kwwwwwwk....",
      ".....kggggk.....",
      "......kGGk......",
      ".......kk.......",
      "................",
      "................",
      "................",
    ],
    ink: { k: C.black, r: C.red, b: C.black, w: "#F4F1E0", g: C.lime, G: C.green },
  },
};
export const FRUITS = Object.keys(FRUIT);

/** One of the fruit, on a ground colour of the pupil's choosing. */
export function kidFruit(S: Sketch, which = pick(S, FRUITS)) {
  const f = FRUIT[which];
  const ground = pick(S, ["#F4F4F4", "#FFCD75", "#73EFF7", "#A7F070", "#F4C9DE"]);
  const grid: Grid = f.rows.map((row) => {
    if (row.length !== 16) throw new Error(`${which}: a row of ${row.length}`);
    return [...row].map((ch) => (ch === "." ? ground : f.ink[ch]));
  });
  // a pupil's touch: a shadow under it, a few cells in the ground
  for (let c = 4; c < 12; c++) if (grid[15][c] === ground) grid[15][c] = "#C9C9C9";
  lay(S, grid, [ground, C.black]);
}

/* ---- Pixel art: a creature on 32 × 32 (ages 12 to 15) ---- */
export function kidCreature(S: Sketch) {
  const N = 32;
  const bg = pick(S, ["#1A1C2C", "#29366F", "#333C57", "#F4F4F4"]);
  const body = pick(S, ["#38B764", "#EF7D57", "#41A6F6", "#B13E53", "#FFCD75", "#5D275D"]);
  const belly = pick(S, ["#FFCD75", "#A7F070", "#73EFF7", "#94B0C2"].filter((c) => c !== body));
  const ink = "#1A1C2C";
  const g = blank(N, N, bg);
  // the body: a blob grown from the middle, the left half mirrored to the right
  const rx = between(S, 8, 11), ry = between(S, 8, 11), cy = between(S, 15, 18);
  const lumps = Array.from({ length: 4 }, () => [between(S, 9, 16), between(S, 6, 26), between(S, 2, 4)]);
  const inside = (c: number, r: number) => {
    const m = c < N / 2 ? c : N - 1 - c;
    if (m < 0 || r < 0 || r >= N) return false;
    return inEllipse(m, r, 16, cy, rx, ry) || lumps.some(([x, y, s]) => inEllipse(m, r, x, y, s, s));
  };
  // feet and horns or ears
  const feet = (c: number, r: number) => {
    const m = c < N / 2 ? c : N - 1 - c;
    return r >= cy + ry - 1 && r <= cy + ry + 2 && m >= 10 && m <= 12;
  };
  const horns = S.R() < 0.6;
  const top = (c: number, r: number) => {
    const m = c < N / 2 ? c : N - 1 - c;
    const r0 = Math.round(cy - ry);
    return horns ? r < r0 + 1 && r >= r0 - 4 && m >= 9 + (r0 - r) * 0.5 && m <= 10 + (r0 - r) * 0.5 : r < r0 + 1 && r >= r0 - 2 && m >= 8 && m <= 11;
  };
  const all = (c: number, r: number) => inside(c, r) || feet(c, r) || top(c, r);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (all(c, r)) g[r][c] = feet(c, r) ? ink : top(c, r) && horns ? "#F4F4F4" : body;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (inside(c, r) && inEllipse(c, r, 16, cy + ry * 0.35, rx * 0.55, ry * 0.5)) g[r][c] = belly;
  outline(g, all, ink);
  // eyes: one big one or two
  const ey = Math.round(cy - ry * 0.35);
  const eyes = S.R() < 0.3 ? [15.5] : [12, 19];
  for (const ex of eyes) {
    const big = eyes.length === 1 ? 3.4 : 2.4;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (inEllipse(c, r, ex + 0.5, ey + 0.5, big, big)) g[r][c] = "#F4F4F4";
    set(g, Math.round(ex), ey, ink);
    set(g, Math.round(ex), ey + 1, ink);
  }
  // a mouth with teeth
  const my = ey + 5;
  for (let c = 13; c <= 18; c++) set(g, c, my, ink);
  set(g, 14, my + 1, "#F4F4F4");
  set(g, 17, my + 1, "#F4F4F4");
  // spots
  for (let i = 0; i < 4; i++) {
    const c = Math.floor(between(S, 9, 14)), r = Math.floor(between(S, cy - 2, cy + 6));
    if (inside(c, r) && g[r][c] === body) {
      set(g, c, r, belly);
      set(g, N - 1 - c, r, belly);
    }
  }
  // stars when it's dark
  if (bg !== "#F4F4F4") for (let i = 0; i < 14; i++) {
    const c = Math.floor(S.R() * N), r = Math.floor(S.R() * N);
    if (g[r][c] === bg) g[r][c] = S.R() < 0.5 ? "#FFCD75" : "#94B0C2";
  }
  lay(S, g, [bg, ink, body, belly]);
}

/* ---- Pixel art: a city at night on 64 × 48 (ages 12 to 15) ---- */
export function kidCity(S: Sketch) {
  const W = 64, H = 48;
  const sky = ["#1A1C2C", "#29366F", "#3B5DC9"];
  // the sky darker upwards, the bands broken up where they meet
  const g: Grid = Array.from({ length: H }, (_, r) => Array.from({ length: W }, (_, c) => {
    const t = r + ((c * 7 + r * 3) % 5) - 2;
    return t < 20 ? sky[0] : t < 32 ? sky[1] : sky[2];
  }));
  // stars and a moon
  for (let i = 0; i < 40; i++) {
    const c = Math.floor(S.R() * W), r = Math.floor(S.R() * 22);
    g[r][c] = S.R() < 0.7 ? "#F4F4F4" : "#FFCD75";
  }
  const mx = Math.floor(between(S, 8, 56)), my = Math.floor(between(S, 6, 12));
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (inEllipse(c, r, mx, my, 4.2, 4.2) && !inEllipse(c, r, mx + 2, my - 1, 3.6, 3.6)) g[r][c] = "#FFCD75";
  // buildings, back row darker
  for (const [shade, lit, minH, maxH] of [["#333C57", "#EF7D57", 14, 26], ["#1A1C2C", "#FFCD75", 8, 20]] as const) {
    for (let c = 0; c < W; ) {
      const w = Math.floor(between(S, 5, 10)), h = Math.floor(between(S, minH, maxH)), top = H - 4 - h;
      for (let r = top; r < H - 4; r++) for (let x = c; x < Math.min(W, c + w); x++) g[r][x] = shade;
      // a roof that isn't flat now and then
      if (S.R() < 0.3) for (let x = c + 1; x < Math.min(W, c + w - 1); x++) g[top - 1][x] = shade;
      if (S.R() < 0.2 && top > 6) for (let r = top - 5; r < top; r++) g[r][c + Math.floor(w / 2)] = shade;
      // windows, some lit
      for (let r = top + 2; r < H - 5; r += 2) for (let x = c + 1; x < Math.min(W, c + w - 1); x += 2) if (S.R() < 0.45) g[r][x] = lit;
      c += w + (S.R() < 0.3 ? 1 : 0);
    }
  }
  // the road and its lamps
  for (let r = H - 4; r < H; r++) for (let c = 0; c < W; c++) g[r][c] = r === H - 4 ? "#566C86" : "#333C57";
  for (let c = 3; c < W; c += 10) g[H - 2][c] = g[H - 2][c + 1] = "#FFCD75";
  lay(S, g, [sky[2], sky[1], sky[0], "#333C57", "#1A1C2C", "#566C86"]);
}
