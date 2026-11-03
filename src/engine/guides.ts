import type { Guides } from "../data/library";
import { SHEET } from "./stroke";

/* Perspective guides for the studio. They are a drawing aid, never part of the picture or
   the recording: rays from one or two vanishing points, and a snap that holds a stroke to
   the guide direction nearest to where it set off. */

const INK = "rgba(45, 75, 179, 0.34)";
const INK_STRONG = "rgba(45, 75, 179, 0.85)";

/** The directions a snapped stroke from (x, y) may take. */
function directions(g: Guides, x: number, y: number): [number, number][] {
  const out: [number, number][] = [[0, 1]];
  if (g.mode === 1) out.push([1, 0]);
  for (const [vx, vy] of g.vp.slice(0, g.mode)) {
    const l = Math.hypot(vx - x, vy - y);
    if (l > 1) out.push([(vx - x) / l, (vy - y) / l]);
  }
  return out;
}

/** The unit direction nearest to the move from (sx, sy) to (x, y), signed to match it. */
export function snapDirection(g: Guides, sx: number, sy: number, x: number, y: number): [number, number] {
  const l = Math.hypot(x - sx, y - sy) || 1;
  const mx = (x - sx) / l, my = (y - sy) / l;
  let best: [number, number] = [1, 0], score = -1;
  for (const [ux, uy] of directions(g, sx, sy)) {
    const d = mx * ux + my * uy;
    if (Math.abs(d) > score) {
      score = Math.abs(d);
      best = d < 0 ? [-ux, -uy] : [ux, uy];
    }
  }
  return best;
}

/** Draws the guides in sheet units; `s` is screen pixels per unit, for hairlines. */
export function drawGuides(ctx: CanvasRenderingContext2D, g: Guides, s: number) {
  if (!g.mode) return;
  const vps = g.vp.slice(0, g.mode);
  const W = SHEET.w, H = SHEET.h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.lineWidth = 1 / s;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  for (const [vx, vy] of vps) {
    const inside = vx >= 0 && vx <= W && vy >= 0 && vy <= H;
    // rays spread evenly over the part of the sheet the point can see
    let a0 = 0, a1 = Math.PI * 2, n = 32;
    if (!inside) {
      const mid = Math.atan2(H / 2 - vy, W / 2 - vx);
      const rel = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => {
        let d = Math.atan2(y - vy, x - vx) - mid;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
      });
      a0 = mid + Math.min(...rel);
      a1 = mid + Math.max(...rel);
      n = 18;
    }
    const reach = Math.hypot(W, H) + Math.hypot(vx - W / 2, vy - H / 2);
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      ctx.moveTo(vx, vy);
      ctx.lineTo(vx + Math.cos(a) * reach, vy + Math.sin(a) * reach);
    }
  }
  ctx.stroke();
  // the horizon
  ctx.strokeStyle = INK_STRONG;
  ctx.beginPath();
  const [hx, hy] = vps[0];
  if (vps.length > 1 && Math.abs(vps[1][0] - hx) > 1) {
    const [x2, y2] = vps[1];
    const m = (y2 - hy) / (x2 - hx);
    ctx.moveTo(0, hy - m * hx);
    ctx.lineTo(W, hy + m * (W - hx));
  } else {
    ctx.moveTo(0, hy);
    ctx.lineTo(W, hy);
  }
  ctx.stroke();
  ctx.restore();
  // handles, drawn outside the clip so a point off the sheet can still be grabbed
  ctx.save();
  ctx.lineWidth = 1.5 / s;
  for (const [vx, vy] of vps) {
    const r = 9 / s;
    ctx.fillStyle = "rgba(251, 250, 245, 0.92)";
    ctx.strokeStyle = INK_STRONG;
    ctx.beginPath();
    ctx.arc(vx, vy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(vx - r * 1.7, vy);
    ctx.lineTo(vx + r * 1.7, vy);
    ctx.moveTo(vx, vy - r * 1.7);
    ctx.lineTo(vx, vy + r * 1.7);
    ctx.stroke();
  }
  ctx.restore();
}

/** Which vanishing point, if any, is under a screen point (within `slop` pixels). */
export function handleAt(g: Guides, x: number, y: number, s: number, slop = 16) {
  return g.vp.slice(0, g.mode).findIndex(([vx, vy]) => Math.hypot(vx - x, vy - y) * s < slop);
}
