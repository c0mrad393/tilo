import { Sketch, type Pt } from "../engine/sketch";
import type { Piece } from "../engine/stroke";
import { below, blob, ellipse, hatch, mix, noise, ramp, ridge, sky, soft, speckle } from "./art";
import { PROMPT, SAMPLE_BY } from "./prompt";

export { PROMPT, publishedSample, SAMPLE_ACCOUNT, SAMPLE_BY, STAMP_COLOR, STAMPS } from "./prompt";

/* Tilo's sample pieces. Claude, an AI, drew them in code (src/data/art.ts has the tools it
   drew with): every mark is a real stroke with a real tool, so they replay and remix like
   any piece, but no hand made them, and the UI says so wherever they appear. They are the
   bar for people to beat, not the work Tilo is for. */
const [NAVY, LAMP, EMBER, MOSS, CREAM, INK] = PROMPT.palette;

const scale = (pts: Pt[], cx: number, cy: number, s: number, sy = s): Pt[] => pts.map(([x, y]) => [cx + (x - cx) * s, cy + (y - cy) * sy]);

/* ---- A window at night: the subject's own six inks, nothing else ---- */

// the window: an arch over a rectangle, the way old Tbilisi windows are cut
const WX = 800, WTOP = 250, WSPRING = 520, WBOT = 900, WR = 270;
const arch = (inset = 0): Pt[] => [
  ...ellipse(WX, WSPRING, WR - inset, WR - inset, 40, Math.PI, Math.PI * 2),
  [WX + WR - inset, WBOT - inset],
  [WX - WR + inset, WBOT - inset],
];

function genWindow(S: Sketch) {
  // a strip of sky over the eave, with the moon in it
  S.lasso([[0, 0], [1600, 0], [1600, 230], [0, 230]], NAVY);
  for (let i = 0; i < 16; i++) {
    S.alpha = 0.05;
    S.lasso([[0, 0], [1600, 0], [1600, 200 - i * 12], [0, 200 - i * 12]], INK);
  }
  S.alpha = 1;
  soft(S, 1330, 96, 330, CREAM, 0.35);
  S.lasso(ellipse(1330, 96, 50, 50, 40), CREAM);
  S.alpha = 0.16;
  [[1312, 82, 13], [1348, 112, 9], [1342, 74, 6]].forEach(([x, y, r]) => S.lasso(ellipse(x, y, r, r * 0.8, 16), NAVY));
  S.alpha = 1;
  for (let i = 0; i < 34; i++) {
    const x = S.R() * 1600, y = 10 + S.R() * 150;
    if (Math.hypot(x - 1330, y - 96) < 110) continue;
    S.alpha = 0.35 + S.R() * 0.65;
    const r = 1.4 + S.R() * 2.6;
    S.path([[x, y], [x + 0.5, y + 0.5]], "ink", CREAM, r, () => 0.6);
    if (r > 3.6) { S.line(x - 10, y, x + 10, y, "pencil", CREAM, 2, 0); S.line(x, y - 10, x, y + 10, "pencil", CREAM, 2, 0); }
  }
  S.alpha = 1;

  // the wall: navy plaster, darker away from the window
  S.lasso([[0, 200], [1600, 200], [1600, 1200], [0, 1200]], mix(NAVY, INK, 0.12));
  S.alpha = 0.5;
  soft(S, 0, 1200, 700, INK, 0.8);
  soft(S, 1600, 1200, 700, INK, 0.8);
  S.alpha = 1;
  speckle(S, 0, 220, 1600, 980, 420, CREAM, 2.2);
  S.strokes.slice(-420).forEach((st) => (st.a = 0.06));
  // a patch where the plaster fell off, bricks underneath
  const patch = blob(S, 250, 470, 150, 96, 0.3);
  S.alpha = 0.45;
  S.lasso(patch, mix(NAVY, EMBER, 0.4));
  S.alpha = 0.5;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) {
    const x = 128 + c * 52 + (r % 2) * 26, y = 396 + r * 32;
    if (Math.hypot((x + 23 - 250) / 150, (y + 13 - 470) / 96) < 0.8) S.rect(x, y, 46, 26, "pencil", INK, 3, 0.5);
  }
  S.alpha = 0.6;
  S.poly(patch.slice(4, 26), "pencil", mix(NAVY, CREAM, 0.3), 3, 1.2, 10);
  S.poly([[1190, 960], [1222, 1004], [1212, 1050], [1250, 1100]], "pencil", INK, 3, 2.5, 8);
  S.poly([[110, 760], [160, 780], [176, 840]], "pencil", INK, 3, 2, 8);
  S.alpha = 1;

  // the eave: a row of clay tiles and the dark under the roof
  S.lasso([[0, 196], [1600, 196], [1600, 236], [0, 236]], INK);
  for (let x = -20; x < 1620; x += 58) {
    S.lasso([...ellipse(x + 29, 196, 30, 22, 14, 0, Math.PI)], mix(INK, EMBER, 0.28));
    S.alpha = 0.6;
    S.path(ellipse(x + 29, 196, 28, 20, 10, Math.PI * 0.15, Math.PI * 0.55), "pencil", EMBER, 3, () => 0.5);
    S.alpha = 1;
  }
  S.alpha = 0.6;
  S.path([[0, 240], [1600, 240]], "pencil", mix(NAVY, CREAM, 0.2), 3, () => 0.5);
  S.alpha = 1;

  // lamplight spilling onto the wall
  soft(S, WX, 600, 760, LAMP, 0.32, 0.8);
  soft(S, WX, 1060, 520, EMBER, 0.3, 0.35);

  // the room inside: warm at the edges, nearly white where the lamp hangs
  S.lasso(arch(), EMBER);
  for (let i = 1; i <= 14; i++) {
    S.alpha = 0.3;
    S.lasso(scale(arch(), WX, 470, 1 - i * 0.055, 1 - i * 0.05), i < 8 ? LAMP : CREAM);
  }
  S.alpha = 1;
  // shelf and books against the light
  S.alpha = 0.55;
  S.lasso([[560, 720], [700, 720], [700, 734], [560, 734]], INK);
  [[566, 30, 92], [600, 22, 74], [626, 26, 98], [656, 20, 66]].forEach(([x, w, h]) => S.lasso([[x, 720], [x + w, 720], [x + w - 2, 720 - h], [x + 2, 720 - h]], [EMBER, MOSS, NAVY, EMBER][(x / 10) % 4 | 0]));
  S.alpha = 1;
  // the hanging lamp
  S.line(WX + 40, WTOP + 10, WX + 40, 420, "ink", INK, 3, 0.4);
  S.lasso([[WX - 25, 470], [WX + 105, 470], [WX + 75, 420], [WX + 5, 420]], INK);
  soft(S, WX + 40, 488, 150, CREAM, 0.6);
  S.lasso(ellipse(WX + 40, 478, 22, 12, 20), CREAM);
  // the curtain, pulled to the right and tied back
  const curtain: Pt[] = [[WX + 110, WTOP + 40], [WX + WR, WSPRING - 190], [WX + WR, WBOT], [WX + 200, WBOT], [WX + 170, 800], [WX + 200, 690], [WX + 150, 560], [WX + 120, 400]];
  S.lasso(curtain, EMBER);
  S.alpha = 0.3;
  [[WX + 156, 9], [WX + 204, 12], [WX + 240, 8]].forEach(([x, w]) => S.poly([[x - 20, WTOP + 80], [x, 520], [x - 10, 680], [x + 12, WBOT - 8]], "wash", INK, w, 1.2, 24));
  S.alpha = 0.55;
  S.poly([[WX + 120, WTOP + 60], [WX + 132, 420], [WX + 158, 560], [WX + 194, 680]], "pencil", LAMP, 5, 1, 24);
  S.poly([[WX + 184, 704], [WX + 172, 800], [WX + 204, WBOT - 6]], "pencil", LAMP, 5, 1, 24);
  S.alpha = 1;
  S.path([[WX + 186, 690], [WX + WR - 4, 670]], "brushpen", INK, 10, () => 0.7);
  // the window frame: a fan in the arch, a cross below, wide wood all round
  S.alpha = 0.92;
  for (let i = 1; i < 6; i++) {
    const a = Math.PI + (i / 6) * Math.PI;
    S.path([[WX, WSPRING], [WX + Math.cos(a) * (WR - 10), WSPRING + Math.sin(a) * (WR - 10)]], "ink", INK, 9, () => 0.7);
  }
  S.alpha = 1;
  S.path(ellipse(WX, WSPRING, 70, 70, 24, Math.PI, Math.PI * 2), "ink", INK, 10, () => 0.7);
  S.path([[WX - WR + 6, WSPRING], [WX + WR - 6, WSPRING]], "ink", INK, 14, () => 0.75);
  S.path([[WX, WSPRING], [WX, WBOT]], "ink", INK, 14, () => 0.75);
  S.path([[WX - WR + 6, 712], [WX + WR - 6, 712]], "ink", INK, 10, () => 0.7);
  S.path([...ellipse(WX, WSPRING, WR, WR, 40, Math.PI, Math.PI * 2), [WX + WR, WBOT], [WX - WR, WBOT], [WX - WR, WSPRING]], "gouache", INK, 22, () => 0.8);
  S.alpha = 0.6;
  S.path(ellipse(WX, WSPRING, WR + 22, WR + 22, 40, Math.PI * 1.05, Math.PI * 1.6), "pencil", EMBER, 4, () => 0.6);
  S.alpha = 1;
  // glass catching the moon
  S.alpha = 0.35;
  [[WX + 150, 560, 220], [WX + 180, 760, 120], [WX - 220, 600, 160]].forEach(([x, y, l]) => S.line(x, y, x + l * 0.35, y - l, "pencil", CREAM, 5, 0.5));
  S.alpha = 1;

  // the sill and the carved balcony below it
  S.lasso([[WX - WR - 70, WBOT], [WX + WR + 70, WBOT], [WX + WR + 90, WBOT + 46], [WX - WR - 90, WBOT + 46]], INK);
  S.alpha = 0.7;
  S.path([[WX - WR - 70, WBOT + 3], [WX + WR + 70, WBOT + 3]], "ink", LAMP, 4, () => 0.6);
  S.alpha = 1;
  S.lasso([[0, 1010], [1600, 1010], [1600, 1036], [0, 1036]], INK);
  for (let x = 30; x < 1600; x += 92) {
    S.lasso([[x, 1036], [x + 30, 1036], [x + 30, 1200], [x, 1200]], INK);
    S.alpha = 0.85;
    S.lasso([[x + 46, 1060], [x + 70, 1100], [x + 46, 1140], [x + 22, 1100]].map(([a, b]) => [a + 15, b] as Pt), INK);
    S.alpha = 0.3;
    S.line(x + 3, 1040, x + 3, 1196, "pencil", Math.abs(x - WX) < 420 ? LAMP : CREAM, 3, 0.3);
    S.alpha = 1;
  }
  S.alpha = 0.55;
  S.path([[0, 1012], [1600, 1012]], "ink", EMBER, 4, () => 0.6);
  S.alpha = 1;

  // a vine coming down the wall, catching a little of the light
  const N = noise(41);
  const vine: Pt[] = Array.from({ length: 34 }, (_, i) => [440 + N(i / 6) * 60 + i * 1.5, 230 + i * 22]);
  S.path(vine, "brushpen", INK, 9, (t) => 0.8 - t * 0.5);
  vine.forEach(([x, y], i) => {
    if (i % 3 || i < 2) return;
    const side = i % 2 ? 1 : -1, lit = x > 440 && y > 300;
    const lx = x + side * (40 + S.R() * 20), ly = y + 10;
    S.path([[x, y], [lx, ly]], "ink", INK, 3, () => 0.5);
    S.lasso(blob(S, lx, ly, 30 + S.R() * 14, 24 + S.R() * 8, 0.22, 24, side * 0.5), lit ? MOSS : mix(MOSS, INK, 0.55));
    if (lit) { S.alpha = 0.45; S.path([[lx - side * 18, ly - 4], [lx + side * 20, ly + 6]], "pencil", LAMP, 2, () => 0.5); S.alpha = 1; }
  });
  // a pot on the sill with something growing
  S.lasso([[WX - WR + 20, WBOT], [WX - WR + 130, WBOT], [WX - WR + 115, WBOT - 80], [WX - WR + 35, WBOT - 80]], EMBER);
  S.alpha = 0.45;
  S.lasso([[WX - WR + 75, WBOT], [WX - WR + 130, WBOT], [WX - WR + 115, WBOT - 80], [WX - WR + 85, WBOT - 80]], INK);
  S.alpha = 1;
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.28, l = 90 + S.R() * 70;
    const bx = WX - WR + 75, by = WBOT - 80;
    const tip: Pt = [bx + Math.cos(a) * l, by + Math.sin(a) * l];
    S.path([[bx, by], [bx + Math.cos(a) * l * 0.5 + 8, by + Math.sin(a) * l * 0.55], tip], "brushpen", i % 3 ? MOSS : INK, 10, (t) => 0.9 - t * 0.7);
  }
}

