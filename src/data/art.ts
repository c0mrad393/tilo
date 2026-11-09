import { rng, type Pt, type Sketch } from "../engine/sketch";
import type { Stroke } from "../engine/stroke";

/* Tilo's sample pieces, drawn by Claude (an AI) in code: every shape is a real stroke with a
   real tool, so each piece replays and remixes like one drawn by hand. They are here to show
   what the tools can do and to be beaten by people drawing with their own hands. */

/* ---- colour and shape helpers ---- */

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
/** a colour between a and b */
export function mix(a: string, b: string, t: number) {
  const A = hex(a), B = hex(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, "0")).join("").toUpperCase();
}
/** a colour along a list of stops, t from 0 to 1 */
export function ramp(stops: string[], t: number) {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
}

/** smooth 1-D value noise, -1..1, made from a seed */
export function noise(seed: number) {
  const R = rng(seed);
  const v = Array.from({ length: 512 }, () => R() * 2 - 1);
  const at = (x: number) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return v[i & 511] * (1 - u) + v[(i + 1) & 511] * u;
  };
  return (x: number, octaves = 4) => {
    let s = 0, amp = 1, norm = 0, fr = 1;
    for (let o = 0; o < octaves; o++) {
      s += at(x * fr + o * 31.7) * amp;
      norm += amp;
      amp *= 0.5;
      fr *= 2.03;
    }
    return s / norm;
  };
}

export const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 48, a0 = 0, a1 = Math.PI * 2): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });

/** a closed blob: an ellipse whose edge wanders by `j` (0-1 of the radius) */
export function blob(S: Sketch, cx: number, cy: number, rx: number, ry: number, j = 0.08, n = 40, turn = 0): Pt[] {
  const k = 2 + Math.floor(S.R() * 3), ph = S.R() * 6.28, k2 = 5 + Math.floor(S.R() * 3), ph2 = S.R() * 6.28;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const r = 1 + j * (Math.sin(a * k + ph) * 0.6 + Math.sin(a * k2 + ph2) * 0.4);
    const x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r;
    return [cx + x * Math.cos(turn) - y * Math.sin(turn), cy + x * Math.sin(turn) + y * Math.cos(turn)];
  });
}

/** horizontal bands of colour from y0 to y1, blended by overlapping translucent strips */
export function sky(S: Sketch, x0: number, x1: number, y0: number, y1: number, stops: string[], bands = 24) {
  const h = (y1 - y0) / bands;
  for (let i = 0; i < bands; i++) {
    const y = y0 + i * h;
    S.lasso([[x0, y - 2], [x1, y - 2], [x1, y + h + 2], [x0, y + h + 2]], ramp(stops, (i + 0.5) / bands));
  }
}

/** a soft light: many faint discs, so it fades without visible rings. `strength` is how
    opaque its middle gets; edges fall off smoothly to nothing at r. */
export function soft(S: Sketch, cx: number, cy: number, r: number, c: string, strength = 0.4, sy = 1, rings = 30) {
  const a = S.alpha;
  S.alpha = a * Math.max(0.01, 1 - Math.pow(1 - strength, 1 / rings));
  for (let i = 0; i < rings; i++) {
    const t = 1 - i / rings;
    const rr = r * Math.pow(t, 0.8);
    S.lasso(ellipse(cx, cy, rr, rr * sy, Math.max(24, Math.round(rr / 10))), c);
  }
  S.alpha = a;
}

/** a soft light: discs from wide and faint to small and strong */
export function glow(S: Sketch, cx: number, cy: number, r: number, c: string, rings = 9, strength = 0.12, sy = 1) {
  const a = S.alpha;
  for (let i = 0; i < rings; i++) {
    const t = i / rings;
    S.alpha = a * strength;
    S.lasso(ellipse(cx, cy, r * (1 - t * 0.9), r * (1 - t * 0.9) * sy, 40), c);
  }
  S.alpha = a;
}

/** where a closed polygon crosses the horizontal line y, as pairs of x */
export function crossings(poly: Pt[], y: number) {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
  }
  return xs.sort((a, b) => a - b);
}

/** parallel lines at `angle` filling the polygon, `gap` apart, each a stroke of its own */
export function hatch(S: Sketch, poly: Pt[], angle: number, gap: number, tool: Stroke["tool"] & string, c: string, w: number, jitter = 0.3) {
  const co = Math.cos(-angle), si = Math.sin(-angle);
  const rot = poly.map(([x, y]) => [x * co - y * si, x * si + y * co] as Pt);
  const ys = rot.map((p) => p[1]);
  const back = (x: number, y: number): Pt => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
  for (let y = Math.min(...ys) + gap * 0.5; y < Math.max(...ys); y += gap * (1 + (S.R() - 0.5) * jitter)) {
    const xs = crossings(rot, y);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const inset = (xs[i + 1] - xs[i]) * 0.04 * S.R();
      S.poly([back(xs[i] + inset, y), back(xs[i + 1] - inset, y)], tool as never, c, w, 0.6, 30);
    }
  }
}

/** a ridge line from x0 to x1 around baseY, rising by `lift(x)` and roughened by noise */
export function ridge(x0: number, x1: number, baseY: number, lift: (x: number) => number, rough: number, seed: number, step = 12): Pt[] {
  const N = noise(seed);
  const pts: Pt[] = [];
  for (let x = x0; x <= x1 + step; x += step) pts.push([x, baseY - lift(x) + N(x / 140) * rough + N(x / 31, 2) * rough * 0.25]);
  return pts;
}
/** a ridge closed down to the bottom of the sheet, ready to fill */
export const below = (pts: Pt[], bottom: number): Pt[] => [...pts, [pts[pts.length - 1][0], bottom], [pts[0][0], bottom]];

/** a spatter of small dots inside a box, for grain, stars or seeds */
export function speckle(S: Sketch, x: number, y: number, w: number, h: number, n: number, c: string, size: number, tool: Stroke["tool"] & string = "ink") {
  for (let i = 0; i < n; i++) {
    const px = x + S.R() * w, py = y + S.R() * h;
    S.path([[px, py], [px + 0.5, py + 0.5]], tool as never, c, size * (0.5 + S.R()), () => 0.5);
  }
}
