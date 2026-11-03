import { Sketch } from "../engine/sketch";
import type { Piece } from "../engine/stroke";

/* Sample pieces for the prototype. Artists and stamp counts are examples, and the UI says so. */
const NAVY = "#1E2A5A", LAMP = "#F2C14E", EMBER = "#E26D3D", MOSS = "#3E7C6B", CREAM = "#F4EEE0", INK = "#1B1B1B";

export const PROMPT = {
  no: 312,
  title: "A window at night",
  palette: [NAVY, LAMP, EMBER, MOSS, CREAM, INK],
  names: ["Night navy", "Lamp", "Ember", "Moss", "Moon", "Ink"],
  minutes: 10,
  entries: 214,
};

function genWindow(S: Sketch) {
  S.fill(0, 0, 1600, 1200, "wash", NAVY, 64, 70, 6);
  S.fill(470, 270, 660, 720, "wash", LAMP, 44, 60, 5);
  for (let i = 0; i < 4; i++) S.disc(1000, 400, 70 - i * 14, "wash", CREAM, 14, 22);
  S.circle(1000, 400, 72, "pencil", CREAM, 6);
  for (let i = 0; i < 22; i++) {
    const x = S.R() * 1600, y = S.R() * 260 + 20;
    if (x > 430 && x < 1170 && y > 230) continue;
    S.line(x - 8, y, x + 8, y, "marker", CREAM, 4);
    S.line(x, y - 8, x, y + 8, "marker", CREAM, 4);
  }
  for (let k = 0; k < 6; k++) { const x = 480 + k * 16; S.poly([[x, 270], [x + 20, 480], [x - 6, 700], [x + 18, 990]], "pencil", EMBER, 9, 3); }
  for (let k = 0; k < 6; k++) { const x = 1120 - k * 16; S.poly([[x, 270], [x - 20, 480], [x + 6, 700], [x - 18, 990]], "pencil", EMBER, 9, 3); }
  S.rect(450, 250, 700, 760, "ink", INK, 13, 2.5);
  S.line(800, 250, 800, 1010, "ink", INK, 10);
  S.line(450, 620, 1150, 620, "ink", INK, 10);
  S.line(380, 1032, 1220, 1026, "ink", INK, 16);
  S.disc(1060, 990, 38, "marker", MOSS, 18, 16);
  for (let i = 0; i < 6; i++) { const a = -2.6 + i * 0.42; S.line(1060, 960, 1060 + Math.cos(a) * 95, 960 + Math.sin(a) * 95, "ink", MOSS, 7); }
}
function genCat(S: Sketch) {
  S.disc(640, 950, 82, "marker", INK, 28, 20);
  S.disc(705, 875, 52, "marker", INK, 24, 16);
  S.poly([[668, 842], [672, 790], [700, 828]], "ink", INK, 12);
  S.poly([[716, 826], [742, 786], [748, 842]], "ink", INK, 12);
  S.poly([[560, 1000], [500, 1018], [470, 980], [490, 930]], "ink", INK, 14, 2);
  S.line(690, 870, 698, 872, "marker", LAMP, 6);
  S.line(722, 870, 730, 872, "marker", LAMP, 6);
}
function genMountains(S: Sketch) {
  S.fill(0, 0, 1600, 560, "wash", "#9CC3D9", 60, 80, 5);
  for (let i = 0; i < 4; i++) S.disc(1150, 330, 110 - i * 22, "wash", "#F0A04B", 18, 24);
  const layers: { y: number; c: string; peaks: [number, number, number][] }[] = [
    { y: 760, c: "#6E7F99", peaks: [[380, 380, 360], [880, 300, 300], [1300, 340, 330]] },
    { y: 900, c: "#465672", peaks: [[200, 220, 300], [700, 260, 320], [1450, 200, 280]] },
    { y: 1050, c: "#2B354A", peaks: [[500, 150, 400], [1200, 170, 360]] },
  ];
  layers.forEach((L, li) => {
    const pts = S.ridge(-20, 1620, L.y, 18, L.peaks);
    const zz: [number, number][] = [];
    pts.forEach(([x, y]) => { zz.push([x, y + 8]); zz.push([x + 30, 1200]); });
    for (let i = 0; i < zz.length; i += 12) S.poly(zz.slice(i, i + 13), "wash", L.c, 40, 1, 60);
    S.poly(pts, "ink", "#1B1F2A", li === 0 ? 6 : 8, 1.5);
    if (li === 0) L.peaks.forEach(([px, h]) => { for (let k = 0; k < 4; k++) S.line(px - 30 + k * 14, L.y - h + 18 + k * 6, px - 12 + k * 14, L.y - h + 40 + k * 8, "marker", "#FFFFFF", 7); });
  });
  for (let i = 0; i < 5; i++) { const x = 500 + i * 70 + S.R() * 40, y = 240 + S.R() * 90; S.poly([[x - 22, y - 10], [x, y + 4], [x + 22, y - 12]], "ink", "#1B1F2A", 5); }
}
function genBalcony(S: Sketch) {
  S.fill(0, 0, 1600, 1200, "wash", "#D9A27E", 64, 74, 6);
  S.rect(560, 80, 480, 560, "ink", "#3B2A20", 10);
  S.fill(590, 110, 420, 500, "wash", "#5B8F86", 40, 60, 6);
  for (let x = 620; x < 1000; x += 70) S.line(x, 120, x + 4, 600, "pencil", "#2F4F49", 10);
  S.line(160, 690, 1440, 684, "ink", "#3B2A20", 18);
  S.line(160, 1000, 1440, 994, "ink", "#3B2A20", 18);
  for (let x = 180; x < 1440; x += 64) {
    S.line(x, 700, x + 2, 990, "ink", "#3B2A20", 8);
    S.poly([[x + 4, 720], [x + 32, 840], [x + 4, 970]], "ink", "#3B2A20", 5);
    S.poly([[x + 60, 720], [x + 32, 840], [x + 60, 970]], "ink", "#3B2A20", 5);
  }
  ([[300, 650], [1250, 650], [880, 650]] as const).forEach(([x, y]) => {
    S.disc(x, y - 10, 44, "marker", "#A8462F", 20, 16);
    for (let i = 0; i < 9; i++) { const a = -Math.PI + 0.2 + i * 0.34; S.poly([[x, y - 40], [x + Math.cos(a) * 60, y - 60 + Math.sin(a) * 80], [x + Math.cos(a) * 110, y - 50 + Math.sin(a) * 120]], "pencil", "#3E7C3F", 10, 3); }
  });
  S.line(120, 320, 560, 360, "pencil", "#3B2A20", 4);
  ([[180, 330, "#F4EEE0"], [300, 342, "#3E6FB0"], [420, 352, "#E0B23A"]] as const).forEach(([x, y, c]) => S.fill(x, y, 80, 110, "marker", c, 16, 22, 8));
  S.fill(0, 1010, 1600, 190, "wash", "#8C5A3C", 50, 60, 6);
}
function genPom(S: Sketch) {
  S.fill(0, 0, 1600, 1200, "wash", "#EFE3CF", 70, 90, 6);
  for (let i = 0; i < 26; i++) { const x = 380 + i * 34; S.line(x, 1000, x + 120, 880, "pencil", "#6E6458", 7, 1); }
  for (let i = 0; i < 6; i++) S.disc(700, 640, 300 - i * 46, "wash", i < 2 ? "#8E1E28" : "#B8262B", 26, 34);
  S.circle(700, 640, 300, "ink", "#3A0E12", 12, 4);
  S.poly([[640, 350], [650, 280], [680, 320], [700, 262], [720, 322], [752, 282], [760, 352]], "ink", "#3A0E12", 11, 1);
  S.poly([[540, 540], [580, 470], [650, 440]], "marker", "#F7D8C4", 18, 1);
  S.circle(1210, 860, 150, "ink", "#3A0E12", 10, 3);
  S.disc(1210, 860, 130, "wash", "#F1D7B8", 20, 30);
  for (let i = 0; i < 46; i++) { const a = S.R() * 6.28, r = S.R() * 118; const x = 1210 + Math.cos(a) * r, y = 860 + Math.sin(a) * r; S.line(x, y, x + 6, y + 9, "marker", "#9E1730", 11, 0.5); }
}
function genOneLine(S: Sketch) {
  S.fill(0, 0, 1600, 1200, "wash", "#F3E9DA", 70, 90, 6);
  const pts: [number, number][] = [];
  for (let i = 0; i <= 700; i++) {
    const t = (i / 700) * Math.PI * 2;
    pts.push([800 + 430 * Math.sin(t * 2 + 0.6) * Math.cos(t * 0.5) + 120 * Math.sin(t * 7), 600 + 380 * Math.sin(t * 3) * 0.8 + 90 * Math.cos(t * 5)]);
  }
  S.poly(pts, "ink", "#141414", 9, 0.8, 10);
  S.poly([[1250, 1080], [1280, 1060], [1300, 1090], [1330, 1058], [1370, 1085]], "pencil", "#141414", 6, 1);
}
function genWaves(S: Sketch) {
  S.fill(0, 0, 1600, 520, "wash", "#F4D9B8", 64, 80, 5);
  for (let i = 0; i < 4; i++) S.disc(420, 300, 90 - i * 20, "wash", "#E8873A", 16, 22);
  S.line(0, 520, 1600, 514, "pencil", "#2E4C6D", 6);
  const blues = ["#2E4C6D", "#3B6E99", "#5F98C2", "#2B5A7E"];
  for (let r = 0; r < 14; r++) {
    const y0 = 560 + r * 46, amp = 6 + r * 2.4, pts: [number, number][] = [];
    for (let x = -20; x <= 1620; x += 40) pts.push([x, y0 + Math.sin(x / (60 + r * 6) + r) * amp]);
    S.poly(pts, r % 3 === 0 ? "ink" : "marker", blues[r % 4], r % 3 === 0 ? 6 : 10, 1.2, 20);
  }
  S.fill(0, 1040, 1600, 160, "wash", "#D8C3A0", 50, 60, 6);
}
function genTram(S: Sketch) {
  S.fill(0, 0, 1600, 1200, "wash", NAVY, 64, 70, 6);
  S.line(0, 150, 1600, 190, "pencil", CREAM, 4);
  S.line(0, 170, 1600, 214, "pencil", CREAM, 3);
  S.line(980, 196, 1080, 430, "ink", INK, 6);
  S.fill(260, 430, 1060, 420, "marker", "#C9392F", 40, 40, 6);
  S.rect(260, 430, 1060, 420, "ink", INK, 10);
  for (let i = 0; i < 5; i++) { const x = 320 + i * 196; S.fill(x, 490, 150, 160, "wash", LAMP, 30, 36, 6); S.rect(x, 490, 150, 160, "ink", INK, 6); }
  [460, 1100].forEach((x) => { S.disc(x, 880, 52, "marker", INK, 22, 16); S.circle(x, 880, 54, "ink", INK, 8); });
  S.line(0, 935, 1600, 930, "ink", INK, 10);
  S.line(1440, 1000, 1440, 380, "ink", INK, 9);
  for (let i = 0; i < 4; i++) S.disc(1440, 360, 90 - i * 20, "wash", LAMP, 16, 22);
}

