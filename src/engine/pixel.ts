import type { SheetSize, Stroke } from "./stroke";

/* Pixel tools. A pixel sheet is split into square cells, `g` across; a pixel stroke stores
   the centres of the cells it passed through and `g`, so it draws the same on any sheet
   size. Between two points the cells on the straight line are filled (Bresenham), so a fast
   stroke has no gaps. Cells are painted as rectangles with edges on whole pixels, so cells
   side by side never leave a seam. */

export const PIXEL_TOOLS = new Set(["pixel", "pixelerase", "pixelfill"]);
export const isPixelTool = (tool: string) => PIXEL_TOOLS.has(tool);

export interface Grid {
  cols: number;
  rows: number;
  /** a cell's side in sheet units */
  cell: number;
}
export const gridOf = (g: number, sheet: SheetSize): Grid => {
  const cols = Math.max(1, Math.round(g)), cell = sheet.w / cols;
  return { cols, rows: Math.max(1, Math.round(sheet.h / cell)), cell };
};

/** The cell a point in sheet units falls in, kept on the sheet. */
export function cellAt(grid: Grid, x: number, y: number): [number, number] {
  return [Math.max(0, Math.min(grid.cols - 1, Math.floor(x / grid.cell))), Math.max(0, Math.min(grid.rows - 1, Math.floor(y / grid.cell)))];
}
/** The centre of a cell, in sheet units. */
export const centreOf = (grid: Grid, col: number, row: number): [number, number] => [(col + 0.5) * grid.cell, (row + 0.5) * grid.cell];

/** The brush's width in cells, from the stroke's width in sheet units. */
export const brushCells = (s: Stroke, grid: Grid) => Math.max(1, Math.min(8, Math.round(s.w / grid.cell)));

/** Every cell a stroke covers (its first `n` points), mirrored, as a mask of cols × rows. */
export function cellsOf(s: Stroke, sheet: SheetSize, n = (s.p.length / 3) | 0): { grid: Grid; mask: Uint8Array } {
  const grid = gridOf(s.g ?? 32, sheet);
  const { cols, rows } = grid;
  const mask = new Uint8Array(cols * rows);
  const b = brushCells(s, grid), off = (b - 1) >> 1;
  const v = !!s.m?.includes("v"), h = !!s.m?.includes("h");
  const set = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    mask[r * cols + c] = 1;
    if (v) mask[r * cols + cols - 1 - c] = 1;
    if (h) mask[(rows - 1 - r) * cols + c] = 1;
    if (v && h) mask[(rows - 1 - r) * cols + cols - 1 - c] = 1;
  };
  const dab = (c: number, r: number) => {
    for (let dy = 0; dy < b; dy++) for (let dx = 0; dx < b; dx++) set(c - off + dx, r - off + dy);
  };
  let [pc, pr] = cellAt(grid, s.p[0], s.p[1]);
  dab(pc, pr);
  for (let i = 1; i < n; i++) {
    const [c1, r1] = cellAt(grid, s.p[i * 3], s.p[i * 3 + 1]);
    // Bresenham from the cell before to this one
    const dx = Math.abs(c1 - pc), dy = -Math.abs(r1 - pr), sx = pc < c1 ? 1 : -1, sy = pr < r1 ? 1 : -1;
    let err = dx + dy, c = pc, r = pr;
    while (c !== c1 || r !== r1) {
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        c += sx;
      }
      if (e2 <= dx) {
        err += dx;
        r += sy;
      }
      dab(c, r);
    }
    pc = c1;
    pr = r1;
  }
  return { grid, mask };
}

/** Paints the cells set in `mask`, a run of cells in a row at a time. */
export function paintCells(ctx: CanvasRenderingContext2D, grid: Grid, mask: Uint8Array, k: number) {
  const { cols, rows, cell } = grid;
  const edge = (i: number) => Math.round(i * cell * k);
  for (let r = 0; r < rows; r++) {
    const y0 = edge(r), y1 = edge(r + 1);
    for (let c = 0; c < cols; c++) {
      if (!mask[r * cols + c]) continue;
      const start = c;
      while (c + 1 < cols && mask[r * cols + c + 1]) c++;
      const x0 = edge(start);
      ctx.fillRect(x0, y0, edge(c + 1) - x0, y1 - y0);
    }
  }
}

/** Draws a pixel pen or eraser stroke, its first `n` points. */
export function drawPixels(ctx: CanvasRenderingContext2D, s: Stroke, k: number, n: number, sheet: SheetSize) {
  if (n < 1 || s.tool === "pixelfill") return;
  const { grid, mask } = cellsOf(s, sheet, n);
  ctx.save();
  ctx.globalAlpha = s.a ?? 1;
  ctx.fillStyle = s.c;
  if (s.tool === "pixelerase") ctx.globalCompositeOperation = "destination-out";
  paintCells(ctx, grid, mask, k);
  ctx.restore();
}

/** The cells joined to the clicked one that have its colour, read at cell centres from
    `sample` (the visible layers on white, at `k` pixels per sheet unit), and mirrored. */
export function fillCells(s: Stroke, sheet: SheetSize, sample: { width: number; height: number; data: Uint8ClampedArray }, k: number) {
  const grid = gridOf(s.g ?? 32, sheet);
  const { cols, rows } = grid;
  const W = sample.width, H = sample.height, d = sample.data;
  const colour = (c: number, r: number) => {
    const [x, y] = centreOf(grid, c, r);
    const px = Math.min(W - 1, Math.floor(x * k)), py = Math.min(H - 1, Math.floor(y * k));
    return py * W + px;
  };
  const mask = new Uint8Array(cols * rows);
  const seeds: [number, number][] = [];
  const [c0, r0] = cellAt(grid, s.p[0], s.p[1]);
  const v = !!s.m?.includes("v"), h = !!s.m?.includes("h");
  seeds.push([c0, r0]);
  if (v) seeds.push([cols - 1 - c0, r0]);
  if (h) seeds.push([c0, rows - 1 - r0]);
  if (v && h) seeds.push([cols - 1 - c0, rows - 1 - r0]);
  for (const [sc, sr] of seeds) {
    if (mask[sr * cols + sc]) continue;
    const j0 = colour(sc, sr) * 4;
    const same = (i: number) => {
      const j = colour(i % cols, (i / cols) | 0) * 4;
      return Math.abs(d[j] - d[j0]) + Math.abs(d[j + 1] - d[j0 + 1]) + Math.abs(d[j + 2] - d[j0 + 2]) + Math.abs(d[j + 3] - d[j0 + 3]) <= 12;
    };
    const seen = new Uint8Array(cols * rows);
    const stack = [sr * cols + sc];
    seen[stack[0]] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      mask[i] = 1;
      const c = i % cols, r = (i / cols) | 0;
      const next = [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1];
      for (const j of next) {
        if (j < 0 || seen[j]) continue;
        seen[j] = 1;
        if (same(j)) stack.push(j);
      }
    }
  }
  return { grid, mask };
}
