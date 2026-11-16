import type { Anim } from "../engine/frames";
import type { Sketch } from "../engine/sketch";
import type { LayerDef } from "../engine/stroke";
import { bands, blank, dither, inEllipse, K, lay, set, type Grid } from "./pixel-art";

/* Tilo's animation samples (3.2), drawn in code by Claude, an AI, the way the studio makes an
   animation: the first frame is laid down like a pixel still, colour by colour; then each
   next frame is a copy of the one before (a recorded layer copy, as the strip's Copy is) and
   only the cells that change are painted over. So the replay shows the first frame being
   drawn and then each frame being changed, and the loop plays at the end. */

const W = 1280;

export type Moving = { layers: LayerDef[]; anim: Anim };

/** Lays an animation from a grid per frame. `ms` is every frame's time, or one per frame. */
export function layFrames(S: Sketch, frames: Grid[], order: string[], ms: number | number[], bounce = false): Moving {
  lay(S, frames[0], order);
  const rows = frames[0].length, cols = frames[0][0].length, cell = W / cols;
  const at = (c: number) => (c + 0.5) * cell;
  for (let k = 1; k < frames.length; k++) {
    const prev = frames[k - 1], next = frames[k];
    S.strokes.push({ tool: "dup", c: "", w: 0, p: [], l: k, src: k - 1 });
    const seen = [...new Set(next.flat().filter((c): c is string => !!c))];
    const colours = [...order.filter((c) => seen.includes(c)), ...seen.filter((c) => !order.includes(c))];
    for (const colour of colours)
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          if (next[r][c] !== colour || prev[r][c] === colour) continue;
          const start = c;
          while (c + 1 < cols && next[r][c + 1] === colour && prev[r][c + 1] !== colour) c++;
          const p = start === c ? [at(start), at(r), 50] : [at(start), at(r), 50, at(c), at(r), 50];
          S.strokes.push({ tool: "pixel", c: colour, w: cell, p, g: cols, l: k });
        }
  }
  const time = (k: number) => (Array.isArray(ms) ? ms[k] : ms);
  return {
    layers: frames.map((_, k) => ({ id: k, name: "Layer 1", blend: "source-over", opacity: 1, ...(k ? { f: k } : {}) })),
    anim: { frames: frames.map((_, k) => ({ id: k, ms: time(k) })), ...(bounce ? { bounce: true as const } : {}) },
  };
}

const frames = (n: number, draw: (f: number) => Grid) => Array.from({ length: n }, (_, f) => draw(f));
const TAU = Math.PI * 2;

/* ---- Tea, still hot: 32 × 32 on the dark sheet, six frames of steam ---- */
const DARK = "#1B1B1F";
export function genTea(S: Sketch): Moving {
  const draw = (f: number) => {
    const g = blank(32, 32, DARK);
    // the table, and the saucer on it
    for (let r = 27; r < 32; r++) for (let c = 0; c < 32; c++) set(g, c, r, r === 27 ? K.slate : (c + r) % 7 === 0 ? K.slate : K.dusk);
    for (let r = 24; r < 30; r++) for (let c = 0; c < 32; c++) if (inEllipse(c, r, 16, 27, 11.5, 2.4)) set(g, c, r, r >= 27 ? K.slate : K.mist);
    // the glass: tea the colour of a sunset, a lighter top, a slice of lemon, a highlight
    for (let r = 12; r <= 25; r++)
      for (let c = 11; c <= 20; c++) {
        const wall = c === 11 || c === 20;
        set(g, c, r, wall ? K.mist : r <= 13 ? K.coral : K.wine);
      }
    for (let c = 12; c <= 19; c++) set(g, c, 12, K.sand);
    for (const [c, colour] of [[14, K.lime], [15, K.sand], [16, K.lime]] as const) set(g, c, 13, colour);
    for (let r = 14; r <= 18; r++) set(g, 12, r, K.white);
    // the metal holder round its lower half, with a handle
    for (let r = 19; r <= 25; r++)
      for (let c = 10; c <= 21; c++) set(g, c, r, r === 19 || r === 25 || ((c === 12 || c === 15 || c === 16 || c === 19) && r >= 21 && r <= 23) ? K.mist : K.slate);
    for (let r = 17; r <= 23; r++) {
      set(g, 24, r, K.slate);
      if (r === 17 || r === 23) for (let c = 21; c <= 24; c++) set(g, c, r, K.slate);
    }
    set(g, 24, 19, K.mist);
    // steam: three curls rising, a little further each frame, fading as they go
    for (let w = 0; w < 3; w++)
      for (let r = 1; r <= 11; r++) {
        if ((r + f + w * 2) % 6 >= 3) continue;
        const x = 13 + w * 3 + Math.round(1.3 * Math.sin((TAU * (r + f)) / 6 + w * 2));
        set(g, x, r, r <= 4 ? K.slate : K.mist);
      }
    return g;
  };
  return layFrames(S, frames(6, draw), [DARK, K.dusk, K.slate, K.mist, K.white, K.wine, K.plum, K.coral, K.sand, K.lime], 130);
}

