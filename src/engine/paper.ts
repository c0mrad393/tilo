/* Papers. Each has a colour and a tooth: a tileable height map in sheet units. The same map
   shades the sheet and decides where dry media (charcoal, pencil) skip, so the grain you see
   is the grain that catches the charcoal. */

export type PaperId = "smooth" | "cold" | "newsprint" | "kraft" | "grey" | "black" | "plain" | "plaindark";

export interface PaperDef {
  name: string;
  color: string;
  /** how strongly the tooth shades the sheet, 0-1 */
  depth: number;
  /** tooth below this value is a pit that dry media skip */
  pits: number;
  /** noise octaves as [cell size in sheet units, weight] */
  octaves: [number, number][];
  seed: number;
}

export const PAPERS: Record<PaperId, PaperDef> = {
  smooth: { name: "Smooth cartridge", color: "#FBFAF5", depth: 0.05, pits: 0.3, octaves: [[2.4, 1]], seed: 3 },
  cold: { name: "Cold-press", color: "#FAF6EC", depth: 0.16, pits: 0.42, octaves: [[16, 0.5], [5, 0.3], [2, 0.2]], seed: 11 },
  newsprint: { name: "Newsprint", color: "#EEE7D7", depth: 0.09, pits: 0.34, octaves: [[40, 0.2], [3, 0.5], [1.5, 0.3]], seed: 5 },
  kraft: { name: "Kraft", color: "#C8A57A", depth: 0.14, pits: 0.4, octaves: [[24, 0.35], [6, 0.3], [2, 0.35]], seed: 17 },
  grey: { name: "Toned grey", color: "#9C9E9B", depth: 0.1, pits: 0.36, octaves: [[10, 0.4], [3, 0.6]], seed: 23 },
  black: { name: "Black card", color: "#232224", depth: 0.08, pits: 0.36, octaves: [[8, 0.4], [2.5, 0.6]], seed: 29 },
  // no grain at all: for pixel art, and for anyone who wants a flat sheet
  plain: { name: "Plain white", color: "#FFFFFF", depth: 0, pits: 0, octaves: [[2.4, 1]], seed: 31 },
  plaindark: { name: "Plain dark", color: "#1B1B1F", depth: 0, pits: 0, octaves: [[2.4, 1]], seed: 37 },
};
/** papers with no grain, the only ones a pixel sheet takes */
export const PLAIN_PAPERS: PaperId[] = ["plain", "plaindark"];
export const PAPER_IDS = Object.keys(PAPERS) as PaperId[];
export const paperOf = (id?: string | null): PaperId => (id && id in PAPERS ? (id as PaperId) : "smooth");

const TILE = 256; // the tooth repeats every 256 sheet units

function hash(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const tooths = new Map<PaperId, Float32Array>();
/** The paper's tooth, TILE × TILE values in 0-1. */
function toothMap(id: PaperId) {
  let t = tooths.get(id);
  if (t) return t;
  const def = PAPERS[id];
  t = new Float32Array(TILE * TILE);
  for (const [cell, weight] of def.octaves) {
    // value noise on a lattice that divides the tile, so it wraps without a seam
    const n = Math.max(1, Math.round(TILE / cell));
    const step = TILE / n;
    const sm = (v: number) => v * v * (3 - 2 * v);
    for (let y = 0; y < TILE; y++) {
      const gy = y / step, y0 = Math.floor(gy), fy = sm(gy - y0);
      for (let x = 0; x < TILE; x++) {
        const gx = x / step, x0 = Math.floor(gx), fx = sm(gx - x0);
        const a = hash(x0 % n, y0 % n, def.seed), b = hash((x0 + 1) % n, y0 % n, def.seed);
        const c = hash(x0 % n, (y0 + 1) % n, def.seed), d = hash((x0 + 1) % n, (y0 + 1) % n, def.seed);
        t[y * TILE + x] += weight * (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy);
      }
    }
  }
  tooths.set(id, t);
  return t;
}

/** Tooth height at a point in sheet units. */
export function toothAt(id: PaperId, x: number, y: number) {
  const t = toothMap(id);
  const ix = ((Math.floor(x) % TILE) + TILE) % TILE, iy = ((Math.floor(y) % TILE) + TILE) % TILE;
  return t[iy * TILE + ix];
}

const tiles = new Map<PaperId, HTMLCanvasElement>();
/* the tooth as a grey tile for multiplying over the sheet: white on the peaks, darker in the pits */
function shadeTile(id: PaperId) {
  let c = tiles.get(id);
  if (c) return c;
  const t = toothMap(id), depth = PAPERS[id].depth;
  c = document.createElement("canvas");
  c.width = c.height = TILE;
  const img = new ImageData(TILE, TILE);
  for (let i = 0; i < t.length; i++) {
    const v = Math.round(255 * (1 - depth * (1 - t[i]) * 1.6));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.max(0, Math.min(255, v));
    img.data[i * 4 + 3] = 255;
  }
  c.getContext("2d")!.putImageData(img, 0, 0);
  tiles.set(id, c);
  return c;
}

/** Shades whatever is already in `rect` of `ctx` with the paper's grain. `k` is pixels per sheet unit. */
export function shadeGrain(ctx: CanvasRenderingContext2D, id: PaperId, k: number, w: number, h: number) {
  if (!PAPERS[id]?.depth) return;
  const pat = ctx.createPattern(shadeTile(id), "repeat");
  if (!pat) return;
  pat.setTransform(new DOMMatrix().scale(k));
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