function genWatcher(S: Sketch) {
  genWindow(S);
  // a cat on the sill, its back to the room, watching the moon
  const cx = WX + 170, cy = WBOT - 6;
  const body = blob(S, cx, cy - 70, 78, 70, 0.06, 40);
  S.lasso(body.filter(([, y]) => y < cy), INK);
  S.lasso(blob(S, cx + 36, cy - 168, 46, 40, 0.05, 32), INK);
  S.lasso([[cx + 2, cy - 190], [cx + 12, cy - 248], [cx + 38, cy - 200]], INK);
  S.lasso([[cx + 46, cy - 200], [cx + 74, cy - 246], [cx + 80, cy - 186]], INK);
  S.path([[cx - 60, cy - 10], [cx - 120, cy + 10], [cx - 150, cy + 70], [cx - 128, cy + 120], [cx - 100, cy + 124]], "brushpen", INK, 22, (t) => 0.95 - t * 0.5);
  // rim light where the lamp catches its fur
  S.alpha = 0.8;
  S.path(ellipse(cx, cy - 70, 80, 72, 20, Math.PI * 0.95, Math.PI * 1.55), "pencil", LAMP, 4, () => 0.7);
  S.path(ellipse(cx + 36, cy - 168, 48, 42, 14, Math.PI * 0.9, Math.PI * 1.4), "pencil", LAMP, 4, () => 0.7);
  S.path([[cx + 4, cy - 192], [cx + 12, cy - 246]], "pencil", LAMP, 3, () => 0.6);
  S.alpha = 1;
  // whiskers in the moonlight
  S.alpha = 0.6;
  [[-8, 0], [0, 6], [6, 12]].forEach(([dy, dx]) => S.line(cx + 76, cy - 160 + dy, cx + 130 + dx, cy - 172 + dy * 1.6, "pencil", CREAM, 2, 0.5));
  S.alpha = 1;
}

/* ---- Gergeti, first light: Kazbek and the church below it ---- */

