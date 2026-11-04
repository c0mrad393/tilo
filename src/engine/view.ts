/* How the studio shows the sheet: scale, rotation and an optional left-right flip around the
   sheet's origin, then an offset in screen pixels. Only the view turns; the drawing and its
   recording stay in sheet units. */
export interface View {
  s: number;
  /** rotation in radians, clockwise on screen */
  r: number;
  /** -1 shows the sheet mirrored */
  f: 1 | -1;
  ox: number;
  oy: number;
}

export const IDENTITY: View = { s: 1, r: 0, f: 1, ox: 0, oy: 0 };

export function toScreen(v: View, x: number, y: number): [number, number] {
  const c = Math.cos(v.r), sn = Math.sin(v.r), fx = x * v.f;
  return [v.ox + v.s * (c * fx - sn * y), v.oy + v.s * (sn * fx + c * y)];
}

export function toSheet(v: View, X: number, Y: number): [number, number] {
  const c = Math.cos(v.r), sn = Math.sin(v.r);
  const dx = (X - v.ox) / v.s, dy = (Y - v.oy) / v.s;
  return [(c * dx + sn * dy) * v.f, -sn * dx + c * dy];
}

/** `v` with its offset chosen so the sheet point `pt` lands on screen point (X, Y). */
export function anchor(v: View, pt: [number, number], X: number, Y: number): View {
  const [sx, sy] = toScreen({ ...v, ox: 0, oy: 0 }, pt[0], pt[1]);
  return { ...v, ox: X - sx, oy: Y - sy };
}

/** The view as canvas setTransform arguments, for a canvas `dpr` device pixels per CSS pixel. */
export function matrix(v: View, dpr: number): [number, number, number, number, number, number] {
  const c = Math.cos(v.r) * v.s * dpr, sn = Math.sin(v.r) * v.s * dpr;
  return [c * v.f, sn * v.f, -sn, c, v.ox * dpr, v.oy * dpr];
}
