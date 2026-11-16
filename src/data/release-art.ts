import type { Pt, Sketch } from "../engine/sketch";
import { below, blob, crossings, ellipse, mix, ramp, ridge, sky, soft, speckle } from "./art";

/* Release week's sample pieces (data/event.ts): Claude, an AI, drew them in code, in a sunset
   mood, while people wait for GTA VI. They are our own pictures: no character, logo, place or
   art from the game is in them. Each is marked AI-MADE wherever it appears, like every
   sample (samples.ts). */

const NIGHT = "#1B1426";
const box = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const bend = (a: Pt, m: Pt, b: Pt, n = 12): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1), u = 1 - t;
    return [u * u * a[0] + 2 * u * t * m[0] + t * t * b[0], u * u * a[1] + 2 * u * t * m[1] + t * t * b[1]] as Pt;
  });

/** the corners of a closed shape, with points along each edge, so a marker keeps them sharp */
const dense = (pts: Pt[], step = 12): Pt[] =>
  pts.flatMap(([x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length], n = Math.max(1, Math.round(Math.hypot(nx - x, ny - y) / step));
    return Array.from({ length: n }, (_, k) => [x + ((nx - x) * k) / n, y + ((ny - y) * k) / n] as Pt);
  }).concat([pts[0]]);

/** a striped sun sitting on a line, its cuts in the sky's colours */
function stripedSun(S: Sketch, cx: number, base: number, r: number, skyStops: string[], skyTop: number, skyH: number, colours = ["#FFF0A0", "#FFC24A", "#FF7A6A", "#FF4F9A"]) {
  const half = (y: number) => Math.sqrt(Math.max(0, r * r - (base - y) ** 2));
  const n = 28;
  for (let k = 0; k < n; k++) {
    const y0 = base - r + (k * r) / n, y1 = y0 + r / n + 1.5;
    S.lasso([[cx - half(y1), y1], [cx - half(y0), y0], [cx + half(y0), y0], [cx + half(y1), y1]], ramp(colours, k / (n - 1)));
  }
  for (let k = 0; k < 6; k++) {
    const y = base - r * 0.5 + k * (r * 0.088), h = 4 + k * 3;
    S.lasso(box(cx - r - 4, y, r * 2 + 8, h), ramp(skyStops, (y + h / 2 - skyTop) / skyH));
  }
}

/** a palm in silhouette: a bending trunk and a crown of drooping fronds */
function palm(S: Sketch, x: number, base: number, h: number, lean: number, size: number, c = NIGHT) {
  const trunk = bend([x, base], [x + lean * 0.3, base - h * 0.6], [x + lean, base - h], 14);
  S.path(trunk, "brushpen", c, 24 * size, (t) => 0.95 - t * 0.35);
  for (let i = 1; i < 13; i += 2) S.line(trunk[i][0] - 12 * size, trunk[i][1], trunk[i][0] + 12 * size, trunk[i][1] - 5, "ink", mix(c, "#000000", 0.2), 4 * size, 0.2);
  const [tx, ty] = trunk[13];
  for (let k = 0; k < 10; k++) {
    const a = Math.PI * 0.92 + (k / 9) * Math.PI * 1.16 + (S.R() - 0.5) * 0.12;
    const len = (200 + S.R() * 60) * size;
    const frond = bend([tx, ty], [tx + Math.cos(a) * len * 0.6, ty + Math.sin(a) * len * 0.5 - 60 * size], [tx + Math.cos(a) * len, ty + Math.sin(a) * len * 0.3 + 90 * size], 14);
    S.path(frond, "brushpen", c, 20 * size, (t) => 0.95 - t * 0.8);
    for (let i = 2; i < 13; i++) {
      const [px, py] = frond[i], l = (52 - i * 3) * size;
      S.line(px, py, px + Math.cos(a + 1.2) * l * 0.5, py + l, "brushpen", c, 7 * size, 0.2);
      S.line(px, py, px + Math.cos(a - 1.2) * l * 0.5, py + l * 0.9, "brushpen", c, 6 * size, 0.2);
    }
  }
}

/** a neon line: a soft glow under a bright core */
function neon(S: Sketch, pts: Pt[], c: string, w = 8) {
  const was = S.alpha;
  S.alpha = was * 0.18;
  S.path(pts, "marker", c, w * 5, () => 1);
  S.alpha = was * 0.35;
  S.path(pts, "marker", c, w * 2.4, () => 1);
  S.alpha = was;
  S.path(pts, "marker", c, w, () => 1);
  S.path(pts, "ink", "#FFF4FA", w * 0.35, () => 0.8);
}