function genGergeti(S: Sketch) {
  sky(S, 0, 1600, 0, 780, ["#22305C", "#46558E", "#8789B6", "#C99DA8", "#EFC2A4", "#F8DFB6"], 96);
  soft(S, 160, 720, 620, "#FFE9BE", 0.5, 0.55);
  // high cloud catching the sun
  [[960, 150, 260], [1300, 110, 200], [640, 230, 160]].forEach(([x, y, l]) => {
    for (let k = 0; k < 5; k++) {
      S.alpha = 0.22;
      const dy = k * 7 - 14, dl = l * (1 - Math.abs(k - 2) * 0.22);
      S.poly([[x - dl, y + dy + 6], [x - dl * 0.3, y + dy - 4], [x + dl * 0.4, y + dy + 2], [x + dl, y + dy - 3]], "wash", k > 2 ? "#F1AE9E" : "#FFF3EA", 5, 1.5, 30);
    }
  });
  S.alpha = 1;

  // Kazbek: a great peak with a shoulder each side, lit from the sunrise on the left
  const lift = (x: number) => Math.max(590 - Math.abs(x - 1060) * 1.02, 330 - Math.abs(x - 820) * 0.9, 360 - Math.abs(x - 1330) * 0.8, 0);
  const outline = ridge(520, 1660, 770, lift, 14, 7, 10);
  S.lasso(below(outline, 900), "#6A74AC");
  // the lit faces, cut by the ridges that run down from the summit
  const top = outline.reduce((m, p) => (p[1] < m[1] ? p : m));
  const spine: Pt[] = [top, [1036, 290], [1074, 400], [1018, 520], [1056, 640], [1004, 780]];
  S.lasso([...outline.filter(([x]) => x <= top[0]), ...spine, [520, 790]], "#F2D2CC");
  const shoulder = outline.filter(([x]) => x > 660 && x < 860);
  S.alpha = 0.6;
  S.lasso([...shoulder, [890, 520], [840, 640], [700, 700]], "#F7B9A4");
  S.alpha = 0.5;
  S.lasso([...outline.filter(([x]) => x > 1220 && x < 1450), [1380, 560], [1250, 600]], "#F3CFC8");
  S.alpha = 1;
  // couloirs and rock bands, following the fall line
  for (let i = 0; i < 16; i++) {
    const x = 760 + S.R() * 720, y = 420 + S.R() * 320;
    if (y < 770 - lift(x) + 60) continue;
    const l = 30 + S.R() * 70, lit = x < 1040;
    S.alpha = 0.35 + S.R() * 0.25;
    S.lasso([[x, y], [x + (lit ? -1 : 1) * l * 0.45, y + l], [x + (lit ? -1 : 1) * l * 0.45 + 5, y + l + 4], [x + 4, y + 3]], lit ? "#B08A93" : "#3F4576");
  }
  S.alpha = 0.32;
  hatch(S, [...spine, [1600, 790], [1600, 680], [1330, 410]], -1.15, 20, "pencil", "#363C6C", 3, 0.6);
  S.alpha = 0.55;
  for (let i = 0; i < 10; i++) {
    const x0 = 930 + i * 22 + S.R() * 10;
    S.poly([[x0, 320 + i * 26], [x0 - 50, 440 + i * 24], [x0 - 70, 560 + i * 18]], "pencil", "#FFFFFF", 3, 2.4, 20);
  }
  S.alpha = 1;
  S.poly(outline.filter(([x]) => x > 640 && x < 1520), "pencil", "#FFF4EA", 3, 0.6, 10);

  // the ranges in front, each nearer one darker and bluer, with mist lying between them
  const ranges: [number, string, number][] = [[740, "#8E90BF", 70], [820, "#676EA2", 90], [900, "#454E80", 60]];
  ranges.forEach(([y, c, h], i) => {
    S.lasso(below(ridge(-20, 1640, y, (x) => h * (0.6 + 0.4 * Math.sin(x / (230 + i * 60) + i)), 30, 20 + i, 16), 1200), c);
    for (let k = 0; k < 3; k++) {
      S.alpha = 0.28;
      const pts: Pt[] = Array.from({ length: 9 }, (_, j) => [-60 + j * 215, y + 36 + k * 16 + Math.sin(j * 1.3 + i + k) * 12]);
      S.poly(pts, "wash", "#F4E4E6", 22, 1, 60);
    }
    S.alpha = 1;
  });

  // the hill, and Gergeti Trinity on top of it
  const hill = ridge(-20, 1640, 1000, (x) => 370 * Math.exp(-(((x - 420) / 330) ** 2)), 10, 33, 14);
  S.lasso(below(hill, 1200), "#3C573B");
  const crest = hill.reduce((m, p) => (p[1] < m[1] ? p : m));
  // the side away from the sun, shaded with a curve rather than a cut
  const shade: Pt[] = [...hill.filter(([x]) => x >= crest[0]), [1640, 1200], ...Array.from({ length: 12 }, (_, i) => [crest[0] + 40 + (11 - i) * 22, crest[1] + ((11 - i) / 11) ** 1.4 * (1200 - crest[1])] as Pt)];
  S.alpha = 0.55;
  S.lasso(shade, "#22351F");
  S.alpha = 0.3;
  hatch(S, shade, 0.55, 15, "pencil", "#132012", 3, 0.6);
  S.alpha = 0.45;
  S.lasso([...hill.filter(([x]) => x < crest[0]).map(([x, y]) => [x, y + 4] as Pt), [crest[0] - 30, 1200], [-20, 1200]], "#76925A");
  S.alpha = 1;
  S.poly(hill.filter(([x]) => x < crest[0] + 10), "pencil", "#E9D59C", 3, 0.5, 10);
  const gx = crest[0], gy = crest[1] + 6;
  const stone = "#85705F", lit = "#E6BC90", roof = "#5A483C", dark = "#2A221E";
  S.lasso([[gx - 70, gy], [gx + 60, gy], [gx + 60, gy - 64], [gx - 70, gy - 64]], stone);
  S.lasso([[gx - 70, gy], [gx - 10, gy], [gx - 10, gy - 64], [gx - 70, gy - 64]], lit);
  S.lasso([[gx - 78, gy - 62], [gx - 4, gy - 98], [gx + 68, gy - 62]], roof);
  S.lasso([[gx - 78, gy - 62], [gx - 4, gy - 98], [gx - 4, gy - 62]], "#8F6E58");
  S.lasso([[gx - 20, gy - 80], [gx + 22, gy - 80], [gx + 22, gy - 130], [gx - 20, gy - 130]], stone);
  S.lasso([[gx - 20, gy - 80], [gx - 2, gy - 80], [gx - 2, gy - 130], [gx - 20, gy - 130]], lit);
  S.lasso([[gx - 26, gy - 128], [gx + 1, gy - 180], [gx + 28, gy - 128]], roof);
  S.lasso([[gx - 26, gy - 128], [gx + 1, gy - 180], [gx + 1, gy - 128]], "#A27C5E");
  S.lasso([[gx + 96, gy + 16], [gx + 130, gy + 16], [gx + 130, gy - 32], [gx + 96, gy - 32]], stone);
  S.lasso([[gx + 92, gy - 30], [gx + 113, gy - 56], [gx + 134, gy - 30]], roof);
  S.lasso([[gx + 106, gy + 4], [gx + 120, gy + 4], [gx + 120, gy - 18], [gx + 106, gy - 18]], dark);
  [[gx - 48, gy - 22], [gx + 30, gy - 22], [gx + 2, gy - 106]].forEach(([x, y]) => S.lasso([[x, y], [x + 8, y], [x + 8, y - 18], [x, y - 18]], dark));
  soft(S, gx - 40, gy - 50, 160, "#FFE1B0", 0.25);

  // the meadow close by, the path up, long grass
  S.lasso(below(ridge(-20, 1640, 1090, (x) => 40 * Math.sin(x / 400 + 1), 12, 51, 20), 1200), "#203119");
  S.alpha = 0.65;
  S.poly([[760, 1200], [700, 1130], [640, 1080], [600, 1010], [540, 940], [500, 860], [470, 780], [gx - 10, gy + 6]], "pencil", "#C9A77A", 6, 3, 14);
  S.alpha = 1;
  for (let i = 0; i < 180; i++) {
    const x = S.R() * 1600, y = 1080 + S.R() * 130, l = 18 + S.R() * 40;
    S.alpha = 0.45 + S.R() * 0.5;
    S.poly([[x, y], [x + (S.R() - 0.35) * 16, y - l]], "pencil", S.R() < 0.3 ? "#C2C57E" : "#4E6B36", 3, 0.6, 12);
  }
  S.alpha = 1;
  [[1250, 640], [1296, 614], [1330, 650]].forEach(([x, y]) => S.poly([[x - 14, y - 5], [x, y + 2], [x + 14, y - 7]], "ink", "#2A2E4A", 3, 0.4, 6));
}

