import { drawBrush } from "./brushes";
import type { PaperId } from "./paper";
import { drawPixels, isPixelTool } from "./pixel";
import { mirrored } from "./symmetry";

/* The stroke model shared by every tool.
   Points are flat triples [x, y, pressure 0-99] in the sheet's own units. A piece is its
   list of strokes in the order they were made, plus the final stack of layers they sit on. */
export type ToolId =
  | "pencil" | "ink" | "brushpen" | "charcoal"
  | "marker" | "wash" | "gouache" | "oil" | "spray"
  | "fill" | "lasso" | "select"
  | "smudge" | "eraser"
  | "pixel" | "pixelerase" | "pixelfill";

/** Recorded actions that aren't drawn with a brush: moving a selection, duplicating a layer,
    merging one layer into another. They sit in the stroke list so a replay repeats them. */
export type OpId = "move" | "dup" | "merge";

export interface Stroke {
  tool: ToolId | OpId;
  c: string;
  w: number;
  p: number[];
  /** time the stroke ended (ms since epoch), when known */
  t?: number;
  /** layer id; missing means the bottom layer */
  l?: number;
  /** opacity 0-1 on top of the tool's own; missing means 1 */
  a?: number;
  /** symmetry: "v" mirror left-right, "h" top-bottom, "vh" both, "r6"/"r8" radial */
  m?: string;
  /** seed for tools with grain or spray, so a replay lays down the same marks */
  r?: number;
  /** pen tilt per point, pairs of [azimuth 0-359, altitude 0-90] in degrees; only from a pen */
  tl?: number[];
  /** move: the transform, [pivot x, pivot y, scale x, scale y, turn in radians, shift x, shift y];
      the points are the outline of what was selected */
  x?: number[];
  /** dup and merge: the layer read from (the stroke's own layer is the one written to) */
  src?: number;
  /** pixel tools: how many cells across the sheet, so the stroke knows its grid */
  g?: number;
}

export const isOp = (s: Stroke) => s.tool === "move" || s.tool === "dup" || s.tool === "merge";
/** How many strokes were drawn, leaving out layer actions. */
export const drawnCount = (strokes: Stroke[]) => strokes.reduce((n, s) => n + (isOp(s) ? 0 : 1), 0);

export type Blend = "source-over" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "soft-light" | "color-burn";

export interface LayerDef {
  id: number;
  name: string;
  blend: Blend;
  opacity: number;
  hidden?: boolean;
  /** merged into another layer: kept so the recording replays, but never shown */
  gone?: boolean;
}

export interface Piece {
  id: string;
  title: string;
  by: string;
  minutes: number;
  strokes: Stroke[];
  /** bottom to top; missing means one plain layer with id 0 */
  layers?: LayerDef[];
  /** missing means smooth cartridge */
  paper?: PaperId;
  /** missing means landscape */
  shape?: ShapeId;
  prompt?: number;
  remixOf?: string;
  stamps?: Record<string, number>;
  sample?: boolean;
  /** drawn by an AI, not a hand; shown on the piece wherever it appears */
  ai?: boolean;
  mine?: boolean;
  tilt?: number;
}

export type ShapeId = "land" | "port" | "square" | "px16" | "px32" | "px64" | "px128" | "pxland";
export interface SheetSize {
  w: number;
  h: number;
}
/** A sheet shape. Pixel sheets have `grid`, their cells across; every one is 1280 across. */
export const SHAPES: Record<ShapeId, SheetSize & { name: string; grid?: number }> = {
  land: { w: 1600, h: 1200, name: "Landscape" },
  port: { w: 1200, h: 1600, name: "Portrait" },
  square: { w: 1400, h: 1400, name: "Square" },
  px16: { w: 1280, h: 1280, name: "16 × 16", grid: 16 },
  px32: { w: 1280, h: 1280, name: "32 × 32", grid: 32 },
  px64: { w: 1280, h: 1280, name: "64 × 64", grid: 64 },
  px128: { w: 1280, h: 1280, name: "128 × 128", grid: 128 },
  pxland: { w: 1280, h: 960, name: "64 × 48", grid: 64 },
};
export const SHAPE_IDS = Object.keys(SHAPES) as ShapeId[];
export const DRAW_SHAPES: ShapeId[] = ["land", "port", "square"];
export const PIXEL_SHAPES: ShapeId[] = ["px16", "px32", "px64", "px128", "pxland"];
export const isPixelShape = (shape?: ShapeId) => !!shape && !!SHAPES[shape]?.grid;
export const sizeOf = (p: { shape?: ShapeId }) => SHAPES[p.shape ?? "land"] ?? SHAPES.land;
/** The landscape sheet, which every piece used before shapes existed. */
export const SHEET: SheetSize = SHAPES.land;
export const BASE_LAYER: LayerDef = { id: 0, name: "Layer 1", blend: "source-over", opacity: 1 };
export const layersOf = (p: { layers?: LayerDef[] }) => (p.layers?.length ? p.layers : [BASE_LAYER]);

