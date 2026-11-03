import type { Stroke, ToolId } from "./stroke";

/* Seeded hand-drawn shape generator. It produces real stroke records (not pictures),
   so sample pieces, the logo and illustrations replay like anything a person draws. */
export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Pt = [number, number];

export class Sketch {
  readonly R: () => number;
  readonly strokes: Stroke[] = [];
  constructor(seed: number) {
    this.R = rng(seed);
  }
  private st(tool: ToolId, c: string, w: number) {
    const s: Stroke = { tool, c, w, p: [] };
    this.strokes.push(s);
    return s;
  }
  private add(s: Stroke, x: number, y: number, pr = 0.6) {
    s.p.push(Math.round(x), Math.round(y), Math.round(Math.max(0, Math.min(1, pr)) * 99));
  }
  /** A wobbly path through the given points. */
  poly(pts: Pt[], tool: ToolId, c: string, w: number, j = 1.6, step = 14) {
    const s = this.st(tool, c, w);
    let off = 0;
    let total = 0;
    const segs: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      segs.push(d);
      total += d;
    }
    if (pts.length === 1) this.add(s, pts[0][0], pts[0][1]);
    let run = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i - 1];
      const [x2, y2] = pts[i];
      const d = segs[i - 1] || 1;
      const n = Math.max(1, Math.ceil(d / step));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        const t = k / n;
        off += (this.R() - 0.5) * j;
        off *= 0.86;
        const nx = -(y2 - y1) / d;
        const ny = (x2 - x1) / d;
        const prog = (run + d * t) / (total || 1);
        this.add(s, x1 + (x2 - x1) * t + nx * off, y1 + (y2 - y1) * t + ny * off, 0.35 + 0.6 * Math.sin(Math.PI * prog));
      }
      run += d;
    }
    return s;
  }
  line(x1: number, y1: number, x2: number, y2: number, tool: ToolId, c: string, w: number, j?: number) {
    return this.poly([[x1, y1], [x2, y2]], tool, c, w, j);
  }
  circle(cx: number, cy: number, r: number, tool: ToolId, c: string, w: number, j = 3, turns = 1.06, sy = 0.98) {
    const s = this.st(tool, c, w);
    const n = Math.max(18, Math.ceil((r * turns * 6.3) / 11));
    const a0 = this.R() * 6.283;
    let rr = r;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * turns * 6.283;
      rr += (this.R() - 0.5) * j;
      rr += (r - rr) * 0.2;
      this.add(s, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * sy, 0.45 + 0.45 * Math.sin((i / n) * Math.PI));
    }
    return s;
  }
  rect(x: number, y: number, w: number, h: number, tool: ToolId, c: string, sz: number, j = 2) {
    const o = () => (this.R() - 0.5) * 14;
    this.line(x + o(), y, x + w + o(), y + o() * 0.3, tool, c, sz, j);
    this.line(x + w, y + o(), x + w + o() * 0.3, y + h + o(), tool, c, sz, j);
    this.line(x + w + o(), y + h, x + o(), y + h + o() * 0.3, tool, c, sz, j);
    this.line(x, y + h + o(), x + o() * 0.3, y + o(), tool, c, sz, j);
  }
  /** Zig-zag scribble fill, split into several strokes the way a hand would do it. */
  fill(x: number, y: number, w: number, h: number, tool: ToolId, c: string, sz: number, gap: number, rows = 8) {
    let pts: Pt[] = [];
    let count = 0;
    let dir = 0;
    for (let yy = y; yy <= y + h; yy += gap) {
      const a = x + this.R() * gap * 0.5;
      const b = x + w - this.R() * gap * 0.5;
      pts.push(dir ? [b, yy + (this.R() - 0.5) * gap * 0.4] : [a, yy + (this.R() - 0.5) * gap * 0.4]);
      pts.push(dir ? [a, yy + gap * 0.5] : [b, yy + gap * 0.5]);
      dir ^= 1;
      if (++count % rows === 0) {
        this.poly(pts, tool, c, sz, 1, 40);
        pts = [pts[pts.length - 1]];
      }
    }
    if (pts.length > 1) this.poly(pts, tool, c, sz, 1, 40);
  }
  disc(cx: number, cy: number, r: number, tool: ToolId, c: string, sz: number, gap: number) {
    const pts: Pt[] = [];
    let dir = 0;
    for (let yy = -r; yy <= r; yy += gap) {
      const half = Math.sqrt(Math.max(0, r * r - yy * yy)) * 0.96;
      pts.push([cx + (dir ? half : -half), cy + yy]);
      pts.push([cx + (dir ? -half : half), cy + yy + gap * 0.5]);
      dir ^= 1;
    }
    this.poly(pts, tool, c, sz, 1, 36);
  }
  ridge(x0: number, x1: number, baseY: number, amp: number, peaks: [number, number, number][]) {
    const pts: Pt[] = [];
    const n = 26;
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * (i / n);
      let y = baseY;
      peaks.forEach(([px, h, wd]) => {
        y -= h * Math.max(0, 1 - Math.abs(x - px) / wd);
      });
      pts.push([x, y + (this.R() - 0.5) * amp]);
    }
    return pts;
  }
}

export const lerpPts = (a: Pt, b: Pt, n: number): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