/* ---- Old Tbilisi at dusk: Narikala on the ridge, houses down to the river ---- */

function house(S: Sketch, x: number, base: number, w: number, h: number, wall: string, roof: string, dusk: number, lit: number) {
  const top = base - h;
  S.lasso([[x, base], [x + w, base], [x + w, top], [x, top]], mix(wall, "#3A2F4A", dusk));
  S.alpha = 0.35;
  S.lasso([[x + w * 0.7, base], [x + w, base], [x + w, top], [x + w * 0.7, top]], "#2A2236");
  S.alpha = 1;
  if (S.R() < 0.55) S.lasso([[x - 6, top + 2], [x + w + 6, top + 2], [x + w * 0.5, top - h * 0.32]], mix(roof, "#2A2236", dusk));
  else S.lasso([[x - 4, top + 4], [x + w + 4, top + 4], [x + w + 4, top - 8], [x - 4, top - 8]], mix(roof, "#2A2236", dusk + 0.1));
  const cols = Math.max(1, Math.floor(w / 34)), rows = Math.max(1, Math.floor(h / 40));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const wx = x + 10 + c * ((w - 20) / cols), wy = top + 12 + r * 38;
    const on = S.R() < lit;
    S.lasso([[wx, wy], [wx + 13, wy], [wx + 13, wy + 20], [wx, wy + 20]], on ? "#FFD58A" : mix("#2A2236", wall, 0.2));
    if (on && S.R() < 0.5) soft(S, wx + 6, wy + 10, 34, "#FFC56E", 0.2, 1, 5);
  }
  // a carved wooden balcony on some of them
  if (h > 70 && S.R() < 0.55) {
    const by = top + h * 0.55;
    S.lasso([[x - 8, by], [x + w + 8, by], [x + w + 8, by + 6], [x - 8, by + 6]], "#2A1E1A");
    for (let k = x - 4; k < x + w + 6; k += 9) S.path([[k, by + 6], [k, by + 26]], "ink", "#2A1E1A", 2, () => 0.6);
    S.path([[x - 8, by + 26], [x + w + 8, by + 26]], "ink", "#2A1E1A", 3, () => 0.6);
  }
}

function genOldTown(S: Sketch) {
  sky(S, 0, 1600, 0, 760, ["#272B58", "#4D3F78", "#8C5A86", "#D7787A", "#F2A473", "#F7C98C"], 90);
  soft(S, 1250, 640, 600, "#FFD9A0", 0.35, 0.5);
  S.lasso(ellipse(1340, 150, 26, 26, 30), "#F8EED8");
  S.lasso(ellipse(1352, 142, 24, 24, 30), mix("#272B58", "#4D3F78", 0.4));
  for (let i = 0; i < 26; i++) {
    const x = S.R() * 1600, y = S.R() * 260;
    S.alpha = 0.3 + S.R() * 0.6;
    S.path([[x, y], [x + 0.5, y]], "ink", "#F8EED8", 1.5 + S.R() * 2, () => 0.6);
  }
  S.alpha = 1;
  // the ridge and Narikala's walls along it, black against the sky
  const crest = ridge(-20, 1640, 560, (x) => 170 * Math.exp(-(((x - 420) / 420) ** 2)) + 40 - Math.max(0, x - 1000) * 0.25, 16, 61, 14);
  S.lasso(below(crest, 1200), "#3B2E48");
  const wallLine = crest.filter(([x]) => x > 120 && x < 820);
  for (let i = 0; i < wallLine.length - 1; i += 2) {
    const [x, y] = wallLine[i];
    S.lasso([[x, y + 6], [x + 30, y + 6], [x + 30, y - 18], [x, y - 18]], "#241C30");
    if (i % 4 === 0) S.lasso([[x + 4, y - 18], [x + 14, y - 18], [x + 14, y - 28], [x + 4, y - 28]], "#241C30");
  }
  [[200, 70, 34], [470, 96, 44], [700, 62, 30]].forEach(([x, h, w]) => {
    const y = crest.reduce((m, p) => (Math.abs(p[0] - x) < Math.abs(m[0] - x) ? p : m))[1];
    S.lasso([[x - w / 2, y + 10], [x + w / 2, y + 10], [x + w / 2 - 4, y - h], [x - w / 2 + 4, y - h]], "#221A2D");
    for (let k = 0; k < 3; k++) S.lasso([[x - w / 2 + 4 + k * (w / 3), y - h], [x - w / 2 + 4 + k * (w / 3) + w / 6, y - h], [x - w / 2 + 4 + k * (w / 3) + w / 6, y - h - 10], [x - w / 2 + 4 + k * (w / 3), y - h - 10]], "#221A2D");
    S.alpha = 0.7;
    S.path([[x - w / 2 + 4, y - h], [x - w / 2, y + 10]], "pencil", "#E8907A", 3, () => 0.5);
    S.alpha = 1;
  });
  // the town, row on row down the slope; nearer rows are bigger and less dusky
  const walls = ["#C98B6B", "#DDB78F", "#93A6A2", "#BC756B", "#E7CBA4", "#8493AA", "#D19C7B"];
  const roofs = ["#8E3B2E", "#6B4A3C", "#A0503A", "#55443F"];
  for (let r = 0; r < 7; r++) {
    const base = 660 + r * 62, scaleH = 0.7 + r * 0.12, dusk = 0.55 - r * 0.07;
    let x = -30 + S.R() * 40;
    while (x < 1120 - r * 30) {
      const w = (60 + S.R() * 80) * scaleH, h = (50 + S.R() * 60) * scaleH;
      house(S, x, base + S.R() * 10, w, h, walls[Math.floor(S.R() * walls.length)], roofs[Math.floor(S.R() * roofs.length)], dusk, 0.35 + r * 0.04);
      x += w + 4 + S.R() * 10;
    }
  }
  // Metekhi on its cliff above the river
  const cliff: Pt[] = [[1060, 1200], [1080, 960], [1120, 900], [1300, 880], [1420, 910], [1480, 1040], [1500, 1200]];
  S.lasso(cliff, "#3A2C3C");
  S.alpha = 0.5;
  hatch(S, cliff, 1.2, 14, "pencil", "#241A26", 3, 0.6);
  S.alpha = 1;
  const mx = 1270, my = 880;
  S.lasso([[mx - 110, my], [mx + 110, my], [mx + 110, my - 90], [mx - 110, my - 90]], "#C9A27E");
  S.lasso([[mx + 40, my], [mx + 110, my], [mx + 110, my - 90], [mx + 40, my - 90]], "#8E6E5A");
  S.lasso([[mx - 120, my - 88], [mx, my - 130], [mx + 120, my - 88]], "#5A4038");
  S.lasso([[mx - 30, my - 110], [mx + 30, my - 110], [mx + 30, my - 170], [mx - 30, my - 170]], "#C9A27E");
  S.lasso([[mx - 36, my - 168], [mx, my - 236], [mx + 36, my - 168]], "#5A4038");
  S.alpha = 0.8;
  S.path([[mx - 36, my - 168], [mx, my - 236]], "pencil", "#F0A07A", 3, () => 0.5);
  S.alpha = 1;
  [[-70, -60], [-30, -60], [10, -60], [-8, -150]].forEach(([dx, dy]) => S.lasso([[mx + dx, my + dy], [mx + dx + 10, my + dy], [mx + dx + 10, my + dy + 28], [mx + dx, my + dy + 28]], "#FFD58A"));
  soft(S, mx - 20, my - 60, 200, "#FFD08A", 0.18);
  // the Mtkvari, carrying the lights
  S.lasso([[0, 1080], [1600, 1080], [1600, 1200], [0, 1200]], "#2B2A4C");
  sky(S, 0, 1600, 1080, 1200, ["#4B3E68", "#2B2A4C", "#1E1F3A"], 12);
  for (let i = 0; i < 70; i++) {
    const x = S.R() * 1600, y = 1090 + S.R() * 100, l = 10 + S.R() * 40;
    S.alpha = 0.25 + S.R() * 0.5;
    S.path([[x, y], [x + l, y + (S.R() - 0.5) * 3]], "marker", S.R() < 0.6 ? "#FFC977" : "#E8907A", 2 + S.R() * 2, () => 0.6);
  }
  S.alpha = 1;
}

