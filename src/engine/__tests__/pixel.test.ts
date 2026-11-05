import { describe, expect, it } from "vitest";
import { cellAt, cellsOf, fillCells, gridOf, paintCells } from "../pixel";
import type { Stroke } from "../stroke";

const SHEET = { w: 1280, h: 1280 };
const on = (mask: Uint8Array, cols: number) => [...mask].flatMap((v, i) => (v ? [[i % cols, (i / cols) | 0]] : []));
const pen = (p: number[], extra: Partial<Stroke> = {}): Stroke => ({ tool: "pixel", c: "#000000", w: 40, p, g: 32, ...extra });

describe("pixel grid", () => {
  it("splits the sheet into square cells", () => {
    expect(gridOf(32, SHEET)).toEqual({ cols: 32, rows: 32, cell: 40 });
    expect(gridOf(64, { w: 1280, h: 960 })).toEqual({ cols: 64, rows: 48, cell: 20 });
  });

  it("keeps points off the sheet on its edge cells", () => {
    const g = gridOf(16, SHEET);
    expect(cellAt(g, -5, 2000)).toEqual([0, 15]);
    expect(cellAt(g, 79.9, 80)).toEqual([0, 1]);
  });
});

describe("pixel strokes", () => {
  it("fills the cells on the line between two points, with no gaps", () => {
    const { mask } = cellsOf(pen([20, 20, 50, 220, 100, 50]), SHEET);
    // from cell (0,0) to (5,2): one cell per column
    expect(on(mask, 32)).toEqual([[0, 0], [1, 0], [2, 1], [3, 1], [4, 2], [5, 2]]);
  });

  it("mirrors cell by cell, so the copy lands on the matching cell", () => {
    const { mask } = cellsOf(pen([20, 20, 50], { m: "vh" }), SHEET);
    expect(on(mask, 32)).toEqual([[0, 0], [31, 0], [0, 31], [31, 31]]);
  });

  it("draws a wider brush as a square of cells", () => {
    const { mask } = cellsOf(pen([100, 100, 50], { w: 80 }), SHEET);
    expect(on(mask, 32)).toEqual([[2, 2], [3, 2], [2, 3], [3, 3]]);
  });

  it("paints runs with edges on whole pixels, so cells never leave a seam", () => {
    const rects: number[][] = [];
    const ctx = { fillRect: (...r: number[]) => rects.push(r) } as unknown as CanvasRenderingContext2D;
    const { grid, mask } = cellsOf(pen([20, 20, 50, 100, 20, 50]), SHEET);
    paintCells(ctx, grid, mask, 0.37);
    expect(rects).toEqual([[0, 0, 44, 15]]);
    const r2: number[][] = [];
    const m2 = new Uint8Array(32 * 32);
    m2[0] = m2[2] = 1;
    paintCells({ fillRect: (...r: number[]) => r2.push(r) } as unknown as CanvasRenderingContext2D, grid, m2, 0.37);
    // two cells one apart: the second starts where the empty one ends
    expect(r2.map((r) => r[0] + r[2])).toEqual([15, 44]);
    expect(r2[1][0]).toBe(30);
  });
});

describe("pixel fill", () => {
  // a 4 × 4 grid at one pixel a cell: a wall down column 2
  const sample = (() => {
    const data = new Uint8ClampedArray(4 * 4 * 4).fill(255);
    for (let r = 0; r < 4; r++) data.set([0, 0, 0, 255], (r * 4 + 2) * 4);
    return { width: 4, height: 4, data };
  })();
  const sheet = { w: 4, h: 4 };
  const fill = (p: number[], extra: Partial<Stroke> = {}): Stroke => ({ tool: "pixelfill", c: "#FF0000", w: 1, p, g: 4, ...extra });

  it("fills the cells joined to the one clicked that share its colour", () => {
    const { mask } = fillCells(fill([0.5, 0.5, 50]), sheet, sample, 1);
    expect(on(mask, 4)).toEqual([[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2], [0, 3], [1, 3]]);
  });

  it("fills from the mirrored cell too", () => {
    const { mask } = fillCells(fill([0.5, 0.5, 50], { m: "v" }), sheet, sample, 1);
    expect(on(mask, 4).length).toBe(12);
  });
});