export type ToolGroup = "draw" | "paint" | "shape" | "fix" | "pixel";
export const TOOLS: Record<ToolId, { label: string; key: string; reach: number; group: ToolGroup }> = {
  pencil: { label: "Pencil", key: "p", reach: 0.5, group: "draw" },
  ink: { label: "Ink pen", key: "i", reach: 1, group: "draw" },
  brushpen: { label: "Brush pen", key: "b", reach: 1.3, group: "draw" },
  charcoal: { label: "Charcoal", key: "c", reach: 1.1, group: "draw" },
  marker: { label: "Marker", key: "m", reach: 1.8, group: "paint" },
  wash: { label: "Watercolour wash", key: "w", reach: 3.2, group: "paint" },
  gouache: { label: "Gouache", key: "g", reach: 1.6, group: "paint" },
  oil: { label: "Oil", key: "o", reach: 1.4, group: "paint" },
  spray: { label: "Spray", key: "s", reach: 3.2, group: "paint" },
  fill: { label: "Fill", key: "f", reach: 0, group: "shape" },
  lasso: { label: "Lasso fill", key: "l", reach: 0, group: "shape" },
  select: { label: "Select and move", key: "v", reach: 0, group: "shape" },
  smudge: { label: "Smudge", key: "u", reach: 2, group: "fix" },
  eraser: { label: "Eraser", key: "e", reach: 2.2, group: "fix" },
  // pixel sheets have only these, so their keys can repeat the drawing tools'
  pixel: { label: "Pixel pen", key: "p", reach: 0, group: "pixel" },
  pixelerase: { label: "Pixel eraser", key: "e", reach: 0, group: "pixel" },
  pixelfill: { label: "Pixel fill", key: "f", reach: 0, group: "pixel" },
};

/** Tools that change pixels already on the layer, so a live preview must work on a copy. */
export const READS_LAYER = new Set<ToolId>(["eraser", "smudge", "fill", "pixelerase", "pixelfill"]);

export const pointsOf = (s: Stroke) => (s.p.length / 3) | 0;

/** Draws one stroke, optionally only its first `upto` points (for replays). `k` scales
    sheet units to pixels. Symmetry is drawn as mirrored copies of the same stroke. */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, k = 1, upto?: number, paper: PaperId = "smooth", sheet: SheetSize = SHEET) {
  const n = Math.min(upto ?? Infinity, pointsOf(s));
  if (n < 1 || isOp(s)) return;
  // pixel strokes mirror cell by cell, so a cell on the middle line is painted once
  if (isPixelTool(s.tool)) return drawPixels(ctx, s, k, n, sheet);
  for (const copy of mirrored(s, sheet.w, sheet.h)) drawBrush(ctx, copy, k, n, paper);
}

export const PAPER_COLOR = "#FBFAF5";

export const toolsUsed = (strokes: Stroke[]) => [
  ...new Set(strokes.filter((s) => !isOp(s)).map((s) => (isPixelTool(s.tool) ? "pixel" : TOOLS[s.tool as ToolId]?.label.split(" ")[0].toLowerCase() ?? s.tool))),
];

export function paletteOf(strokes: Stroke[], max = 6) {
  const m = new Map<string, number>();
  strokes.forEach((s) => s.tool !== "eraser" && s.tool !== "smudge" && s.tool !== "pixelerase" && !isOp(s) && m.set(s.c, (m.get(s.c) || 0) + pointsOf(s)));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map((e) => e[0]);
}

export const fmtMin = (m: number) => {
  const s = Math.round(m * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