/* ---- Pomegranates on linen ---- */

function pomegranate(S: Sketch, cx: number, cy: number, r: number, turn = 0) {
  // its shadow on the cloth first
  S.alpha = 0.35;
  S.lasso(blob(S, cx + r * 0.35, cy + r * 0.92, r * 1.05, r * 0.24, 0.05, 32), "#4A3427");
  S.alpha = 1;
  const body = blob(S, cx, cy, r, r * 0.95, 0.04, 48, turn);
  S.lasso(body, "#6E1720");
  const lights = ["#861C25", "#94222A", "#A3292F", "#B23233", "#BF3B38", "#CB473E", "#D65848", "#E06F57"];
  lights.forEach((c, i) => {
    const t = (i + 1) / (lights.length + 1);
    S.alpha = 0.55;
    S.lasso(blob(S, cx - r * 0.28 * t, cy - r * 0.3 * t, r * (1 - t * 0.85), r * 0.95 * (1 - t * 0.85), 0.05, 36, turn), c);
  });
  S.alpha = 0.35;
  S.lasso(blob(S, cx + r * 0.25, cy + r * 0.22, r * 0.75, r * 0.7, 0.06, 36), "#3A0A10");
  S.alpha = 0.9;
  S.lasso(ellipse(cx - r * 0.42, cy - r * 0.42, r * 0.11, r * 0.07, 16), "#FBE2CF");
  S.alpha = 0.4;
  S.lasso(ellipse(cx - r * 0.45, cy - r * 0.38, r * 0.24, r * 0.15, 20), "#F6B49A");
  S.alpha = 0.55;
  S.path(ellipse(cx, cy, r * 0.97, r * 0.93, 30, Math.PI * 0.05, Math.PI * 0.75), "pencil", "#E98C6C", 4, () => 0.5);
  S.alpha = 1;
  // the crown
  const tx = cx + Math.sin(turn) * r * 0.9, ty = cy - Math.cos(turn) * r * 0.92;
  S.lasso(ellipse(tx, ty + 6, r * 0.16, r * 0.09, 20), "#4E0E14");
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + turn + (k - 2.5) * 0.32;
    const tip: Pt = [tx + Math.cos(a) * r * 0.3, ty + Math.sin(a) * r * 0.26];
    S.lasso([[tx - 9, ty + 4], tip, [tx + 9, ty + 4]], k % 2 ? "#5C121A" : "#7A1C24");
    S.alpha = 0.6;
    S.path([[tx, ty], tip], "pencil", "#D46A55", 2, () => 0.5);
    S.alpha = 1;
  }
}

function genPomegranates(S: Sketch) {
  sky(S, 0, 1400, 0, 900, ["#2A1D1B", "#3A2823", "#4E342B"], 50);
  soft(S, 380, 360, 760, "#8A5A40", 0.35);
  // the linen, with its folds and two blue threads
  S.lasso([[0, 860], [1400, 820], [1400, 1400], [0, 1400]], "#E6D7BC");
  sky(S, 0, 1400, 900, 1400, ["#E9DCC3", "#D9C7A6"], 20);
  S.strokes.slice(-20).forEach((st) => (st.a = 0.6));
  S.alpha = 0.5;
  [[200, 900, 120, 1400], [760, 880, 640, 1400], [1180, 860, 1300, 1400]].forEach(([x0, y0, x1, y1]) => S.poly([[x0, y0], [(x0 + x1) / 2 + 30, (y0 + y1) / 2], [x1, y1]], "wash", "#B39E7E", 18, 2, 40));
  S.alpha = 0.7;
  [[1286, 18], [1322, 8]].forEach(([y, w]) => S.lasso([[0, y], [1400, y - 26], [1400, y - 26 + w], [0, y + w]], "#4D6A94"));
  S.alpha = 1;
  S.poly([[0, 862], [700, 842], [1400, 822]], "pencil", "#F6EEDC", 3, 1, 30);

  pomegranate(S, 930, 760, 190, 0.25);
  pomegranate(S, 520, 820, 250, -0.18);

  // one broken open in front: rind, pith and the seeds packed inside
  const ox = 960, oy = 1110, orx = 220, ory = 150;
  S.alpha = 0.35;
  S.lasso(blob(S, ox + 60, oy + 120, 260, 50, 0.05, 30), "#4A3427");
  S.alpha = 1;
  S.lasso(blob(S, ox, oy + 30, orx, ory * 1.05, 0.05, 40), "#7A1A22");
  S.lasso(blob(S, ox, oy, orx * 0.94, ory * 0.92, 0.06, 40), "#F0D9B8");
  S.alpha = 0.5;
  for (let k = 0; k < 5; k++) S.poly([[ox, oy], [ox + Math.cos(k * 1.26) * orx * 0.9, oy + Math.sin(k * 1.26) * ory * 0.85]], "pencil", "#D9B98E", 6, 1.5, 20);
  S.alpha = 1;
  for (let y = oy - ory * 0.8; y < oy + ory * 0.8; y += 20) for (let x = ox - orx * 0.85; x < ox + orx * 0.85; x += 22) {
    const px = x + (S.R() - 0.5) * 8 + ((y / 20) % 2) * 11, py = y + (S.R() - 0.5) * 6;
    if (((px - ox) / (orx * 0.86)) ** 2 + ((py - oy) / (ory * 0.82)) ** 2 > 1 || S.R() < 0.08) continue;
    const c = ramp(["#8E0F2A", "#C2183A", "#E23B55"], S.R());
    S.lasso(blob(S, px, py, 11, 9, 0.12, 12, S.R() * 3), c);
    S.alpha = 0.85;
    S.path([[px - 3, py - 3], [px - 2, py - 3]], "ink", "#FFE6EA", 3, () => 0.6);
    S.alpha = 1;
  }
  S.alpha = 0.6;
  S.path(ellipse(ox, oy, orx * 0.94, ory * 0.92, 40, 0, Math.PI * 2), "pencil", "#5E1018", 4, () => 0.5);
  S.alpha = 1;
  // loose seeds and a leaf on the cloth
  for (let i = 0; i < 9; i++) {
    const px = 280 + S.R() * 360, py = 1200 + S.R() * 120;
    S.lasso(blob(S, px, py, 11, 9, 0.12, 12), "#C2183A");
    S.alpha = 0.85;
    S.path([[px - 3, py - 3], [px - 2, py - 3]], "ink", "#FFE6EA", 3, () => 0.6);
    S.alpha = 1;
  }
  const leaf: Pt[] = [...ellipse(300, 1110, 150, 40, 18, Math.PI, Math.PI * 2), ...ellipse(300, 1110, 150, 34, 18, 0, Math.PI)].map(([x, y]) => [x + (y - 1110) * 0.4, y + (x - 300) * -0.25] as Pt);
  S.lasso(leaf, "#2F4A2A");
  S.alpha = 0.5;
  S.lasso(leaf.slice(0, 19), "#5E7D45");
  S.alpha = 1;
  S.path([[160, 1150], [440, 1070]], "pencil", "#1E301B", 3, () => 0.5);
}