/* ---- The cable car, after dark: 64 × 48, eight frames, cabins climbing to the fortress ---- */
export function genCableCar(S: Sketch): Moving {
  const R = S.R;
  const stars = Array.from({ length: 22 }, () => [Math.floor(R() * 64), Math.floor(R() * 12), Math.floor(R() * 4)]);
  const lit = Array.from({ length: 64 }, () => R());
  const roofs = Array.from({ length: 64 }, (_, c) => 35 + Math.floor(Math.abs(Math.sin(c * 1.3)) * 3) - (c % 11 < 3 ? 2 : 0));
  const hill = (c: number) => Math.round(17 + Math.max(0, c - 6) ** 1.3 * 0.45);
  const wire = (c: number) => Math.round(12 + ((c - 14) * 19) / 49);
  const draw = (f: number) => {
    const g = blank(64, 48, K.night);
    for (let r = 0; r < 36; r++) for (let c = 0; c < 64; c++) set(g, c, r, bands(c, r, [[0, K.night], [9, K.navy], [21, K.plum], [31, K.wine], [36, K.wine]]));
    // stars, one in four of them dimmer each frame
    for (const [c, r, k] of stars) set(g, c, r, (k + f) % 4 === 0 ? K.slate : K.mist);
    // the hill and the fortress on it, floodlit
    for (let c = 0; c < 64; c++) for (let r = hill(c); r < 40; r++) set(g, c, r, r < hill(c) + 1 ? K.slate : K.dusk);
    // walls along the ridge, their crenels, two towers; lit from below, the east faces in shade
    for (let c = 0; c <= 14; c++) {
      const top = hill(c) - 4;
      for (let r = top; r < hill(c); r++) set(g, c, r, c % 5 === 4 ? K.slate : r === hill(c) - 1 ? K.sand : K.mist);
      if (c % 2 === 0) set(g, c, top - 1, K.mist);
    }
    for (let r = 8; r < 14; r++) for (let c = 3; c <= 6; c++) set(g, c, r, c === 6 ? K.slate : K.mist);
    for (let c = 3; c <= 6; c += 3) set(g, c, 7, K.mist);
    for (let r = 10; r < 15; r++) for (let c = 11; c <= 13; c++) set(g, c, r, c === 13 ? K.slate : K.mist);
    set(g, 4, 10, K.night);
    set(g, 12, 12, K.night);
    // the old town under it: roofs, windows, a few of them going on and off
    for (let c = 0; c < 64; c++) {
      for (let r = Math.max(roofs[c], hill(c) + 2); r < 44; r++) set(g, c, r, r === roofs[c] ? K.dusk : K.night);
      const w = 39 + (c % 3);
      if (lit[c] > 0.45 && c % 2 === 1 && g[w][c] === K.night) set(g, c, w, lit[c] > 0.92 && (f + c) % 8 < 3 ? K.dusk : lit[c] > 0.7 ? K.sand : K.coral);
    }
    // the river, with the town's lights broken up on it
    for (let r = 44; r < 48; r++)
      for (let c = 0; c < 64; c++) {
        const above = g[83 - r]?.[c];
        const glint = (above === K.sand || above === K.coral) && (c + r + f) % 2 === 0;
        set(g, c, r, glint ? K.sand : dither(c, r, 0.25) ? K.blue : K.navy);
      }
    // the wire, and cabins on it every 24 cells, three cells further up each frame
    for (let c = 14; c < 64; c++) set(g, c, wire(c), K.mist);
    for (let k = 0; k < 3; k++) {
      // into the station at the fortress, out of sight past it
      const x = 64 - ((f * 3 + k * 24) % 72), y = wire(x + 1);
      if (x < 15) continue;
      set(g, x + 1, y + 1, K.mist);
      for (let c = x - 1; c <= x + 3; c++) {
        set(g, c, y + 2, K.wine);
        set(g, c, y + 3, c === x - 1 || c === x + 3 ? K.coral : K.sand);
        set(g, c, y + 4, K.coral);
      }
    }
    return g;
  };
  return layFrames(S, frames(8, draw), [K.night, K.navy, K.plum, K.wine, K.dusk, K.slate, K.mist, K.sand, K.coral, K.blue], 150);
}