/* ---- 1. the strip the night before: a car going home along the sea ---- */
export function genStrip(S: Sketch) {
  const SKY = ["#24124A", "#4E2580", "#A2348E", "#F0507A", "#FF8A5C", "#FFC46A", "#FFE6A0"];
  const sea = 650, road = 870, walk = 1020;
  sky(S, 0, 1600, 0, sea, SKY, 40);
  speckle(S, 0, 0, 1600, 220, 60, "#FFE9F6", 4, "ink");
  S.alpha = 0.6;
  soft(S, 980, sea, 600, "#FFB347", 0.5, 0.6, 26);
  S.alpha = 1;
  stripedSun(S, 980, sea, 250, SKY, 0, sea);
  // the city across the bay, violet against the gold
  for (let x = 0, i = 0; x < 640; x += 40 + S.R() * 30, i++) {
    const h = 60 + S.R() * 170 + (i === 6 ? 140 : 0), w = 34 + S.R() * 34;
    S.lasso(box(x, sea - h, w, h + 2), mix("#3A1F66", "#8E2F8C", 0.15 + S.R() * 0.3));
    for (let k = 0; k < 7; k++) if (S.R() > 0.4) S.lasso(box(x + 5 + S.R() * (w - 12), sea - h + 8 + S.R() * (h - 16), 5, 7), "#FFD98A");
  }
  // the sea, and the sun laid on it
  sky(S, 0, 1600, sea, road - 40, ["#8A3384", "#4A2A72", "#22285A"], 16);
  for (let k = 0; k < 28; k++) {
    const y = sea + 6 + k * 7.5, w = (250 - k * 7) * (0.6 + S.R() * 0.45);
    S.alpha = 0.85;
    S.line(980 - w + S.R() * 40, y, 980 + w - S.R() * 40, y, "marker", k % 3 ? "#FFB347" : "#FF6F9A", 4 + (k % 2) * 2, 0.4);
  }
  S.alpha = 1;
  for (let k = 0; k < 70; k++) {
    const x = S.R() * 1600, y = sea + 14 + S.R() * 170;
    if (Math.abs(x - 980) > 230) S.line(x, y, x + 20 + S.R() * 26, y, "pencil", "#C27BB8", 2.5, 0.3);
  }
  // the sea wall with its teal neon, the road and the pavement
  S.lasso(box(0, road - 40, 1600, 32), "#2A1650");
  neon(S, [[0, road - 40], [1600, road - 40]], "#22E1D8", 6);
  S.lasso(box(0, road - 8, 1600, walk - road + 8), "#3A2E50");
  for (let x = 10; x < 1600; x += 130) S.line(x, road + 70, x + 70, road + 70, "ink", "#FFD27A", 8, 0.2);
  S.lasso(box(0, walk, 1600, 200), "#5B3A6E");
  S.alpha = 0.5;
  for (let y = walk + 30; y < 1200; y += 46) S.line(0, y, 1600, y + 6, "pencil", "#8E5B8C", 3, 0.4);
  S.alpha = 1;
  // a motel's sign by the road: an arrow in neon, nothing written on it
  const arrow: Pt[] = [[330, 250], [560, 250], [630, 320], [560, 390], [330, 390]];
  S.line(440, walk, 440, 390, "brushpen", NIGHT, 18, 0.2);
  S.lasso(arrow, "#2A1650");
  neon(S, dense(arrow), "#FF4FD8", 7);
  neon(S, dense([[360, 280], [540, 280], [580, 320], [540, 360], [360, 360]]), "#22E1D8", 4);
  for (let x = 345; x < 560; x += 30) S.lasso(ellipse(x, 414, 6, 6, 10), "#FFE58A");
  // a car on its way along the front, its tail lights on
  const cx = 620, cy = road + 80;
  S.lasso([[cx, cy], [cx + 20, cy - 46], [cx + 120, cy - 56], [cx + 170, cy - 96], [cx + 300, cy - 98], [cx + 360, cy - 58], [cx + 470, cy - 48], [cx + 490, cy], [cx + 490, cy + 26], [cx, cy + 26]], NIGHT);
  S.lasso([[cx + 186, cy - 90], [cx + 296, cy - 92], [cx + 340, cy - 60], [cx + 180, cy - 60]], "#4B3A6A");
  for (const wx of [cx + 100, cx + 390]) {
    S.lasso(ellipse(wx, cy + 26, 44, 44, 24), "#0E0A16");
    S.lasso(ellipse(wx, cy + 26, 18, 18, 16), "#6B5A80");
  }
  S.alpha = 0.5;
  soft(S, cx + 6, cy - 22, 90, "#FF3355", 0.6, 0.6, 16);
  S.alpha = 1;
  S.lasso(box(cx - 2, cy - 30, 16, 16), "#FF5566");
  for (let k = 0; k < 8; k++) {
    S.alpha = 0.07;
    S.lasso([[cx + 486, cy - 14], [cx + 560 + k * 50, cy - 26 - k * 5], [cx + 560 + k * 50, cy + 24 + k * 4], [cx + 486, cy + 4]], "#FFF1B8");
  }
  S.alpha = 1;
  S.lasso(box(cx + 478, cy - 18, 14, 14), "#FFF6D0");
  // palms, black against the sky
  palm(S, 90, walk + 20, 760, -30, 1.05);
  palm(S, 1320, walk + 20, 820, -110, 1.15);
  palm(S, 1520, walk + 20, 600, 60, 0.85);
  for (const [gx, gy, g] of [[640, 170, 1], [700, 210, 0.75]]) S.poly([[gx, gy], [gx + 18 * g, gy - 12 * g], [gx + 36 * g, gy], [gx + 54 * g, gy - 12 * g], [gx + 72 * g, gy]], "ink", NIGHT, 4, 0.3);
}