/* ---- The Black Sea at low tide, Batumi in the distance ---- */

function genBlackSea(S: Sketch) {
  sky(S, 0, 1600, 0, 600, ["#2E3C69", "#5C5A8C", "#A6708F", "#E38E79", "#F6B97C", "#F9D894"], 90);
  // long clouds, lit from underneath
  [[300, 180, 380], [1150, 260, 460], [700, 380, 300], [1350, 420, 220]].forEach(([x, y, l], i) => {
    const pts: Pt[] = [[x - l, y + 8], [x - l * 0.5, y - 10], [x, y - 14], [x + l * 0.6, y - 6], [x + l, y + 6], [x + l * 0.4, y + 18], [x - l * 0.5, y + 16]];
    S.alpha = 0.75;
    S.lasso(pts, i < 2 ? "#6B5A84" : "#B5727E");
    S.alpha = 0.8;
    S.path([[x - l * 0.7, y + 14], [x + l * 0.7, y + 12]], "marker", i < 2 ? "#E99C86" : "#FFD39A", 4, () => 0.6);
    S.alpha = 1;
  });
  const sx = 1040, hz = 600;
  soft(S, sx, hz - 30, 560, "#FFE2A8", 0.5, 0.7);
  S.lasso(ellipse(sx, hz - 34, 70, 70, 40, Math.PI, Math.PI * 2), "#FFEFC4");
  S.lasso([[sx - 70, hz - 34], [sx + 70, hz - 34], [sx + 68, hz], [sx - 68, hz]], "#FFEFC4");
  // the coast and the city's first lights
  const coast = ridge(1180, 1640, hz, (x) => 30 + (x - 1180) * 0.12, 10, 71, 16);
  S.lasso(below(coast, hz + 4), "#4A3D5E");
  [[1300, 70, 16], [1340, 110, 18], [1372, 60, 14], [1420, 140, 12], [1460, 80, 20]].forEach(([x, h, w]) => S.lasso([[x, hz], [x + w, hz], [x + w, hz - h], [x, hz - h]], "#3A3050"));
  for (let i = 0; i < 40; i++) {
    const x = 1200 + S.R() * 400, y = hz - 4 - S.R() * 60;
    S.alpha = 0.6 + S.R() * 0.4;
    S.path([[x, y], [x + 0.5, y]], "ink", "#FFD58A", 2 + S.R() * 2, () => 0.6);
  }
  S.alpha = 1;
  // the sea, darker towards us, the sun laid on it in broken strokes
  sky(S, 0, 1600, hz, 880, ["#C58B93", "#7A6E9C", "#454F80", "#323E6B"], 40);
  for (let i = 0; i < 120; i++) {
    const y = hz + 6 + Math.pow(S.R(), 1.4) * 270, spread = 40 + (y - hz) * 0.9;
    const x = sx + (S.R() - 0.5) * spread * 2, l = 14 + S.R() * 40 + (y - hz) * 0.12;
    S.alpha = 0.4 + S.R() * 0.5;
    S.path([[x - l / 2, y], [x + l / 2, y + (S.R() - 0.5) * 2]], "marker", S.R() < 0.6 ? "#FFE1A0" : "#F59A6E", 2 + (y - hz) * 0.02, () => 0.6);
  }
  for (let i = 0; i < 26; i++) {
    const y = hz + 20 + S.R() * 260, x = S.R() * 1600;
    S.alpha = 0.25;
    S.path([[x, y], [x + 60 + S.R() * 100, y]], "pencil", "#C8B6D6", 3, () => 0.5);
  }
  S.alpha = 1;
  // wet sand holding the sky, then pebbles
  sky(S, 0, 1600, 880, 1200, ["#9E7A86", "#7D6070", "#4E3E4E"], 30);
  S.lasso([[0, 880], [1600, 870], [1600, 892], [0, 900]], "#E8C9B4");
  S.strokes[S.strokes.length - 1].a = 0.6;
  for (let i = 0; i < 40; i++) {
    const y = 900 + S.R() * 120, x = sx + (S.R() - 0.5) * 300;
    S.alpha = 0.3 + S.R() * 0.3;
    S.path([[x - 20, y], [x + 20, y]], "marker", "#F7C893", 3, () => 0.6);
  }
  S.alpha = 0.6;
  [[300, 960, 180, 26], [760, 1000, 130, 18], [1350, 980, 160, 22]].forEach(([x, y, rx, ry]) => {
    S.lasso(blob(S, x, y, rx, ry, 0.1, 30), "#B68D93");
    S.path(ellipse(x, y, rx, ry, 24, 0.2, Math.PI - 0.2), "pencil", "#F2C9A6", 3, () => 0.5);
  });
  S.alpha = 1;
  for (let i = 0; i < 220; i++) {
    const y = 1040 + Math.pow(S.R(), 0.7) * 170, x = S.R() * 1620, r = 5 + (y - 1040) * 0.11 * (0.5 + S.R());
    const c = ramp(["#4A3C48", "#6E6068", "#8C7C7A", "#B4A49A"], S.R());
    S.lasso(blob(S, x, y, r, r * 0.62, 0.15, 14, S.R() - 0.5), c);
    S.alpha = 0.55;
    S.path(ellipse(x, y, r * 0.8, r * 0.5, 8, Math.PI * 1.1, Math.PI * 1.6), "pencil", "#F2D2B4", 2, () => 0.5);
    S.alpha = 1;
  }
  // the breakwater and its little light, and one gull
  S.lasso([[0, 650], [380, 640], [384, 662], [0, 676]], "#2E2840");
  S.lasso([[360, 640], [380, 640], [378, 560], [362, 560]], "#2E2840");
  S.lasso(ellipse(370, 556, 10, 10, 16), "#FFE08A");
  soft(S, 370, 556, 70, "#FFE08A", 0.35);
  S.poly([[620, 300], [650, 286], [672, 300], [694, 284], [724, 298]], "brushpen", "#2A2440", 5, 0.4, 8);
}

/* ---- The last tram, in the rain ---- */