/* ---- A cat on the balcony: 32 × 32, five frames and back, its tail going, one blink ---- */
export function genBalconyCat(S: Sketch): Moving {
  const draw = (f: number) => {
    const g = blank(32, 32, K.navy);
    for (let r = 0; r < 22; r++) for (let c = 0; c < 32; c++) set(g, c, r, bands(c, r, [[0, K.night], [8, K.navy], [22, K.dusk]]));
    for (const [c, r] of [[3, 3], [8, 6], [29, 15], [19, 2], [2, 12]]) set(g, c, r, K.mist);
    for (let r = 0; r < 14; r++) for (let c = 18; c < 32; c++) if (inEllipse(c, r, 25, 6, 4.2, 4.2)) set(g, c, r, inEllipse(c, r, 26, 5, 2.6, 2.6) ? K.white : K.sand);
    // the carved balcony: a rail, its balusters and the dark room behind
    for (let c = 0; c < 32; c++) {
      set(g, c, 22, K.green);
      set(g, c, 23, K.teal);
      for (let r = 24; r < 32; r++) set(g, c, r, c % 3 === 1 ? (r === 27 ? K.green : K.teal) : r < 26 ? K.plum : K.wine);
    }
    // the cat, sitting on the rail, back to the moon
    const body = (c: number, r: number) => inEllipse(c, r, 11.5, 17.5, 4.6, 5) || inEllipse(c, r, 11.5, 10.5, 3.4, 3.2);
    for (let r = 4; r < 23; r++) for (let c = 4; c < 20; c++) if (body(c, r)) set(g, c, r, K.night);
    for (const [c, r] of [[9, 5], [9, 6], [10, 6], [9, 7], [10, 7], [14, 5], [14, 6], [13, 6], [14, 7], [13, 7]]) set(g, c, r, K.night);
    const blink = f === 4;
    set(g, 10, 10, blink ? K.dusk : K.lime);
    set(g, 13, 10, blink ? K.dusk : K.lime);
    set(g, 11, 12, K.wine);
    // the tail, hanging over the rail and swinging
    const swing = [-2, -1, 0, 1, 2][f];
    let tip = 0;
    for (let r = 21; r <= 30; r++) {
      const t = (r - 21) / 9;
      tip = 16 + Math.round(swing * 2 * t ** 1.4);
      set(g, tip, r, K.night);
      if (r > 22 && r < 27) set(g, tip + 1, r, K.night);
    }
    set(g, tip + (swing < 0 ? -1 : 1), 30, K.night);
    return g;
  };
  return layFrames(S, frames(5, draw), [K.navy, K.night, K.dusk, K.mist, K.sand, K.white, K.green, K.teal, K.lime, K.wine], [160, 140, 140, 140, 300], true);
}

/* ---- Release week: the coast road, the night before. 64 × 48, eight frames: the road and
   the palms go by under a striped sun. Our own picture, nothing from the game. ---- */
