import { Sketch, type Pt } from "../engine/sketch";
import type { Stroke } from "../engine/stroke";

/* Workbenches: one per discipline, each with its own material. The demo strokes are drawn
   in 1600 × 1200 sheet units on a transparent layer so the material shows through. */
export interface Discipline {
  id: string;
  name: string;
  material: string;
  stage: number;
  blurb: string;
  demo: Stroke[];
}

function make(seed: number, f: (S: Sketch) => void) {
  const S = new Sketch(seed);
  f(S);
  return S.strokes;
}

const HEART = ["..XX.XX..", ".XXXXXXX.", "XXXXXXXXX", "XXXXXXXXX", ".XXXXXXX.", "..XXXXX..", "...XXX...", "....X...."];

export const DISCIPLINES: Discipline[] = [
  {
    id: "painting", name: "Painting & drawing", material: "m-paper", stage: 0,
    blurb: "Pencil, ink, marker and wash on paper. Layers and textured brushes arrive in Stage 1.",
    demo: make(11, (S) => {
      for (let i = 0; i < 4; i++) S.disc(820, 470, 230 - i * 50, "wash", i % 2 ? "#E26D3D" : "#C9392F", 26, 34);
      S.circle(820, 470, 70, "ink", "#5A2A14", 10);
      S.disc(820, 470, 60, "marker", "#F2C14E", 22, 18);
      S.poly([[820, 700], [800, 880], [830, 1120]], "ink", "#2F5E3A", 14, 2);
      S.poly([[805, 900], [660, 820], [600, 900], [805, 930]], "ink", "#2F5E3A", 9, 1);
      S.poly([[815, 980], [980, 900], [1040, 980], [815, 1010]], "ink", "#2F5E3A", 9, 1);
    }),
  },
  {
    id: "pixel", name: "Pixel art", material: "m-graph", stage: 3,
    blurb: "A grid, a small palette, and every square placed on purpose.",
    demo: make(12, (S) => {
      const cell = 96, x0 = 368, y0 = 220;
      HEART.forEach((row, r) => [...row].forEach((ch, c) => {
        if (ch !== "X") return;
        const shade = r < 2 && c < 4 ? "#F48B8B" : "#D33A4A";
        S.fill(x0 + c * cell + 8, y0 + r * cell + 8, cell - 16, cell - 16, "marker", shade, 22, 20, 99);
      }));
    }),
  },
  {
    id: "animation", name: "Animation", material: "m-light", stage: 3,
    blurb: "Frame by frame on a light table, with the last frames glowing underneath.",
    demo: make(13, (S) => {
      const frames: [number, number, string][] = [[300, 360, "#C9D3F2"], [520, 620, "#A6B4EA"], [740, 900, "#7F90DE"], [960, 640, "#5468CF"], [1180, 420, "#2B37D4"]];
      frames.forEach(([x, y, c]) => { S.disc(x, y, 80, "marker", c, 26, 22); S.circle(x, y, 82, "ink", c, 6); });
      S.line(160, 1000, 1440, 990, "pencil", "#5468CF", 6);
      for (let i = 0; i < 3; i++) S.line(1020 - i * 40, 520 + i * 40, 1080 - i * 40, 470 + i * 40, "pencil", "#2B37D4", 6);
    }),
  },
  {
    id: "calligraphy", name: "Calligraphy & lettering", material: "m-ruled", stage: 5,
    blurb: "Broad-nib and brush-pen practice with guides, including Georgian Mkhedruli.",
    demo: make(14, (S) => {
      const pts: Pt[] = [];
      for (let i = 0; i <= 220; i++) {
        const t = i / 220, x = 200 + t * 1200;
        pts.push([x + Math.sin(t * 34) * 70, 600 - Math.abs(Math.sin(t * 17)) * 240 + Math.cos(t * 34) * 50]);
      }
      S.poly(pts, "ink", "#1B1E1D", 26, 0.5, 9);
      S.poly([[260, 860], [1340, 846]], "ink", "#B23A2E", 8, 1);
    }),
  },
  {
    id: "pattern", name: "Pattern & ornament", material: "m-linen", stage: 5,
    blurb: "Draw one tile and watch it repeat into fabric, wallpaper or a carpet border.",
    demo: make(15, (S) => {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        const x = 260 + c * 360, y = 230 + r * 370;
        S.circle(x, y, 60, "ink", "#7A2E22", 9, 1);
        for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2 + Math.PI / 4; S.poly([[x + Math.cos(a) * 70, y + Math.sin(a) * 70], [x + Math.cos(a) * 150, y + Math.sin(a) * 150]], "ink", "#24406B", 12, 1); }
        S.disc(x, y, 34, "marker", "#C9832B", 18, 14);
      }
    }),
  },
  {
    id: "collage", name: "Paper collage", material: "m-kraft", stage: 5,
    blurb: "Cut shapes from coloured paper, arrange them, glue them down.",
    demo: make(16, (S) => {
      S.disc(560, 520, 250, "marker", "#F2C14E", 60, 40);
      S.fill(760, 300, 520, 360, "marker", "#2B5FA8", 60, 44, 99);
      S.poly([[340, 1050], [760, 640], [1000, 1080], [340, 1050]], "marker", "#C9392F", 70, 1, 40);
      S.fill(980, 760, 300, 280, "marker", "#F4EEE0", 50, 40, 99);
    }),
  },
  {
    id: "comics", name: "Comics & zines", material: "m-comic", stage: 5,
    blurb: "Panels, balloons and pages, from one strip to a whole series.",
    demo: make(17, (S) => {
      S.rect(120, 140, 640, 440, "ink", "#1B1E1D", 9);
      S.rect(840, 140, 640, 440, "ink", "#1B1E1D", 9);
      S.rect(120, 660, 1360, 420, "ink", "#1B1E1D", 9);
      S.circle(440, 420, 60, "ink", "#1B1E1D", 7);
      S.line(440, 480, 440, 570, "ink", "#1B1E1D", 7);
      S.circle(1180, 300, 110, "ink", "#1B1E1D", 6, 2, 1.04, 0.6);
      S.poly([[1120, 360], [1060, 440], [1160, 372]], "ink", "#1B1E1D", 6, 1);
      S.fill(180, 720, 1240, 300, "wash", "#9CC3D9", 40, 60, 6);
      S.circle(900, 880, 90, "ink", "#1B1E1D", 7);
    }),
  },
  {
    id: "mosaic", name: "Mosaic & stained glass", material: "m-glass", stage: 5,
    blurb: "Pieces of colour held together by dark lead lines, lit from behind.",
    demo: make(18, (S) => {
      const cols = ["#E2483D", "#F2C14E", "#3FA7D6", "#3E9C6B", "#A15BD1", "#F08A3C"];
      const xs = [100, 420, 720, 1060, 1500], ys = [120, 460, 800, 1100];
      for (let r = 0; r < ys.length - 1; r++) for (let c = 0; c < xs.length - 1; c++)
        S.fill(xs[c] + 20, ys[r] + 20, xs[c + 1] - xs[c] - 40, ys[r + 1] - ys[r] - 40, "marker", cols[(r * 3 + c) % cols.length], 40, 36, 99);
      xs.forEach((x) => S.line(x, 100, x + (S.R() - 0.5) * 60, 1120, "ink", "#0B0D14", 22, 3));
      ys.forEach((y) => S.line(80, y, 1520, y + (S.R() - 0.5) * 60, "ink", "#0B0D14", 22, 3));
    }),
  },
  {
    id: "music", name: "Music sketch", material: "m-staff", stage: 6,
    blurb: "A step sequencer and a small synth, so a piece can have a sound.",
    demo: make(19, (S) => {
      for (let i = 0; i < 5; i++) S.line(100, 380 + i * 70, 1500, 376 + i * 70, "pencil", "#3A3A3A", 5, 0.6);
      const notes: [number, number][] = [[300, 590], [470, 520], [640, 450], [810, 520], [980, 380], [1150, 450], [1320, 590]];
      notes.forEach(([x, y]) => { S.circle(x, y, 34, "ink", "#1B1E1D", 6, 1, 1.05, 0.75); S.disc(x, y, 30, "marker", "#1B1E1D", 16, 12); S.line(x + 32, y, x + 34, y - 230, "ink", "#1B1E1D", 7, 0.5); });
      S.line(334, 360, 846, 290, "ink", "#1B1E1D", 16, 0.5);
      S.line(1014, 150, 1354, 360, "ink", "#1B1E1D", 16, 0.5);
    }),
  },
  {
    id: "code", name: "Creative code", material: "m-slate", stage: 6,
    blurb: "Sketches written in code, kept in their own category.",
    demo: make(20, (S) => {
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2, r = 220 + 200 * Math.sin(i * 0.9);
        S.line(800, 600, 800 + Math.cos(a) * r * 1.3, 600 + Math.sin(a) * r, "ink", i % 3 ? "#7FD6B0" : "#A6AEFF", 3, 0);
      }
      S.circle(800, 600, 90, "ink", "#E3EEE8", 4, 0.5);
    }),
  },
];