function genRainTram(S: Sketch) {
  sky(S, 0, 1600, 0, 1200, ["#141A2E", "#1D2742", "#273452", "#1A2138"], 60);
  // buildings behind, their windows soft through the rain
  let x = -20;
  while (x < 1620) {
    const w = 120 + S.R() * 160, h = 260 + S.R() * 300, top = 700 - h;
    S.lasso([[x, 720], [x + w, 720], [x + w, top], [x, top]], mix("#202A45", "#2C3756", S.R()));
    for (let wy = top + 30; wy < 690; wy += 54) for (let wx = x + 18; wx < x + w - 26; wx += 40) {
      if (S.R() < 0.62) continue;
      S.alpha = 0.85;
      S.lasso([[wx, wy], [wx + 18, wy], [wx + 18, wy + 26], [wx, wy + 26]], S.R() < 0.5 ? "#F2C77A" : "#E89A5E");
      S.alpha = 1;
      soft(S, wx + 9, wy + 13, 50, "#F2C77A", 0.14, 1, 5);
    }
    x += w + 10;
  }
  // the road, wet and dark
  sky(S, 0, 1600, 720, 1200, ["#232C46", "#171D30", "#10141F"], 30);
  // overhead wires and a lamp each side
  S.path([[0, 210], [800, 236], [1600, 214]], "pencil", "#0C0F18", 4, () => 0.6);
  S.path([[0, 236], [800, 262], [1600, 240]], "pencil", "#0C0F18", 3, () => 0.6);
  [[180, 1.0], [1420, -1.0]].forEach(([px, d]) => {
    S.path([[px, 1040], [px, 330], [px + d * 60, 300]], "brushpen", "#0B0E16", 12, () => 0.8);
    soft(S, px + d * 62, 312, 260, "#FFD58A", 0.45, 1.4);
    S.lasso(ellipse(px + d * 62, 312, 16, 10, 16), "#FFF1C4");
    S.alpha = 0.5;
    for (let i = 0; i < 70; i++) {
      const t = S.R(), sx = px + d * 62 + (S.R() - 0.5) * 300 * t, sy = 330 + t * 620;
      S.path([[sx, sy], [sx - 6, sy + 20]], "pencil", "#FFE3A6", 2, () => 0.6);
    }
    S.alpha = 1;
    for (let k = 0; k < 4; k++) {
      S.alpha = 0.12;
      S.path([[px + d * 62 - 6 + k * 4, 960 + k * 30], [px + d * 62 + k * 2, 1190]], "wash", "#FFD58A", 9 - k, () => 0.6);
    }
    S.alpha = 1;
  });
  // the tram: red below, cream above, its windows lit
  const tx = 430, ty = 520, tw = 760, th = 360;
  S.lasso([[tx + 20, ty], [tx + tw - 20, ty], [tx + tw, ty + 30], [tx + tw, ty + th], [tx, ty + th], [tx, ty + 30]], "#E9DCC0");
  S.lasso([[tx, ty + th * 0.55], [tx + tw, ty + th * 0.55], [tx + tw, ty + th], [tx, ty + th]], "#B3302C");
  S.alpha = 0.35;
  S.lasso([[tx + tw * 0.8, ty], [tx + tw, ty + 30], [tx + tw, ty + th], [tx + tw * 0.8, ty + th]], "#0C0F18");
  S.alpha = 1;
  S.lasso([[tx + 60, ty - 30], [tx + tw - 60, ty - 30], [tx + tw - 80, ty], [tx + 80, ty]], "#3A3A44");
  S.path([[tx + tw / 2 - 60, ty - 30], [tx + tw / 2, 250], [tx + tw / 2 + 60, ty - 30]], "ink", "#0C0F18", 5, () => 0.6);
  for (let i = 0; i < 6; i++) {
    const wx = tx + 40 + i * 118;
    S.lasso([[wx, ty + 50], [wx + 92, ty + 50], [wx + 92, ty + 170], [wx, ty + 170]], "#FFD27A");
    S.alpha = 0.5;
    S.lasso([[wx, ty + 50], [wx + 92, ty + 50], [wx + 92, ty + 80], [wx, ty + 80]], "#FFF1C4");
    S.alpha = 1;
    if (i === 1 || i === 4) {
      S.lasso(ellipse(wx + 46, ty + 128, 22, 26, 20), "#3A2A26");
      S.lasso(ellipse(wx + 46, ty + 172, 40, 26, 20, Math.PI, Math.PI * 2), "#3A2A26");
    }
    soft(S, wx + 46, ty + 110, 110, "#FFD27A", 0.15, 1, 8);
  }
  S.lasso([[tx, ty + 180], [tx + tw, ty + 180], [tx + tw, ty + 192], [tx, ty + 192]], "#7A2220");
  S.path([[tx + 40, ty + th * 0.75], [tx + tw - 40, ty + th * 0.75]], "pencil", "#E9DCC0", 4, () => 0.6);
  [tx + 120, tx + tw - 120].forEach((wx) => S.lasso(ellipse(wx, ty + th + 6, 44, 22, 20), "#0C0F18"));
  S.lasso(ellipse(tx + tw - 26, ty + th - 50, 16, 16, 16), "#FFF5D0");
  soft(S, tx + tw - 26, ty + th - 50, 180, "#FFF0C0", 0.4);
  S.alpha = 0.7;
  S.path([[tx + 10, ty + 40], [tx + 10, ty + th - 10]], "pencil", "#FFF5DC", 3, () => 0.5);
  S.alpha = 1;
  // its reflection broken up in the wet road
  for (let i = 0; i < 90; i++) {
    const rx = tx + S.R() * tw, ry = ty + th + 30 + S.R() * 260, l = 20 + S.R() * 60;
    S.alpha = 0.08 + S.R() * 0.18 * (1 - (ry - ty - th) / 300);
    S.path([[rx, ry], [rx + (S.R() - 0.5) * 6, ry + l]], "wash", rx > tx + tw * 0.12 && rx < tx + tw * 0.9 && ry < ty + th + 140 ? "#FFD27A" : "#B3302C", 6 + S.R() * 6, () => 0.6);
  }
  S.alpha = 1;
  S.path([[0, 915], [1600, 905]], "pencil", "#3A4668", 3, () => 0.5);
  [[0, 905, 1600, 893], [0, 940, 1600, 928]].forEach(([x0, y0, x1, y1]) => {
    S.path([[x0, y0], [x1, y1]], "ink", "#0B0E16", 6, () => 0.7);
    S.alpha = 0.5;
    S.path([[x0, y0 - 3], [x1, y1 - 3]], "pencil", "#8B97B8", 2, () => 0.5);
    S.alpha = 1;
  });
  // and the rain over all of it
  for (let i = 0; i < 420; i++) {
    const rx = S.R() * 1700 - 50, ry = S.R() * 1200, l = 30 + S.R() * 50;
    S.alpha = 0.15 + S.R() * 0.3;
    S.path([[rx, ry], [rx - l * 0.25, ry + l]], "pencil", "#C9D6EE", 2, () => 0.5);
  }
  S.alpha = 0.5;
  for (let i = 0; i < 26; i++) {
    const px = S.R() * 1600, py = 960 + S.R() * 220;
    S.path(ellipse(px, py, 14 + S.R() * 20, 4 + S.R() * 4, 16), "pencil", "#7F8DB0", 2, () => 0.5);
  }
  S.alpha = 1;
}

/* ---- Rkatsiteli in October: a cane, its leaves turning, a bunch ready to pick ---- */

function leaf(S: Sketch, cx: number, cy: number, R: number, turn: number, colour: string) {
  const pts: Pt[] = [];
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    const lobes = 0.72 + 0.28 * Math.abs(Math.cos((a - Math.PI / 2) * 2.5));
    const notch = Math.abs(Math.sin(a - Math.PI / 2)) < 0.12 && Math.sin(a) > 0 ? 0.55 : 1;
    const saw = 1 + 0.035 * Math.sin(a * 46);
    const r = R * lobes * saw * notch;
    const x = Math.cos(a) * r, y = -Math.sin(a) * r * 0.95;
    pts.push([cx + x * Math.cos(turn) - y * Math.sin(turn), cy + x * Math.sin(turn) + y * Math.cos(turn)]);
  }
  S.lasso(pts, colour);
  S.alpha = 0.3;
  S.lasso(pts.slice(0, 46), mix(colour, "#FFF4D0", 0.5));
  S.alpha = 0.28;
  hatch(S, pts.slice(44).concat([[cx, cy]]), turn + 0.7, 14, "pencil", mix(colour, "#2A1A10", 0.6), 2, 0.5);
  S.alpha = 0.75;
  for (let k = 0; k < 5; k++) {
    const a = Math.PI / 2 + (k - 2) * 0.95;
    const ex = Math.cos(a) * R * 0.85, ey = -Math.sin(a) * R * 0.8;
    S.path([[cx, cy + R * 0.25], [cx + (ex * Math.cos(turn) - ey * Math.sin(turn)), cy + (ex * Math.sin(turn) + ey * Math.cos(turn))]], "ink", mix(colour, "#2A1A10", 0.5), 3, (t) => 0.8 - t * 0.6);
  }
  S.alpha = 1;
}

