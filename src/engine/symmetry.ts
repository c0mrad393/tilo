import type { Stroke } from "./stroke";

export const SYMMETRY = [
  ["", "Off"],
  ["v", "Mirror"],
  ["vh", "Four ways"],
  ["r6", "Radial 6"],
  ["r8", "Radial 8"],
] as const;

/* A stroke drawn with symmetry is stored once, with its mode; the copies are made at draw
   time by moving its points around the sheet's centre (w × h in sheet units). */
export function mirrored(s: Stroke, w: number, h: number): Stroke[] {
  if (!s.m) return [s];
  const cx = w / 2, cy = h / 2;
  // moves the points, and turns the pen's azimuth the same way
  const map = (f: (x: number, y: number) => [number, number], turn: (az: number) => number): Stroke => {
    const p = s.p.slice();
    for (let i = 0; i < p.length; i += 3) [p[i], p[i + 1]] = f(p[i], p[i + 1]);
    if (!s.tl) return { ...s, p };
    const tl = s.tl.slice();
    for (let i = 0; i < tl.length; i += 2) tl[i] = (turn(tl[i]) + 720) % 360;
    return { ...s, p, tl };
  };
  const out = [s];
  if (s.m.includes("v")) out.push(map((x, y) => [w - x, y], (a) => 180 - a));
  if (s.m.includes("h")) out.push(map((x, y) => [x, h - y], (a) => -a));
  if (s.m === "vh") out.push(map((x, y) => [w - x, h - y], (a) => a + 180));
  if (s.m[0] === "r") {
    const n = Math.max(2, Math.min(12, parseInt(s.m.slice(1)) || 6));
    for (let j = 1; j < n; j++) {
      const a = (j / n) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      out.push(map((x, y) => [cx + (x - cx) * c - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * c], (az) => az + (j / n) * 360));
    }
  }
  return out;
}