/* ---- 2. a motel at two in the morning, the pool lit ---- */
export function genMotel(S: Sketch) {
  sky(S, 0, 1600, 0, 730, ["#0E0B26", "#1B1646", "#3A2468", "#6A2E78", "#8E3A7E"], 32);
  speckle(S, 0, 0, 1600, 380, 90, "#E9E4FF", 4, "ink");
  S.lasso(ellipse(1180, 130, 46, 46, 30), "#FCEFD2");
  S.alpha = 0.4;
  soft(S, 1180, 130, 200, "#FCEFD2", 0.35, 1, 16);
  S.alpha = 1;
  // the motel: two floors of doors, a walkway with its rail, a flat roof with neon along it
  const x0 = 140, x1 = 1460, roof = 330, mid = 520, ground = 720;
  S.lasso(box(x0, roof, x1 - x0, ground - roof), "#2E3A5A");
  S.lasso(box(x0 - 20, roof - 26, x1 - x0 + 40, 30), "#20283F");
  neon(S, [[x0 - 20, roof - 26], [x1 + 20, roof - 26]], "#FF4FD8", 6);
  S.lasso(box(x0, mid - 8, x1 - x0, 18), "#20283F");
  for (let x = x0 + 10; x < x1; x += 34) S.line(x, mid - 70, x, mid - 8, "ink", "#5D6C8C", 3, 0.2);
  S.line(x0, mid - 70, x1, mid - 70, "ink", "#5D6C8C", 4, 0.2);
  const doors = 8;
  for (let fl = 0; fl < 2; fl++)
    for (let k = 0; k < doors; k++) {
      const dx = x0 + 50 + k * ((x1 - x0 - 100) / doors), top = fl ? mid + 30 : roof + 40, dh = fl ? 160 : 140;
      S.lasso(box(dx, top, 70, dh), fl === 1 && k === 5 ? "#FFB347" : "#3F4E74");
      S.lasso(box(dx + 90, top + 20, 50, 50), S.R() > 0.6 ? "#FFD98A" : "#22304E");
      S.lasso(ellipse(dx + 58, top + dh / 2, 4, 4, 8), "#C9B37A");
    }
  // the light from the one open door
  S.alpha = 0.3;
  soft(S, x0 + 50 + 5 * ((x1 - x0 - 100) / doors) + 35, ground, 220, "#FFB347", 0.5, 0.5, 16);
  S.alpha = 1;
  // the sign on its pole: a star and a blank board in teal neon
  S.line(1470, ground, 1470, 180, "brushpen", NIGHT, 14, 0.2);
  S.lasso(box(1370, 130, 190, 120), "#14102A");
  neon(S, dense(box(1370, 130, 190, 120)), "#22E1D8", 6);
  neon(S, dense(box(1392, 152, 146, 76)), "#FF4FD8", 3);
  const star: Pt[] = Array.from({ length: 11 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 18 : 42;
    return [1465 + Math.cos(a) * r, 84 + Math.sin(a) * r] as Pt;
  });
  neon(S, dense(star.slice(0, 10), 8), "#FFE58A", 5);
  // the car park and the pool in front, glowing
  S.lasso(box(0, ground, 1600, 480), "#1C1A30");
  for (let x = 60; x < 1600; x += 170) S.line(x, ground + 10, x - 40, ground + 150, "ink", "#5D6C8C", 4, 0.2);
  const pool = blob(S, 800, 1000, 520, 120, 0.03, 60);
  S.alpha = 0.5;
  soft(S, 800, 1000, 640, "#22E1D8", 0.45, 0.3, 18);
  S.alpha = 1;
  S.lasso(pool, "#1FB8C8");
  S.lasso(blob(S, 800, 1010, 470, 96, 0.03, 60), "#29D3DC");
  for (let k = 0; k < 18; k++) {
    const y = 930 + S.R() * 150, x = 340 + S.R() * 880;
    S.path([[x, y], [x + 30, y - 6], [x + 60, y], [x + 90, y - 6]], "ink", "#E8FFFF", 3, () => 0.7);
  }
  S.poly([...pool, pool[0]], "ink", "#E8E0F0", 6, 0.3);
  // the ladder, and two loungers, empty
  S.path([[1180, 960], [1180, 900], [1210, 880]], "ink", "#C8C8D8", 6, () => 0.8);
  S.path([[1220, 960], [1220, 900], [1250, 880]], "ink", "#C8C8D8", 6, () => 0.8);
  for (const lx of [200, 1360]) {
    S.lasso([[lx, 1150], [lx + 160, 1150], [lx + 200, 1080], [lx + 180, 1072], [lx + 150, 1130], [lx, 1130]], "#FF8FC4");
    S.line(lx + 10, 1150, lx + 10, 1180, "ink", NIGHT, 5, 0.2);
    S.line(lx + 150, 1150, lx + 150, 1180, "ink", NIGHT, 5, 0.2);
  }
  palm(S, 70, 1190, 900, 60, 1.05, "#0C0A18");
  palm(S, 1580, 1190, 700, -50, 0.9, "#0C0A18");
}

