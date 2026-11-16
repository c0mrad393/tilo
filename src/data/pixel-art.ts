import type { Sketch } from "../engine/sketch";

/* Tilo's pixel samples, drawn in code by Claude, an AI, with the studio's own pixel tools.
   Each piece is worked out as a grid of colours first; then it is laid down the way a pixel
   artist blocks one in: the ground with one fill, then a colour at a time, a row of cells per
   stroke. So the replay builds up colour by colour, and every cell is a real pixel stroke. */

export type Grid = (string | null)[][];

const W = 1280;

/** Turns a grid of colours into strokes: the first colour as a fill of the empty sheet, then
    each colour in `order` (any left out come last), one stroke per run of cells in a row. */
export function lay(S: Sketch, grid: Grid, order: string[]) {
  const rows = grid.length, cols = grid[0].length, cell = W / cols, g = cols;
  const at = (c: number) => (c + 0.5) * cell;
  const seen = [...new Set(grid.flat().filter((c): c is string => !!c))];
  const colours = [...order.filter((c) => seen.includes(c)), ...seen.filter((c) => !order.includes(c))];
  const [ground, ...rest] = colours;
  S.strokes.push({ tool: "pixelfill", c: ground, w: cell, p: [at(0), at(0), 50], g });
  for (const colour of rest) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== colour) continue;
        const start = c;
        while (c + 1 < cols && grid[r][c + 1] === colour) c++;
        const p = start === c ? [at(start), at(r), 50] : [at(start), at(r), 50, at(c), at(r), 50];
        // a long run goes the other way now and then, as a hand sweeping back would
        if (c - start > 3 && (r + start) % 3 === 0) p.splice(0, 6, ...p.slice(3), ...p.slice(0, 3));
        S.strokes.push({ tool: "pixel", c: colour, w: cell, p, g });
      }
    }
  }
}

export const blank = (cols: number, rows: number, c: string): Grid => Array.from({ length: rows }, () => Array<string | null>(cols).fill(c));
export const set = (g: Grid, c: number, r: number, colour: string) => {
  if (r >= 0 && r < g.length && c >= 0 && c < g[0].length) g[r][c] = colour;
};
export const inEllipse = (c: number, r: number, cx: number, cy: number, rx: number, ry: number) => ((c + 0.5 - cx) / rx) ** 2 + ((r + 0.5 - cy) / ry) ** 2 <= 1;
/** a 4 × 4 ordered dither: whether a cell `t` (0-1) of the way to the next colour has turned */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const dither = (c: number, r: number, t: number) => t > (BAYER[(r % 4) * 4 + (c % 4)] + 0.5) / 16;
/** a colour from bands top to bottom, dithered where one band meets the next */
export function bands(c: number, r: number, stops: [number, string][]) {
  for (let i = 0; i < stops.length - 1; i++) {
    const [r0, c0] = stops[i], [r1, c1] = stops[i + 1];
    if (r < r1) return dither(c, r, (r - r0) / (r1 - r0)) ? c1 : c0;
  }
  return stops[stops.length - 1][1];
}
/** cells around a shape (`inside`), the outline a pixel artist draws last */
export function outline(g: Grid, inside: (c: number, r: number) => boolean, colour: string) {
  for (let r = 0; r < g.length; r++)
    for (let c = 0; c < g[0].length; c++)
      if (!inside(c, r) && (inside(c - 1, r) || inside(c + 1, r) || inside(c, r - 1) || inside(c, r + 1))) set(g, c, r, colour);
}

// the "Sixteen" palette of the pixel studio, so a remix starts with the same inks
export const K = {
  night: "#1A1C2C", plum: "#5D275D", wine: "#B13E53", coral: "#EF7D57", sand: "#FFCD75", lime: "#A7F070", green: "#38B764", teal: "#257179",
  navy: "#29366F", blue: "#3B5DC9", sky: "#41A6F6", ice: "#73EFF7", white: "#F4F4F4", mist: "#94B0C2", slate: "#566C86", dusk: "#333C57",
};
const DOUGH = "#F3DDB3", CRUST = "#E0B27A", PLEAT = "#C1844F";