type Def = Omit<Piece, "strokes"> & { gen: (S: Sketch) => void };
const DEFS: Def[] = [
  { id: "window", title: "A window at night", by: "nino.k", minutes: 9.6, prompt: 312, gen: genWindow, stamps: { Moody: 41, Bold: 12, "Clean line": 7, "Remix me": 19 } },
  { id: "kazbegi", title: "Kazbegi, 7 a.m.", by: "luka_draws", minutes: 22, gen: genMountains, stamps: { Calm: 33, Colour: 28, Bold: 4 } },
  { id: "balcony", title: "Sololaki balcony", by: "mari.lines", minutes: 31, gen: genBalcony, stamps: { Patient: 52, "Clean line": 18, Colour: 11 } },
  { id: "cat", title: "A window at night, with Pilpili", by: "dato.m", minutes: 4, prompt: 312, remixOf: "window", gen: (S) => { genWindow(S); genCat(S); }, stamps: { Funny: 64, Moody: 9 } },
  { id: "pomegranate", title: "Pomegranate study", by: "tamta", minutes: 9, gen: genPom, stamps: { Colour: 22, Bold: 30, "Remix me": 3 } },
  { id: "oneline", title: "One line, no lifting", by: "g.okro", minutes: 3, gen: genOneLine, stamps: { "Clean line": 47, Funny: 6 } },
  { id: "waves", title: "Batumi, low tide", by: "sea.sketch", minutes: 12, gen: genWaves, stamps: { Calm: 38, Patient: 6 } },
  { id: "tram", title: "Last tram home", by: "ana.v", minutes: 9.8, prompt: 312, gen: genTram, stamps: { Moody: 25, Bold: 21, Colour: 9 } },
];
const TILTS = [-2.2, 1.6, -0.8, 2.4, -1.4, 1, -2.6, 0.7];

export const SAMPLES: Piece[] = DEFS.map(({ gen, ...d }, i) => {
  const S = new Sketch(1000 + i * 77);
  gen(S);
  return { ...d, strokes: S.strokes, sample: true, tilt: TILTS[i % TILTS.length] };
});

export const STAMPS = ["Bold", "Moody", "Calm", "Colour", "Clean line", "Patient", "Funny", "Remix me"] as const;
export const STAMP_COLOR: Record<string, string> = {
  Bold: "#B23A2E", Moody: "#3B3F8F", Calm: "#2F6B5A", Colour: "#B5651D",
  "Clean line": "#1B1E1D", Patient: "#6B4C2E", Funny: "#A1386B", "Remix me": "#2B37D4",
};