/* ---- 3. someone, as a loading screen: Subject No. 313's six inks and nothing else ---- */
export const LOADING_INKS = ["#FF4F9A", "#FF8A3D", "#6B3FA0", "#1FA5A0", "#2F6B5A", "#1B1426"];
export function genLoading(S: Sketch) {
  const [PINK, ORANGE, VIOLET, TEAL, PALM, INK] = LOADING_INKS;
  const W = 1200, H = 1600;
  const curve = (...segs: [Pt, Pt, Pt][]): Pt[] => segs.flatMap(([a, m, b]) => bend(a, m, b, 14));
  // the ground: violet, with pink rays out from behind the head
  S.lasso(box(0, 0, W, H), VIOLET);
  const hx = 640, hy = 640;
  for (let k = 0; k < 20; k++) {
    const a0 = (k / 20) * Math.PI * 2, a1 = a0 + Math.PI / 20;
    S.alpha = 0.5;
    S.lasso([[hx, hy], [hx + Math.cos(a0) * 2000, hy + Math.sin(a0) * 2000], [hx + Math.cos(a1) * 2000, hy + Math.sin(a1) * 2000]], PINK);
  }
  // a big sun behind the head, cut by violet stripes, pink coming up from its foot
  S.alpha = 1;
  S.lasso(ellipse(hx, 760, 400, 400, 80), ORANGE);
  S.alpha = 0.55;
  S.lasso([...ellipse(hx, 760, 400, 400, 40, 0.15, Math.PI - 0.15)], PINK);
  S.alpha = 1;
  for (let k = 0; k < 7; k++) {
    const y = 820 + k * 46, h = 6 + k * 4, half = Math.sqrt(Math.max(0, 400 * 400 - (y + h / 2 - 760) ** 2));
    S.lasso(box(hx - half - 4, y, half * 2 + 8, h), VIOLET);
  }
  // palm leaves coming in at both top corners
  const frond = (x: number, y: number, a: number, len: number, side: number) => {
    const f = bend([x, y], [x + Math.cos(a) * len * 0.55, y + Math.sin(a) * len * 0.3 - 40], [x + Math.cos(a) * len, y + Math.sin(a) * len * 0.75 + 80], 16);
    S.path(f, "brushpen", PALM, 30, (t) => 0.95 - t * 0.75);
    for (let i = 2; i < 15; i++) {
      const [px, py] = f[i], l = 90 - i * 4;
      S.line(px, py, px + side * l * 0.45, py + l, "brushpen", PALM, 13, 0.2);
      S.line(px, py, px - side * l * 0.25, py + l * 0.95, "brushpen", PALM, 11, 0.2);
    }
  };
  for (let k = 0; k < 4; k++) frond(-60, -40, 0.15 + k * 0.32, 560 - k * 40, 1);
  for (let k = 0; k < 3; k++) frond(W + 60, -40, Math.PI - 0.2 - k * 0.34, 480 - k * 40, -1);

  // the jacket, collar up, shoulders past the sheet's edges
  const jacket: Pt[] = [[90, H], [140, 1290], [300, 1150], [500, 1090], [640, 1260], [780, 1090], [980, 1140], [1130, 1280], [1170, H]];
  S.lasso(jacket, TEAL);
  S.lasso([[540, 1100], [640, 1260], [740, 1100], [700, 1040], [580, 1040]], PINK);
  S.lasso([[500, 1090], [470, 980], [560, 1040], [620, 1300], [600, 1440], [430, 1180]], PALM);
  S.lasso([[780, 1090], [810, 980], [720, 1040], [660, 1300], [680, 1440], [850, 1180]], PALM);
  S.alpha = 0.35;
  S.lasso([[880, 1120], [1130, 1280], [1170, H], [900, H], [940, 1300]], INK);
  S.alpha = 1;
  S.poly(jacket.slice(1, -1), "brushpen", INK, 14, 0.6);
  S.poly([[500, 1090], [470, 980], [560, 1040], [620, 1300], [600, 1440]], "brushpen", INK, 10, 0.5);
  S.poly([[780, 1090], [810, 980], [720, 1040], [660, 1300], [680, 1440]], "brushpen", INK, 10, 0.5);

  // the neck, then the head, three-quarter, the sun on its left cheek
  S.lasso([[585, 900], [580, 1070], [700, 1070], [705, 880]], ORANGE);
  S.alpha = 0.6;
  S.lasso([[585, 930], [705, 880], [700, 1000], [600, 1010]], VIOLET);
  S.alpha = 1;
  S.line(585, 900, 580, 1070, "brushpen", INK, 10, 0.3);
  S.line(705, 880, 700, 1070, "brushpen", INK, 10, 0.3);
  const face = curve(
    [[520, 470], [600, 400], [720, 420]],
    [[720, 420], [810, 440], [815, 560]],
    [[815, 560], [830, 700], [790, 800]],
    [[790, 800], [740, 930], [655, 965]],
    [[655, 965], [590, 960], [555, 880]],
    [[555, 880], [505, 790], [500, 660]],
    [[500, 660], [495, 540], [520, 470]],
  );
  S.lasso(face, ORANGE);
  // the shadow side and the jaw's shadow, laid over in violet; the lit edge in pink
  S.alpha = 0.55;
  S.lasso(curve([[735, 430], [800, 470], [815, 560]], [[815, 560], [830, 700], [790, 800]], [[790, 800], [740, 930], [655, 965]], [[655, 965], [720, 820], [735, 640]], [[735, 640], [745, 520], [735, 430]]), VIOLET);
  S.alpha = 0.5;
  S.lasso(curve([[525, 480], [510, 600], [515, 700]], [[515, 700], [525, 820], [570, 900]], [[570, 900], [545, 780], [550, 640]], [[550, 640], [550, 540], [525, 480]]), PINK);
  S.alpha = 1;
  S.path(face, "brushpen", INK, 12, () => 0.8);
  // an ear on the near side
  S.lasso(blob(S, 503, 700, 30, 58, 0.08, 20), ORANGE);
  S.path(bend([508, 670], [490, 700], [508, 735], 8), "brushpen", INK, 6, () => 0.6);

  // the hair: a swept quiff, dark, teal light running along it
  const hair = curve(
    [[490, 700], [450, 520], [520, 390]],
    [[520, 390], [600, 280], [760, 290]],
    [[760, 290], [880, 300], [900, 400]],
    [[900, 400], [850, 380], [820, 420]],
    [[820, 420], [810, 470], [780, 440]],
    [[780, 440], [680, 420], [580, 470]],
    [[580, 470], [530, 520], [520, 640]],
    [[520, 640], [510, 690], [490, 700]],
  );
  S.lasso(hair, INK);
  for (let k = 0; k < 7; k++) S.path(bend([520 + k * 14, 520 - k * 26], [590 + k * 16, 330 - k * 4], [780 + k * 16, 320 + k * 12], 14), "brushpen", TEAL, 8, (t) => 0.85 - t * 0.7);

  // aviators, the sunset in each lens
  const lens = (cx: number, cy: number, rx: number): Pt[] => curve(
    [[cx - rx, cy - 30], [cx, cy - 44], [cx + rx, cy - 30]],
    [[cx + rx, cy - 30], [cx + rx + 6, cy + 30], [cx + rx * 0.3, cy + 56]],
    [[cx + rx * 0.3, cy + 56], [cx - rx * 0.8, cy + 60], [cx - rx, cy - 30]],
  );
  for (const [cx, rx] of [[602, 80], [768, 56]] as [number, number][]) {
    const l = lens(cx, 625, rx);
    S.lasso(l, VIOLET);
    // the sunset's bands, cut to the lens
    const band = (y0: number, y1: number, c: string) => {
      const a = crossings(l, y0), b = crossings(l, y1);
      if (a.length >= 2 && b.length >= 2) S.lasso([[a[0], y0], [a[a.length - 1], y0], [b[b.length - 1], y1], [b[0], y1]], c);
    };
    band(612, 640, PINK);
    band(644, 662, ORANGE);
    band(666, 676, ORANGE);
    band(680, 690, PINK);
    S.poly(l, "brushpen", INK, 9, 0.3);
    S.line(cx - rx * 0.6, 604, cx - rx * 0.2, 600, "brushpen", PINK, 6, 0.2);
  }
  S.path(bend([682, 600], [690, 590], [712, 598], 8), "brushpen", INK, 9, () => 0.9);
  S.line(522, 600, 494, 640, "brushpen", INK, 9, 0.2);
  // the nose's edge, the mouth with a half smile
  S.path(bend([716, 690], [740, 770], [704, 800], 10), "brushpen", INK, 8, (t) => 0.9 - t * 0.4);
  S.path(bend([628, 862], [680, 872], [728, 846], 10), "brushpen", INK, 9, () => 0.85);
  S.path(bend([728, 846], [736, 840], [740, 832], 4), "brushpen", INK, 6, () => 0.6);
  // the outline that holds it all, bold

  // halftone on the shadow side
  S.alpha = 0.6;
  for (let y = 480; y < 930; y += 20)
    for (let x = 750; x < 830; x += 20) {
      const xx = x + ((y / 20) % 2) * 10;
      if (xx < 790 - (y - 480) * 0.12 + 60 && xx > 720 + (y - 480) * 0.05) S.path([[xx, y], [xx + 0.5, y + 0.5]], "ink", VIOLET, 6 + (xx - 740) * 0.06, () => 0.6);
    }
  S.alpha = 1;

  // a loading bar along the foot, most of the way there, and the frame round the poster
  S.lasso(box(140, 1488, 920, 44), INK);
  S.lasso(box(152, 1498, 640, 24), ORANGE);
  for (let x = 172; x < 790; x += 40) S.line(x, 1500, x - 12, 1520, "ink", PINK, 8, 0.1);
  S.lasso(box(0, 0, W, 30), INK);
  S.lasso(box(0, H - 30, W, 30), INK);
  S.lasso(box(0, 0, 30, H), INK);
  S.lasso(box(W - 30, 0, 30, H), INK);
}