/* ---- Khinkali, steaming: 32 × 32 on the dark sheet ---- */
export function genKhinkali(S: Sketch) {
  const g = blank(32, 32, "#1B1B1F");
  // the plate, a flat ellipse with a darker rim
  for (let r = 0; r < 32; r++)
    for (let c = 0; c < 32; c++) {
      if (inEllipse(c, r, 16, 26, 14, 4.2)) set(g, c, r, r >= 26 ? K.slate : K.mist);
      if (inEllipse(c, r, 16, 25.6, 11, 2.6)) set(g, c, r, K.white);
    }
  // the dumpling: a round belly and pleats gathered up to the knot
  const half = (r: number) => (r < 8 ? 0 : r < 19 ? 10.5 * ((r - 7.5) / 11.5) ** 0.75 : 10.5 * Math.sqrt(Math.max(0, 1 - ((r - 19) / 6) ** 2)));
  const body = (c: number, r: number) => r >= 8 && r <= 24 && Math.abs(c + 0.5 - 16) <= half(r);
  for (let r = 0; r < 32; r++)
    for (let c = 0; c < 32; c++) {
      if (!body(c, r)) continue;
      const x = (c + 0.5 - 16) / Math.max(1, half(r));
      set(g, c, r, x > 0.5 || r > 22 ? CRUST : x < -0.45 && x > -0.85 && r > 13 && r < 21 ? "#FBF3E2" : DOUGH);
    }
  for (const k of [-3, -1.5, 0, 1.5, 3]) {
    // a pleat runs from the knot down and out over the belly
    for (let r = 10; r <= 19; r++) {
      const t = (r - 10) / 9, c = Math.floor(16 + k * (0.3 + t * 2.1));
      if (body(c, r) && (r > 11 || k === 0)) set(g, c, r, PLEAT);
    }
  }
  [[15, 6], [16, 6], [15, 7], [16, 7], [14, 7], [17, 7]].forEach(([c, r]) => set(g, c, r, CRUST));
  [[15, 5], [16, 5]].forEach(([c, r]) => set(g, c, r, PLEAT));
  outline(g, body, PLEAT);
  // steam, three wavering threads
  [10, 16, 22].forEach((x0, j) => {
    for (let r = 0; r < 5; r++) {
      const c = Math.round(x0 + Math.sin((r + j * 2) * 1.1) * 1.2);
      set(g, c, r + (j === 1 ? 0 : 1), r % 2 ? K.slate : K.mist);
    }
  });
  lay(S, g, ["#1B1B1F", K.mist, K.white, K.slate, DOUGH, CRUST, "#FBF3E2", PLEAT]);
}

/* ---- Brotseuli, a pomegranate: 16 × 16 on white ---- */
export function genPomegranate(S: Sketch) {
  const g = blank(16, 16, "#FFFFFF");
  const fruit = (c: number, r: number) => inEllipse(c, r, 8, 9.4, 5.6, 5.4);
  // the crown: a short neck with three points, the way a pomegranate ends
  const CROWN = [[7, 4], [8, 4], [9, 4], [7, 3], [8, 3], [9, 3], [6, 2], [8, 2], [10, 2]];
  const crown = (c: number, r: number) => CROWN.some(([a, b]) => a === c && b === r);
  for (let r = 0; r < 16; r++)
    for (let c = 0; c < 16; c++) {
      if (!fruit(c, r)) continue;
      const d = Math.hypot(c + 0.5 - 6, r + 0.5 - 7.5);
      set(g, c, r, d > 6 ? K.plum : d < 1.8 ? K.coral : K.wine);
    }
  set(g, 5, 7, K.white);
  CROWN.forEach(([c, r]) => set(g, c, r, r === 4 ? K.wine : K.plum));
  outline(g, (c, r) => fruit(c, r) || crown(c, r), K.night);
  // a leaf on a short stalk
  [[11, 2], [12, 1], [13, 1], [12, 2], [13, 0], [14, 0]].forEach(([c, r]) => set(g, c, r, K.green));
  set(g, 13, 2, K.lime);
  lay(S, g, ["#FFFFFF", K.wine, K.plum, K.coral, K.white, K.night, K.green, K.lime]);
}

