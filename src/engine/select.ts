/* The maths of moving a selection. A transform turns and scales around a pivot (the middle
   of what was selected), then shifts it. In a recording it is stored as seven numbers. */

export interface Xf {
  cx: number;
  cy: number;
  sx: number;
  sy: number;
  rot: number;
  dx: number;
  dy: number;
}

export const xfAround = (cx: number, cy: number): Xf => ({ cx, cy, sx: 1, sy: 1, rot: 0, dx: 0, dy: 0 });
export const toArr = (t: Xf) => [t.cx, t.cy, t.sx, t.sy, t.rot, t.dx, t.dy];
export const fromArr = (a: number[]): Xf => ({ cx: a[0] ?? 0, cy: a[1] ?? 0, sx: a[2] ?? 1, sy: a[3] ?? 1, rot: a[4] ?? 0, dx: a[5] ?? 0, dy: a[6] ?? 0 });

export const isIdentity = (t: Xf) =>
  Math.abs(t.sx - 1) < 1e-3 && Math.abs(t.sy - 1) < 1e-3 && Math.abs(t.rot) < 1e-4 && Math.abs(t.dx) < 0.05 && Math.abs(t.dy) < 0.05;

/** Rounded to what a recording keeps, so the studio shows exactly what a replay will. */
export const snapped = (t: Xf): Xf => {
  const r = (v: number, k: number) => Math.round(v * k) / k + 0;
  return { cx: r(t.cx, 10), cy: r(t.cy, 10), sx: r(t.sx, 1000), sy: r(t.sy, 1000), rot: r(t.rot, 10000), dx: r(t.dx, 10), dy: r(t.dy, 10) };
};

/** Part of the way from no change (0) to `t` (1), for replays. */
export const partway = (t: Xf, k: number): Xf => ({ ...t, sx: 1 + (t.sx - 1) * k, sy: 1 + (t.sy - 1) * k, rot: t.rot * k, dx: t.dx * k, dy: t.dy * k });

export function apply(t: Xf, x: number, y: number): [number, number] {
  const c = Math.cos(t.rot), s = Math.sin(t.rot);
  const ux = (x - t.cx) * t.sx, uy = (y - t.cy) * t.sy;
  return [t.cx + t.dx + c * ux - s * uy, t.cy + t.dy + s * ux + c * uy];
}

export function invert(t: Xf, X: number, Y: number): [number, number] {
  const c = Math.cos(t.rot), s = Math.sin(t.rot);
  const vx = X - t.cx - t.dx, vy = Y - t.cy - t.dy;
  return [t.cx + (c * vx + s * vy) / (t.sx || 1e-6), t.cy + (-s * vx + c * vy) / (t.sy || 1e-6)];
}

/** Sets `ctx` up so that drawing in sheet units × `k` lands transformed. */
export function setOn(ctx: CanvasRenderingContext2D, t: Xf, k: number) {
  ctx.translate((t.cx + t.dx) * k, (t.cy + t.dy) * k);
  ctx.rotate(t.rot);
  ctx.scale(t.sx, t.sy);
  ctx.translate(-t.cx * k, -t.cy * k);
}

/** The bounding box of a flat [x, y, ...] list. */
export function boundsOf(pts: number[], step = 2): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += step) {
    x0 = Math.min(x0, pts[i]);
    x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]);
    y1 = Math.max(y1, pts[i + 1]);
  }
  return [x0, y0, x1, y1];
}
