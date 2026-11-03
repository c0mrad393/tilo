import { PAPERS, toothAt, type PaperId } from "./paper";
import type { Stroke } from "./stroke";

/* The brushes. Each one turns a stroke record into marks on a canvas and nothing else, so a
   replay of the record lays down the same picture. Tools with grain or spray draw from a
   random sequence seeded by the stroke, never from Math.random. */

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lightens (d > 0) or darkens (d < 0) a #rrggbb colour. */
export function shade(hex: string, d: number) {
  const n = parseInt(hex.slice(1, 7), 16);
  if (Number.isNaN(n)) return hex;
  const t = d > 0 ? 255 : 0, f = Math.abs(d);
  const ch = (v: number) => Math.round(v + (t - v) * f).toString(16).padStart(2, "0");
  return `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/* Walks the polyline at an even spacing, calling `f` with position, pressure and direction. */
function walk(X: (i: number) => number, Y: (i: number) => number, P: (i: number) => number, n: number, spacing: number, f: (x: number, y: number, pr: number, ux: number, uy: number) => void) {
  f(X(0), Y(0), P(0), 1, 0);
  let carry = 0;
  for (let i = 1; i < n; i++) {
    const x0 = X(i - 1), y0 = Y(i - 1), dx = X(i) - x0, dy = Y(i) - y0;
    const len = Math.hypot(dx, dy);
    if (!len) continue;
    const ux = dx / len, uy = dy / len;
    let t = spacing - carry;
    for (; t <= len; t += spacing) f(x0 + ux * t, y0 + uy * t, P(i - 1) + (P(i) - P(i - 1)) * (t / len), ux, uy);
    carry = len - (t - spacing);
  }
}

let smudgeTmp: HTMLCanvasElement | null = null;
let fillTmp: HTMLCanvasElement | null = null;

export function drawBrush(ctx: CanvasRenderingContext2D, s: Stroke, k: number, n: number, paper: PaperId = "smooth") {
  const p = s.p;
  const X = (i: number) => p[i * 3] * k;
  const Y = (i: number) => p[i * 3 + 1] * k;
  const P = (i: number) => p[i * 3 + 2] / 99;
  const A = s.a ?? 1;
  const w = s.w * k;
  // pen tilt: azimuth in radians and how far the pen leans over, 0 upright to 1 flat
  const az = (i: number) => ((s.tl?.[i * 2] ?? 0) * Math.PI) / 180;
  const lean = (i: number) => 1 - (s.tl?.[i * 2 + 1] ?? 90) / 90;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    if (n === 1) {
      ctx.lineTo(X(0) + 0.01, Y(0));
      return;
    }
    for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
    ctx.lineTo(X(n - 1), Y(n - 1));
  };
  // the path pushed sideways along its normals, for streaks inside a wide stroke
  const offsetPath = (off: (i: number) => number, upto = n) => {
    ctx.beginPath();
    for (let i = 0; i < upto; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let nx = -(Y(b) - Y(a)), ny = X(b) - X(a);
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      const o = off(i);
      if (i) ctx.lineTo(X(i) + nx * o, Y(i) + ny * o);
      else ctx.moveTo(X(i) + nx * o, Y(i) + ny * o);
    }
  };
  // a line whose width follows pressure, drawn segment by segment
  const pressed = (width: (i: number) => number) => {
    if (n < 3) {
      ctx.lineWidth = width(0);
      path();
      ctx.stroke();
      return;
    }
    let px = X(0), py = Y(0);
    for (let i = 1; i < n - 1; i++) {
      const mx = (X(i) + X(i + 1)) / 2, my = (Y(i) + Y(i + 1)) / 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(X(i), Y(i), mx, my);
      ctx.lineWidth = width(i);
      ctx.stroke();
      px = mx;
      py = my;
    }
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(X(n - 1), Y(n - 1));
    ctx.lineWidth = width(n - 1);
    ctx.stroke();
  };

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  const R = rng(s.r ?? 7);
  switch (s.tool) {
    case "pencil": {
      // laid over on its side a pencil shades: a wider, lighter mark
      let side = 0;
      if (s.tl) {
        for (let i = 0; i < n; i++) side += lean(i);
        side /= n;
      }
      ctx.globalAlpha = 0.85 * A * (1 - 0.55 * side);
      ctx.lineWidth = Math.max(0.7, w * 0.5 * (1 + 3 * side));
      path();
      ctx.stroke();
      ctx.globalAlpha = 0.28 * A;
      ctx.lineWidth = Math.max(0.5, w * 0.3 * (1 + 2 * side));
      ctx.translate(0.9 * k, -0.7 * k);
      path();
      ctx.stroke();
      break;
    }
    case "ink":
      ctx.globalAlpha = A;
      pressed((i) => Math.max(0.7, w * (0.3 + 0.95 * P(i))));
      break;
    case "brushpen": {
      // a flat nib: thick across it, thin along it. Held at a fixed angle, or square to
      // the way a tilted pen leans
      const ang = (i: number) => (s.tl ? az(i) + Math.PI / 2 : -0.62);
      const half = (i: number) => Math.max(0.5, w * (0.15 + 0.85 * P(i)) * 0.8);
      ctx.globalAlpha = 0.96 * A;
      ctx.beginPath();
      if (n === 1) ctx.ellipse(X(0), Y(0), half(0), half(0) * 0.35, ang(0), 0, Math.PI * 2);
      for (let i = 0; i < n - 1; i++) {
        const h0 = half(i), h1 = half(i + 1);
        const a0 = ang(i), a1 = ang(i + 1);
        const q: [number, number][] = [
          [X(i) + Math.cos(a0) * h0, Y(i) + Math.sin(a0) * h0],
          [X(i + 1) + Math.cos(a1) * h1, Y(i + 1) + Math.sin(a1) * h1],
          [X(i + 1) - Math.cos(a1) * h1, Y(i + 1) - Math.sin(a1) * h1],
          [X(i) - Math.cos(a0) * h0, Y(i) - Math.sin(a0) * h0],
        ];
        // same winding for every quad, so overlaps join instead of cancelling
        const cross = (q[1][0] - q[0][0]) * (q[3][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[3][0] - q[0][0]);
        if (cross < 0) q.reverse();
        ctx.moveTo(q[0][0], q[0][1]);
        for (let j = 1; j < 4; j++) ctx.lineTo(q[j][0], q[j][1]);
        ctx.closePath();
      }
      ctx.fill("nonzero");
      ctx.lineWidth = Math.max(0.8, w * 0.14);
      path();
      ctx.stroke();
      break;
    }
    case "charcoal": {
      const pits = PAPERS[paper].pits;
      walk(X, Y, P, n, Math.max(0.8, w * 0.16), (x, y, pr) => {
        const rad = w * (0.32 + 0.3 * pr);
        const count = 2 + Math.round(4 * pr);
        for (let c = 0; c < count; c++) {
          const a = R() * Math.PI * 2, d = Math.sqrt(R()) * rad, f = R(), z = R();
          const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
          if (toothAt(paper, px / k, py / k) < pits) continue;
          ctx.globalAlpha = A * (0.12 + 0.42 * pr) * (0.45 + f * 0.55);
          const sz = Math.max(0.6, w * 0.09) * (0.6 + z);
          ctx.fillRect(px, py, sz, sz);
        }
      });
      break;
    }
    case "marker":
      ctx.globalAlpha = 0.55 * A;
      ctx.lineWidth = w * 1.8;
      path();
      ctx.stroke();
      break;
    case "wash":
      ctx.globalAlpha = 0.2 * A;
      ctx.lineWidth = w * 3.2;
      ctx.shadowColor = s.c;
      ctx.shadowBlur = w * 1.3;
      path();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.13 * A;
      ctx.lineWidth = w * 1.9;
      path();
      ctx.stroke();
      break;
    case "gouache": {
      // flat, opaque and matte, with faint streaks where the brush hairs dragged
      ctx.globalAlpha = 0.97 * A;
      const width = (i: number) => Math.max(1, w * (0.55 + 0.75 * P(i)) * 1.25);
      pressed(width);
      ctx.lineCap = "butt";
      for (const [off, d] of [[-0.3, 0.09], [0.08, -0.07], [0.34, 0.06]]) {
        ctx.strokeStyle = shade(s.c, d);
        ctx.globalAlpha = 0.4 * A;
        ctx.lineWidth = Math.max(0.6, w * 0.12);
        offsetPath((i) => off * width(i));
        ctx.stroke();
      }
      break;
    }
    case "oil": {
      // a bristle brush: each hair carries its own shade and some run dry before the end
      const hairs = Math.min(14, 4 + Math.round(s.w / 3));
      ctx.lineWidth = Math.max(0.8, ((w * 1.25) / hairs) * 1.6);
      for (let b = 0; b < hairs; b++) {
        const base = ((b + 0.5) / hairs - 0.5) * w * 1.25;
        const tone = (R() - 0.5) * 0.24, reach = 0.7 + R() * 0.3, alpha = 0.75 + R() * 0.25;
        ctx.strokeStyle = shade(s.c, tone);
        ctx.globalAlpha = alpha * A;
        offsetPath((i) => base * (0.75 + 0.4 * P(i)), Math.max(1, Math.round(n * reach)));
        ctx.stroke();
      }
      break;
    }
    case "spray":
      ctx.globalAlpha = 0.55 * A;
      walk(X, Y, P, n, Math.max(1.5, w * 0.35), (x, y, pr) => {
        const count = 3 + Math.round(9 * pr);
        for (let c = 0; c < count; c++) {
          const a = R() * Math.PI * 2, d = Math.sqrt(R()) * w * 1.6, z = R();
          const sz = Math.max(0.7, w * 0.06) * (0.5 + z);
          ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, sz, sz);
        }
      });
      break;
    case "fill":
      floodFill(ctx, ctx.canvas as HTMLCanvasElement, X(0), Y(0), s.c, A);
      break;
    case "lasso":
      if (n < 3) break;
      ctx.globalAlpha = A;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      for (let i = 1; i < n; i++) ctx.lineTo(X(i), Y(i));
      ctx.closePath();
      ctx.fill();
      break;
    case "smudge": {
      // carries a soft disc of what is already there along the stroke
      const D = Math.max(4, Math.round(w * 2.2));
      smudgeTmp ??= document.createElement("canvas");
      const tmp = smudgeTmp;
      if (tmp.width !== D) tmp.width = tmp.height = D;
      const t = tmp.getContext("2d")!;
      const g = t.createRadialGradient(D / 2, D / 2, 0, D / 2, D / 2, D / 2);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(0.55, "rgba(0,0,0,0.6)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      let px = X(0), py = Y(0);
      walk(X, Y, P, n, Math.max(1, w * 0.22), (x, y, pr) => {
        t.globalCompositeOperation = "copy";
        t.drawImage(ctx.canvas, px - D / 2, py - D / 2, D, D, 0, 0, D, D);
        t.globalCompositeOperation = "destination-in";
        t.fillStyle = g;
        t.fillRect(0, 0, D, D);
        ctx.globalAlpha = A * (0.3 + 0.55 * pr);
        ctx.drawImage(tmp, 0, 0, D, D, x - D / 2, y - D / 2, D, D);
        px = x;
        py = y;
      });
      break;
    }
    case "eraser":
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = A;
      ctx.strokeStyle = "#000";
      ctx.lineWidth = w * 2.2;
      path();
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** Fills the area around (x, y) whose colour in `sample` matches the pixel there, painting
    onto `ctx`. The area grows by a few pixels underneath, so it tucks under soft line edges. */
export function floodFill(ctx: CanvasRenderingContext2D, sample: HTMLCanvasElement, x: number, y: number, color: string, alpha = 1, tol = 48) {
  const W = sample.width, H = sample.height;
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const d = sample.getContext("2d")!.getImageData(0, 0, W, H).data;
  const j0 = (y * W + x) * 4;
  const r0 = d[j0], g0 = d[j0 + 1], b0 = d[j0 + 2], a0 = d[j0 + 3];
  const mask = new Uint8Array(W * H);
  const ok = (i: number) => {
    if (mask[i]) return false;
    const j = i * 4;
    return Math.abs(d[j] - r0) + Math.abs(d[j + 1] - g0) + Math.abs(d[j + 2] - b0) + Math.abs(d[j + 3] - a0) <= tol;
  };
  const stack = [x, y];
  while (stack.length) {
    const sy = stack.pop()!, sx0 = stack.pop()!;
    let sx = sx0;
    const row = sy * W;
    while (sx > 0 && ok(row + sx - 1)) sx--;
    let up = false, down = false;
    for (; sx < W && ok(row + sx); sx++) {
      mask[row + sx] = 1;
      if (sy > 0) {
        const u = ok(row - W + sx);
        if (u && !up) stack.push(sx, sy - 1);
        up = u;
      }
      if (sy < H - 1) {
        const v = ok(row + W + sx);
        if (v && !down) stack.push(sx, sy + 1);
        down = v;
      }
    }
  }
  // grow the area by a few pixels: separable max filter, across then down
  const R = 3;
  const across = new Uint8Array(W * H), grown = new Uint8Array(W * H);
  for (let yy = 0; yy < H; yy++) {
    const row = yy * W;
    for (let xx = 0, run = -1e9; xx < W; xx++) {
      if (mask[row + xx]) run = xx;
      else if (xx + R < W) for (let k = 1; k <= R; k++) if (mask[row + xx + k]) { run = xx; break; }
      if (xx - run <= R) across[row + xx] = 1;
    }
  }
  for (let xx = 0; xx < W; xx++)
    for (let yy = 0, run = -1e9; yy < H; yy++) {
      const i = yy * W + xx;
      if (across[i]) run = yy;
      else if (yy + R < H) for (let k = 1; k <= R; k++) if (across[i + k * W]) { run = yy; break; }
      if (yy - run <= R) grown[i] = 1;
    }
  const n = parseInt(color.slice(1, 7), 16);
  const paint = (pick: (i: number) => boolean, op: GlobalCompositeOperation) => {
    const out = new ImageData(W, H);
    const o = out.data;
    for (let i = 0; i < W * H; i++) {
      if (!pick(i)) continue;
      o[i * 4] = n >> 16;
      o[i * 4 + 1] = (n >> 8) & 255;
      o[i * 4 + 2] = n & 255;
      o[i * 4 + 3] = 255;
    }
    fillTmp ??= document.createElement("canvas");
    if (fillTmp.width !== W || fillTmp.height !== H) {
      fillTmp.width = W;
      fillTmp.height = H;
    }
    fillTmp.getContext("2d")!.putImageData(out, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = op;
    ctx.drawImage(fillTmp, 0, 0);
    ctx.restore();
  };
  // the area itself goes on top; the grown rim goes underneath, so it shows only through
  // the soft edges of lines on this layer and never covers them
  paint((i) => mask[i] === 1, "source-over");
  paint((i) => grown[i] === 1 && !mask[i], "destination-over");
}