/* ---- Narikala at night: 64 × 48 on the dark sheet ---- */
export function genNarikala(S: Sketch) {
  const g = blank(64, 48, K.night);
  const R = S.R;
  for (let r = 0; r < 48; r++) for (let c = 0; c < 64; c++) set(g, c, r, bands(c, r, [[0, K.night], [10, K.navy], [24, K.blue], [32, K.blue]]));
  // stars, and the moon with a bite out of it
  for (let i = 0; i < 26; i++) {
    const c = Math.floor(R() * 64), r = Math.floor(R() * 16);
    set(g, c, r, R() > 0.7 ? K.ice : K.white);
  }
  for (let r = 0; r < 16; r++)
    for (let c = 44; c < 64; c++) if (inEllipse(c, r, 53, 8, 4.2, 4.2) && !inEllipse(c, r, 55.2, 6.6, 3.6, 3.6)) set(g, c, r, K.sand);
  // the hill: the fortress on its crest, the slope falling away to the right
  const crest = (c: number) => Math.round(c < 38 ? 22 + Math.sin(c / 5) * 0.8 : 22 + (c - 38) * 0.55 + Math.sin(c / 2.3) * 0.6);
  for (let c = 0; c < 64; c++) for (let r = crest(c); r < 48; r++) set(g, c, r, K.dusk);
  // walls with crenels, three towers, lit from below
  const wallTop = 17;
  for (let c = 6; c <= 36; c++) {
    for (let r = wallTop; r < crest(c); r++) set(g, c, r, r % 3 === 0 && (c + (r % 2) * 2) % 4 === 0 ? K.dusk : K.slate);
    if (c % 2 === 0) set(g, c, wallTop - 1, K.slate);
  }
  for (const [x0, x1, top] of [[6, 10, 12], [19, 23, 11], [32, 36, 13]]) {
    for (let c = x0; c <= x1; c++) {
      for (let r = top; r < crest(c); r++) set(g, c, r, c === x1 ? K.dusk : c === x0 ? K.mist : K.slate);
      if ((c - x0) % 2 === 0) set(g, c, top - 1, K.slate);
    }
    set(g, Math.round((x0 + x1) / 2), top + 3, K.sand);
  }
  for (let c = 7; c <= 35; c++) if (g[crest(c) - 1][c] === K.slate && c % 3) set(g, c, crest(c) - 1, K.mist);
  // the church down the slope, floodlit
  const cx = 44, base = crest(cx) + 3;
  for (let r = base - 5; r < base; r++) for (let c = cx - 3; c <= cx + 3; c++) set(g, c, r, c > cx + 1 ? K.sand : K.white);
  for (let k = 0; k < 3; k++) for (let c = cx - 3 + k; c <= cx + 3 - k; c++) set(g, c, base - 6 - k, K.coral);
  for (let r = base - 12; r < base - 8; r++) for (let c = cx - 1; c <= cx + 1; c++) set(g, c, r, r === base - 12 ? K.coral : K.white);
  set(g, cx, base - 13, K.sand);
  set(g, cx - 1, base - 3, K.coral);
  set(g, cx + 1, base - 3, K.coral);
  // the old town below: dark roofs and lit windows, the river at the bottom
  for (let c = 0; c < 64; c++) {
    const h = 36 + Math.floor(Math.abs(Math.sin(c * 1.7)) * 3) + (c % 9 < 2 ? -2 : 0);
    for (let r = h; r < 44; r++) set(g, c, r, K.night);
  }
  for (let i = 0; i < 70; i++) {
    const c = Math.floor(R() * 64), r = 39 + Math.floor(R() * 5);
    if (g[r][c] === K.night) set(g, c, r, R() > 0.35 ? K.sand : K.coral);
  }
  for (let r = 44; r < 48; r++)
    for (let c = 0; c < 64; c++) {
      // the river mirrors the town's lights: row 44 shows row 43, 45 shows 42, and so on
      const above = g[87 - r][c];
      set(g, c, r, (above === K.sand || above === K.coral) && (c + r) % 2 === 0 ? K.sand : dither(c, r, 0.3) ? K.blue : K.navy);
    }
  lay(S, g, [K.night, K.navy, K.blue, K.white, K.ice, K.sand, K.dusk, K.slate, K.mist, K.coral]);
}