const N = {
  night: "#1B1426", purple: "#3A1D5C", violet: "#6A2C82", magenta: "#B23A8E", pink: "#FF4F9A", coral: "#FF7A6A",
  orange: "#FF9E5A", gold: "#FFC24A", pale: "#FFF0A0", sea: "#2B2F6E", wave: "#4A5BB0", cyan: "#5FE3E8", road: "#241B33",
};
export function genCoastRoad(S: Sketch): Moving {
  const H = 26;
  const palm = (g: Grid, x: number) => {
    // a trunk leaning a little, then a crown of drooping fronds
    for (let r = 34; r >= 12; r--) {
      const c = x + Math.round(((34 - r) / 22) ** 2 * 3);
      set(g, c, r, N.night);
      if (r > 28) set(g, c + 1, r, N.night);
    }
    const top = [x + 3, 11];
    for (const [dx, lift, len] of [[-1, 1, 7], [1, 1, 7], [-1, -0.2, 5], [1, -0.2, 5], [0.3, 1.6, 3]] as const)
      for (let k = 0; k <= len; k++) {
        const c = top[0] + Math.round(dx * k), r = top[1] - Math.round(lift * k - 0.12 * k * k);
        set(g, c, r, N.night);
        if (k > 1 && k < len) set(g, c, r + 1, N.night);
      }
  };
  const draw = (f: number) => {
    const g = blank(64, 48, N.road);
    for (let r = 0; r < H; r++) for (let c = 0; c < 64; c++) set(g, c, r, bands(c, r, [[0, N.night], [5, N.purple], [11, N.violet], [17, N.magenta], [22, N.pink], [26, N.coral]]));
    // the sun, cut by the sky in thin stripes, sitting on the sea
    for (let r = H - 11; r < H; r++)
      for (let c = 0; c < 64; c++) {
        if (!inEllipse(c, r, 40, H, 10.5, 10.5) || [H - 5, H - 3, H - 1].includes(r)) continue;
        const t = (r - (H - 11)) / 11;
        set(g, c, r, t < 0.25 ? N.pale : t < 0.5 ? N.gold : t < 0.75 ? N.orange : N.pink);
      }
    // the sea, the sun's road on it shimmering
    for (let r = H; r < 34; r++)
      for (let c = 0; c < 64; c++) {
        const near = Math.abs(c + 0.5 - 40) < 9 - (r - H) * 0.6;
        const glint = r % 2 === 0 && (c + f + (r % 4)) % 4 < 2;
        set(g, c, r, near && glint ? (r < H + 3 ? N.pale : N.gold) : (c + r * 2 + f) % 7 === 0 ? N.wave : N.sea);
      }
    // the sea wall with its neon rail, and palms going by, three cells a frame
    for (let c = 0; c < 64; c++) {
      set(g, c, 34, N.pink);
      set(g, c, 35, N.magenta);
    }
    for (let p = 0; p < 3; p++) palm(g, ((p * 24 - f * 3 + 720) % 72) - 6);
    // the road, its edge line rushing past
    for (let r = 36; r < 48; r++) for (let c = 0; c < 64; c++) set(g, c, r, r === 36 ? N.night : N.road);
    for (let c = 0; c < 64; c++) if ((c + f * 3) % 8 < 4) set(g, c, 46, N.pale);
    // a convertible, side on, driving right: rear deck, the open seats, a long hood
    const top = (c: number) => (c < 12 ? 39 : c < 17 ? 40 : c < 25 ? 41 : c < 35 ? 40 : 41);
    for (let c = 10; c <= 36; c++)
      for (let r = top(c); r <= 43; r++) set(g, c, r, r === top(c) ? N.pink : r === 43 ? N.purple : N.violet);
    for (let r = 37; r <= 40; r++) set(g, 26 - Math.floor((r - 37) / 2), r, N.cyan);
    for (const [c, r] of [[20, 37], [21, 37], [20, 38], [21, 38], [21, 39], [20, 39], [21, 40], [18, 39], [18, 40]]) set(g, c, r, N.night);
    set(g, 10, 40, N.coral);
    set(g, 10, 41, N.pink);
    set(g, 36, 41, N.pale);
    for (let c = 11; c <= 35; c++) if (c % 2 === f % 2) set(g, c, 45, N.cyan);
    for (const wx of [14, 31]) {
      for (let r = 42; r <= 45; r++) for (let c = wx - 2; c <= wx + 1; c++) if (!((r === 42 || r === 45) && (c === wx - 2 || c === wx + 1))) set(g, c, r, N.night);
      const spin = [[0, 0], [-1, 0], [-1, 1], [0, 1]][f % 4];
      set(g, wx - 1 + spin[0] + 1, 43 + spin[1], N.pale);
    }
    return g;
  };
  return layFrames(S, frames(8, draw), [N.road, N.night, N.purple, N.violet, N.magenta, N.pink, N.coral, N.orange, N.gold, N.pale, N.sea, N.wave, N.cyan], 90);
}
