/* Colour conversions for the picker: hue 0-360, saturation and value 0-1, hex as #RRGGBB. */

export type Hsv = [number, number, number];

/** A #RGB or #RRGGBB string (the # optional), as upper-case #RRGGBB, or null. */
export function normHex(s: string): string | null {
  const m = s.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(m)) return ("#" + [...m].map((c) => c + c).join("")).toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(m)) return ("#" + m).toUpperCase();
  return null;
}

export function hexToHsv(hex: string): Hsv {
  const n = parseInt((normHex(hex) ?? "#000000").slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}

export function hsvToHex([h, s, v]: Hsv): string {
  const f = (k: number) => {
    const x = (k + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(x, 4 - x, 1))) * 255);
  };
  return "#" + [f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Puts `c` at the front of `list`, without repeats, keeping at most `max`. */
export const remember = (list: string[], c: string, max = 10) => [c, ...list.filter((x) => x !== c)].slice(0, max);
