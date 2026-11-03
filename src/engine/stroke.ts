import { drawBrush } from "./brushes";
import type { PaperId } from "./paper";
import { mirrored } from "./symmetry";

/* The stroke model shared by every tool.
   Points are flat triples [x, y, pressure 0-99] in the sheet's own units. A piece is its
   list of strokes in the order they were made, plus the final stack of layers they sit on. */
export type ToolId =
  | "pencil" | "ink" | "brushpen" | "charcoal"
  | "marker" | "wash" | "gouache" | "oil" | "spray"
  | "fill" | "lasso"
  | "smudge" | "eraser";

export interface Stroke {
  tool: ToolId;
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
}

export type Blend = "source-over" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "soft-light" | "color-burn";

export interface LayerDef {
  id: number;
  name: string;
  blend: Blend;
  opacity: number;
  hidden?: boolean;
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
  prompt?: number;
  remixOf?: string;
  stamps?: Record<string, number>;
  sample?: boolean;
  mine?: boolean;
  tilt?: number;
}

export const SHEET = { w: 1600, h: 1200 } as const;
export const BASE_LAYER: LayerDef = { id: 0, name: "Layer 1", blend: "source-over", opacity: 1 };
export const layersOf = (p: { layers?: LayerDef[] }) => (p.layers?.length ? p.layers : [BASE_LAYER]);

export type ToolGroup = "draw" | "paint" | "shape" | "fix";
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
  smudge: { label: "Smudge", key: "u", reach: 2, group: "fix" },
  eraser: { label: "Eraser", key: "e", reach: 2.2, group: "fix" },
};

/** Tools that change pixels already on the layer, so a live preview must work on a copy. */
export const READS_LAYER = new Set<ToolId>(["eraser", "smudge", "fill"]);

export const pointsOf = (s: Stroke) => (s.p.length / 3) | 0;

/** Draws one stroke, optionally only its first `upto` points (for replays). `k` scales
    sheet units to pixels. Symmetry is drawn as mirrored copies of the same stroke. */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, k = 1, upto?: number, paper: PaperId = "smooth") {
  const n = Math.min(upto ?? Infinity, pointsOf(s));
  if (n < 1) return;
  for (const copy of mirrored(s, SHEET.w, SHEET.h)) drawBrush(ctx, copy, k, n, paper);
}

export const PAPER_COLOR = "#FBFAF5";

export const toolsUsed = (strokes: Stroke[]) =>
  [...new Set(strokes.map((s) => s.tool))].map((t) => TOOLS[t]?.label.split(" ")[0].toLowerCase() ?? t);

export function paletteOf(strokes: Stroke[], max = 6) {
  const m = new Map<string, number>();
  strokes.forEach((s) => s.tool !== "eraser" && s.tool !== "smudge" && m.set(s.c, (m.get(s.c) || 0) + pointsOf(s)));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map((e) => e[0]);
}

export const fmtMin = (m: number) => {
  const s = Math.round(m * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