/* ---- 4. the last gas before the coast: a lilac dusk, a roadside station, a car pulling out ----
   The mood of a famous key art (a violet dusk on a road with palms, a station, an old car),
   none of its things: no people, no names or logos, nothing written anywhere. */
export function genStation(S: Sketch) {
  const W = 1600, HZ = 820;
  // the sky: deep lilac at the top to peach on the horizon, long pink streaks across
  sky(S, 0, W, 0, HZ + 20, ["#4B3F8F", "#6656A8", "#8C70BE", "#B985C6", "#E59BBE", "#FFB8A8", "#FFD2A6"], 40);
  for (let k = 0; k < 9; k++) {
    const y = 130 + k * 62 + S.R() * 30, x0 = -100 + S.R() * 600, len = 500 + S.R() * 900;
    S.alpha = 0.35 + S.R() * 0.2;
    S.path(bend([x0, y + 30], [x0 + len * 0.5, y - 10], [x0 + len, y + 20], 14), "marker", k % 2 ? "#FFA6D2" : "#F08CC8", 8 + S.R() * 14, (t) => 0.3 + Math.sin(t * Math.PI) * 0.7);
  }
  S.alpha = 1;
  // a contrail, and the plane at its head
  S.alpha = 0.55;
  S.path(bend([90, 610], [260, 470], [420, 330], 12), "marker", "#F4E8FF", 9, (t) => 0.2 + t * 0.8);
  S.alpha = 1;
  S.lasso([[420, 330], [452, 318], [458, 322], [430, 336]], "#3A2F6A");
  S.lasso([[436, 326], [430, 306], [440, 306], [448, 322]], "#3A2F6A");
  S.lasso([[436, 330], [444, 346], [452, 344], [446, 328]], "#3A2F6A");
  for (const [gx, gy, g] of [[930, 560, 1], [975, 590, 0.7]]) S.poly([[gx, gy], [gx + 16 * g, gy - 10 * g], [gx + 32 * g, gy], [gx + 48 * g, gy - 10 * g], [gx + 64 * g, gy]], "ink", "#3A2F6A", 4, 0.3);

  // far palms, pale with the haze, and the low scrub on the horizon
  const haze = "#8A78C0";
  for (const [x, h, l, s] of [[260, 470, -20, 0.6], [430, 560, 30, 0.7], [1180, 520, 40, 0.65], [1330, 420, -30, 0.55], [1470, 610, 20, 0.75]] as [number, number, number, number][]) palm(S, x, HZ + 10, h, l, s, haze);
  S.lasso(below(ridge(0, W, HZ + 4, (x) => 10 + Math.sin(x / 90) * 8, 10, 31), HZ + 40), "#7F6DB5");

  // the power line along the road: poles and three wires sagging between them
  const poles = [1080, 1300, 1520];
  for (const x of poles) {
    S.line(x, HZ + 30, x + 4, HZ - 330 + (x - 1080) * 0.25, "brushpen", "#4A3E7E", 12, 0.2);
    S.line(x - 40, HZ - 300 + (x - 1080) * 0.25, x + 48, HZ - 304 + (x - 1080) * 0.25, "brushpen", "#4A3E7E", 8, 0.2);
  }
  for (let wi = 0; wi < 3; wi++)
    for (let i = -1; i < poles.length; i++) {
      const xa = i < 0 ? -400 : poles[i], xb = i + 1 < poles.length ? poles[i + 1] : W + 200;
      const ya = HZ - 300 + (xa - 1080) * 0.25 + wi * 0 - 6, yb = HZ - 300 + (xb - 1080) * 0.25 - 6;
      const dx = [-34, 4, 40][wi];
      S.path(bend([xa + dx, ya], [(xa + xb) / 2 + dx, (ya + yb) / 2 + 60], [xb + dx, yb], 14), "ink", "#4A3E7E", 3, () => 0.7);
    }

  // the shop behind the canopy: a long flat box, warm windows, a striped fascia, nothing written
  const shopL = 120, shopR = 760, shopTop = 610, base = HZ + 40;
  S.lasso(box(shopL, shopTop, shopR - shopL, base - shopTop), "#7C82C8");
  S.lasso(box(shopL - 10, shopTop - 40, shopR - shopL + 20, 50), "#E9E2F4");
  S.lasso(box(shopL - 10, shopTop - 14, shopR - shopL + 20, 12), "#F2C14E");
  S.lasso(box(shopL - 10, shopTop + 8, shopR - shopL + 20, 22), "#5E64A8");
  for (let k = 0; k < 6; k++) {
    const x = shopL + 30 + k * 104;
    S.lasso(box(x, shopTop + 60, 84, 120), k === 2 ? "#5E64A8" : "#FFD98A");
    S.alpha = 0.35;
    S.lasso(box(x, shopTop + 60, 84, 40), "#FFF3C8");
    S.alpha = 1;
    S.line(x + 42, shopTop + 60, x + 42, shopTop + 180, "ink", "#5E64A8", 4, 0.1);
  }
  S.lasso(box(shopL + 238, shopTop + 50, 84, 150), "#3E3F80");
  // the canopy over the pumps, seen from the road: a deep slab on four posts, lit underneath
  const cL = 420, cR = 1180, cTop = 520, cBot = 600;
  for (const x of [470, 700, 920, 1130]) S.lasso(box(x - 14, cBot, 28, base - cBot + 30), "#6C6FB8");
  S.lasso([[cL, cTop], [cR, cTop - 10], [cR, cBot - 6], [cL, cBot]], "#EDE6F6");
  S.lasso([[cL, cTop + 46], [cR, cTop + 36], [cR, cTop + 52], [cL, cTop + 62]], "#F2C14E");
  S.lasso([[cL, cBot], [cR, cBot - 6], [cR - 30, cBot + 18], [cL + 30, cBot + 22]], "#9C8FD0");
  for (const x of [520, 640, 760, 880, 1000, 1110]) {
    S.lasso(box(x, cBot + 8, 50, 8), "#FFF6D8");
    S.alpha = 0.18;
    soft(S, x + 25, cBot + 120, 110, "#FFF0C8", 0.5, 1.2, 10);
    S.alpha = 1;
  }
  // the pumps, plain boxes with a lit face
  for (const x of [560, 790, 1010]) {
    S.lasso(box(x, base - 120, 60, 130), "#D9D2EE");
    S.lasso(box(x + 10, base - 106, 40, 34), "#5E64A8");
    S.lasso(box(x + 14, base - 102, 32, 12), "#9CF0E0");
    S.lasso(box(x - 6, base + 6, 72, 10), "#7C82C8");
  }
  // the price pylon by the road: a tall post with blank lit panels
  S.lasso(box(1240, 380, 24, base - 380 + 40), "#6C6FB8");
  S.lasso(box(1190, 330, 124, 70), "#EDE6F6");
  S.lasso(box(1190, 360, 124, 10), "#F2C14E");
  for (let k = 0; k < 3; k++) S.lasso(box(1200, 410 + k * 46, 104, 36), "#3E3F80");

  // the road and the forecourt: lavender asphalt, pink light lying on it
  sky(S, 0, W, HZ + 40, 1200, ["#9D8CCB", "#8678BC", "#6E62A8", "#5A508F"], 14);
  S.alpha = 0.3;
  for (let k = 0; k < 6; k++) S.path([[0, HZ + 120 + k * 50], [W, HZ + 100 + k * 54]], "marker", "#F2A6C6", 20, () => 1);
  S.alpha = 1;
  for (let x = -40; x < W; x += 180) S.lasso([[x, 1080], [x + 110, 1078], [x + 106, 1092], [x - 4, 1094]], "#F2E3B8");
  // a truck parked at the far end of the lot, long and pale in the haze
  S.lasso(box(30, HZ - 70, 260, 120), "#8E86C8");
  S.lasso([[290, HZ - 30], [360, HZ - 30], [380, HZ + 10], [380, HZ + 50], [290, HZ + 50]], "#7A72BA");
  for (const wx of [70, 120, 330]) S.lasso(ellipse(wx, HZ + 54, 22, 22, 16), "#3E3F80");

  // the car, an old fastback from behind, pulling out onto the road, its tail lights burning
  const cx = 1080, cy = 1000, cw = 380;
  S.alpha = 0.4;
  soft(S, cx, cy + 20, 300, "#FF3A5A", 0.45, 0.45, 18);
  S.alpha = 1;
  S.lasso(ellipse(cx, cy + 96, cw * 0.62, 26, 30), "#2E2A58");
  S.lasso([[cx - cw / 2, cy + 80], [cx - cw / 2 - 6, cy - 10], [cx - cw / 2 + 30, cy - 40], [cx + cw / 2 - 30, cy - 40], [cx + cw / 2 + 6, cy - 10], [cx + cw / 2, cy + 80]], "#4C4A86");
  S.lasso([[cx - cw / 2 + 40, cy - 40], [cx - 110, cy - 130], [cx + 110, cy - 130], [cx + cw / 2 - 40, cy - 40]], "#5B5898");
  S.lasso([[cx - cw / 2 + 64, cy - 46], [cx - 100, cy - 120], [cx + 100, cy - 120], [cx + cw / 2 - 64, cy - 46]], "#2E2C5C");
  S.alpha = 0.45;
  S.lasso([[cx - 90, cy - 116], [cx - 40, cy - 116], [cx - 120, cy - 52], [cx - 160, cy - 50]], "#C7B8F0");
  S.alpha = 1;
  S.lasso(box(cx - cw / 2 - 4, cy - 14, cw + 8, 10), "#9C96D6");
  // the tail panel: three lit bars a side, a blank plate between
  S.lasso(box(cx - cw / 2 + 10, cy + 4, cw - 20, 44), "#2A1E3E");
  for (const side of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const x = side < 0 ? cx - cw / 2 + 22 + k * 40 : cx + cw / 2 - 56 - k * 40;
      S.lasso(box(x, cy + 12, 34, 28), "#FF4060");
      S.alpha = 0.7;
      S.lasso(box(x + 4, cy + 16, 26, 7), "#FFC8D0");
      S.alpha = 1;
    }
  S.lasso(box(cx - 40, cy + 14, 80, 26), "#E9E2F4");
  S.lasso(box(cx - cw / 2 - 8, cy + 50, cw + 16, 16), "#B9B4E2");
  for (const side of [-1, 1]) S.lasso(box(cx + side * (cw / 2 - 40) - 34, cy + 66, 68, 34), "#1E1B3A");
  // exhaust, drifting
  S.alpha = 0.3;
  S.path(bend([cx + 120, cy + 80], [cx + 180, cy + 70], [cx + 260, cy + 40], 8), "marker", "#E9E2F4", 34, (t) => 0.8 - t * 0.6);
  S.alpha = 1;

  // near palms, darker, framing the right side, and wires catching the last light
  palm(S, 1430, 1200, 1000, -60, 1.1, "#3A2F6A");
  palm(S, 1580, 1200, 760, 30, 0.9, "#3A2F6A");
  palm(S, 40, 1200, 880, 40, 1, "#3A2F6A");
}