function berry(S: Sketch, x: number, y: number, r: number) {
  S.lasso(ellipse(x, y, r, r * 1.05, 18), "#9E8F3E");
  S.alpha = 0.8;
  S.lasso(ellipse(x - r * 0.15, y - r * 0.18, r * 0.82, r * 0.85, 18), "#CDBE62");
  S.alpha = 0.6;
  S.lasso(ellipse(x - r * 0.28, y - r * 0.3, r * 0.45, r * 0.45, 14), "#E8DD95");
  S.alpha = 0.9;
  S.path([[x - r * 0.38, y - r * 0.42], [x - r * 0.3, y - r * 0.46]], "ink", "#FFFBE6", r * 0.18, () => 0.6);
  S.alpha = 0.5;
  S.path(ellipse(x, y, r, r * 1.05, 14, 0.1, Math.PI * 0.9), "pencil", "#5E5422", 2, () => 0.5);
  S.alpha = 1;
}

function genVine(S: Sketch) {
  sky(S, 0, 1200, 0, 1600, ["#F4EAD4", "#EFE0C2", "#E8D3B0"], 40);
  soft(S, 380, 420, 700, "#FFF7E2", 0.5);
  S.alpha = 0.12;
  for (let i = 0; i < 6; i++) S.lasso(blob(S, 200 + S.R() * 800, 300 + S.R() * 1100, 200 + S.R() * 140, 140 + S.R() * 80, 0.3), i % 2 ? "#E2C99B" : "#FBF3E2");
  S.alpha = 1;
  // the cane, from the top left down across the sheet
  const cane: Pt[] = Array.from({ length: 30 }, (_, i) => [80 + i * 36 + Math.sin(i / 4) * 40, 180 + i * 14 + Math.sin(i / 3) * 30]);
  S.path(cane, "oil", "#5B3A22", 26, (t) => 0.9 - t * 0.4);
  S.alpha = 0.6;
  S.path(cane.map(([x, y]) => [x, y - 8] as Pt), "pencil", "#B08356", 3, () => 0.5);
  S.alpha = 1;
  // leaves, from summer green to October rust, each on its own stalk from the cane
  const L: [number, number, number, number, string][] = [
    [3, -150, 200, -0.25, "#7A8B3C"], [11, -140, 170, 0.3, "#B99A35"], [24, -40, 190, 0.7, "#B5582E"],
    [7, 230, 150, 2.9, "#9AA048"], [20, 190, 140, 3.4, "#C98B3A"],
  ];
  L.forEach(([at, dy, r, turn, c]) => {
    const [px, py] = cane[at];
    const base: Pt = [px + Math.sin(turn) * 30, py + dy * 0.35];
    const cx = base[0] - Math.sin(turn) * r * 0.25 + (dy > 0 ? 20 : -10), cy = base[1] + (dy > 0 ? r * 0.9 : -r * 0.75);
    S.path([[px, py], [(px + base[0]) / 2 + 10, (py + base[1]) / 2], [cx + Math.sin(turn) * r * 0.25, cy + Math.cos(turn) * r * 0.25]], "ink", "#5B3A22", 6, (t) => 0.8 - t * 0.4);
    leaf(S, cx, cy, r, turn, c);
  });
  // a tendril curling off the cane
  const tp: Pt[] = Array.from({ length: 60 }, (_, i) => {
    const t = i / 60, a = t * Math.PI * 5, rr = 60 * (1 - t);
    return [cane[18][0] + t * 120 + Math.cos(a) * rr * 0.5, cane[18][1] - 60 - t * 80 + Math.sin(a) * rr * 0.5];
  });
  S.path(tp, "ink", "#6B5A2A", 3, (t) => 0.8 - t * 0.6);
  // the bunch, hanging from the cane, rounder at the top
  const bx = 640, by = 860;
  S.path([cane[14], [bx, by - 60]], "brushpen", "#5B3A22", 8, () => 0.7);
  const spots: [number, number, number][] = [];
  for (let row = 0; row < 11; row++) {
    const y = by + row * 52, width = 230 * (1 - row / 13) * (row < 2 ? 0.75 + row * 0.12 : 1);
    for (let x = -width; x <= width; x += 54) if (S.R() > 0.1) spots.push([bx + x + ((row % 2) * 27) + (S.R() - 0.5) * 16, y + (S.R() - 0.5) * 14, 26 + S.R() * 10]);
  }
  S.alpha = 0.18;
  S.lasso(blob(S, bx + 90, by + 360, 200, 260, 0.15, 30), "#8E6E3E");
  S.alpha = 1;
  spots.sort((a, b) => a[1] - b[1]).forEach(([x, y, r]) => berry(S, x, y, r));
  // a wasp's eye view: two fallen berries and a dry leaf at the foot
  berry(S, 980, 1480, 28);
  berry(S, 1040, 1500, 26);
  leaf(S, 260, 1400, 120, 2.4, "#8E4A26");
}

type Def = Omit<Piece, "strokes"> & { gen: (S: Sketch) => void };
const DEFS: Def[] = [
  { id: "nightlamp", title: "A window at night", minutes: 10, prompt: PROMPT.no, gen: genWindow, by: SAMPLE_BY },
  { id: "gergeti", title: "Gergeti, first light", minutes: 40, gen: genGergeti, by: SAMPLE_BY },
  { id: "moonwatch", title: "A window at night, with someone watching", minutes: 4, prompt: PROMPT.no, remixOf: "nightlamp", gen: genWatcher, by: SAMPLE_BY },
  { id: "oldtown", title: "Old Tbilisi, dusk", minutes: 55, gen: genOldTown, by: SAMPLE_BY },
  { id: "harvest", title: "Pomegranates on linen", minutes: 35, shape: "square", gen: genPomegranates, by: SAMPLE_BY },
  { id: "blacksea", title: "Batumi, low tide", minutes: 30, gen: genBlackSea, by: SAMPLE_BY },
  { id: "raintram", title: "The last tram, in the rain", minutes: 45, gen: genRainTram, by: SAMPLE_BY },
  { id: "rkatsiteli", title: "Rkatsiteli in October", minutes: 50, shape: "port", paper: "cold", gen: genVine, by: SAMPLE_BY },
];
const TILTS = [-2.2, 1.6, -0.8, 2.4, -1.4, 1, -2.6, 0.7];

/** whether an id is one of the samples, without drawing them */
export const isSample = (id: string) => DEFS.some((d) => d.id === id);

let drawn: Piece[] | undefined;
/** The eight samples, drawn the first time something asks for them: about 7,500 strokes,
    which a phone would otherwise spend on every page load, pages without samples included. */
export const samples = () =>
  (drawn ??= DEFS.map(({ gen, ...d }, i) => {
    const S = new Sketch(1000 + i * 77);
    gen(S);
    return { ...d, strokes: S.strokes, sample: true, ai: true, tilt: TILTS[i % TILTS.length] };
  }));