/* ---- Batumi, the sun going into the sea: 64 × 64 ---- */
export function genSunset(S: Sketch) {
  const g = blank(64, 64, K.navy);
  const R = S.R, H = 38;
  for (let r = 0; r < H; r++) for (let c = 0; c < 64; c++) set(g, c, r, bands(c, r, [[0, K.navy], [9, K.plum], [20, K.wine], [29, K.coral], [36, K.sand], [38, K.sand]]));
  // the sun, cut by thin bands of cloud, half into the sea
  for (let r = 0; r < H; r++)
    for (let c = 0; c < 64; c++) if (inEllipse(c, r, 32, H, 9, 9) && ![H - 7, H - 4, H - 2].includes(r)) set(g, c, r, inEllipse(c, r, 32, H, 7, 7) ? K.white : K.sand);
  // the mountains behind the town, far off to the left
  for (let c = 0; c < 26; c++) {
    const top = Math.round(H - 4 + c * 0.2 - Math.sin(c / 3) * 1.5);
    for (let r = top; r < H; r++) set(g, c, r, r === top ? K.wine : K.plum);
  }
  // the sea: dark water, the sun's road broken into short strokes, waves catching the light
  for (let r = H; r < 64; r++)
    for (let c = 0; c < 64; c++) {
      const t = (r - H) / (64 - H);
      set(g, c, r, bands(c, r, [[H, K.dusk], [H + 8, K.navy], [64, K.night]]));
      const reach = 9 - t * 5 + Math.sin(r * 1.3) * 1.5;
      if (Math.abs(c + 0.5 - 32) < reach && (r % 2 === 0 || R() > 0.6)) set(g, c, r, t < 0.35 ? K.sand : K.coral);
    }
  for (let i = 0; i < 40; i++) {
    const c = Math.floor(R() * 60), r = H + 2 + Math.floor(R() * 24);
    if (Math.abs(c - 32) > 10) for (let k = 0; k < 3; k++) set(g, c + k, r, K.slate);
  }
  // a boat with a sail, and two gulls
  for (let c = 12; c <= 21; c++) set(g, c, 47, K.night);
  for (let c = 13; c <= 20; c++) set(g, c, 48, K.night);
  for (let r = 38; r <= 46; r++) set(g, 17, r, K.night);
  for (let r = 39; r <= 45; r++) for (let c = 18; c <= 18 + Math.floor((r - 39) * 0.6); c++) set(g, c, r, K.white);
  for (const [x, y] of [[44, 12], [50, 16]]) {
    set(g, x - 1, y - 1, K.night);
    set(g, x, y, K.night);
    set(g, x + 1, y - 1, K.night);
    set(g, x + 2, y - 1, K.night);
    set(g, x - 2, y - 1, K.night);
  }
  lay(S, g, [K.navy, K.plum, K.wine, K.coral, K.sand, K.white, K.dusk, K.night, K.slate]);
}
