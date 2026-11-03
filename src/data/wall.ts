import { lerpPts, type Pt } from "../engine/sketch";
import type { Stroke, ToolId } from "../engine/stroke";

/* The wall is 2000 × 1000 units. Until the shared wall goes live (Stage 4) it starts with
   these example doodles, and your own marks are kept on your device. */
export const WALL = { w: 2000, h: 1000 } as const;
export const WALL_COLORS = ["#1B1E1D", "#2B37D4", "#C9392F", "#F2C14E", "#3E7C6B", "#A1386B"];

function doodles(): Stroke[] {
  let seed = 7;
  const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out: Stroke[] = [];
  const st = (tool: ToolId, c: string, w: number, pts: Pt[]) => {
    const p: number[] = [];
    pts.forEach(([x, y], i) => p.push(Math.round(x + (R() - 0.5) * 2), Math.round(y + (R() - 0.5) * 2), Math.round(40 + 50 * Math.sin((Math.PI * i) / Math.max(1, pts.length - 1)))));
    out.push({ tool, c, w, p });
  };
  const circ = (cx: number, cy: number, r: number, n = 40, t = 1.05): Pt[] =>
    Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * t * 6.283; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  const chain = (pts: Pt[], n = 6) => pts.flatMap((p, i) => (i ? lerpPts(pts[i - 1], p, n).slice(1) : [p]));

  st("marker", "#F2C14E", 14, circ(1520, 260, 70));
  for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283; st("ink", "#F2C14E", 6, lerpPts([1520 + Math.cos(a) * 100, 260 + Math.sin(a) * 100], [1520 + Math.cos(a) * 150, 260 + Math.sin(a) * 150], 6)); }
  st("ink", "#1B1E1D", 6, chain([[1020, 760], [1020, 600], [1110, 520], [1200, 600], [1200, 760], [1020, 760]], 8));
  st("marker", "#C9392F", 10, chain([[1090, 760], [1090, 680], [1130, 680], [1130, 760]], 4));
  st("pencil", "#2B37D4", 6, chain([[1045, 630], [1075, 630], [1075, 660], [1045, 660], [1045, 630]], 3));
  st("ink", "#2B37D4", 6, Array.from({ length: 90 }, (_, i) => { const a = (i / 90) * 6.283 * 3.2, r = 6 + i * 1.1; return [740 + Math.cos(a) * r, 560 + Math.sin(a) * r] as Pt; }));
  const star: Pt[] = [];
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i * Math.PI * 4) / 5; star.push([1760 + Math.cos(a) * 70, 720 + Math.sin(a) * 70]); }
  st("ink", "#A1386B", 6, chain(star, 5));
  st("marker", "#3E7C6B", 12, Array.from({ length: 80 }, (_, i) => [300 + i * 20, 900 + Math.sin(i / 5) * 22] as Pt));
  st("pencil", "#1B1E1D", 8, lerpPts([430, 620], [430, 800], 10));
  st("pencil", "#1B1E1D", 8, [[430, 730], [450, 705], [480, 700], [500, 720], [505, 760], [505, 800]]);
  st("pencil", "#1B1E1D", 8, lerpPts([550, 710], [550, 800], 6));
  st("marker", "#1B1E1D", 8, [[550, 670], [552, 672]]);
  st("ink", "#C9392F", 6, Array.from({ length: 60 }, (_, i) => { const t = (i / 59) * 6.283; return [1380 + 16 * Math.pow(Math.sin(t), 3) * 3.4, 820 - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 3.4] as Pt; }));
  return out;
}
export const WALL_SEED = doodles();
