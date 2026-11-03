/* The stroke model shared by every tool.
   Points are flat triples [x, y, pressure 0-99] in the sheet's own units. */
export type ToolId = "pencil" | "ink" | "marker" | "wash" | "eraser";

export interface Stroke {
  tool: ToolId;
  c: string;
  w: number;
  p: number[];
  t?: number;
}

export interface Piece {
  id: string;
  title: string;
  by: string;
  minutes: number;
  strokes: Stroke[];
  prompt?: number;
  remixOf?: string;
  stamps?: Record<string, number>;
  sample?: boolean;
  mine?: boolean;
  tilt?: number;
}

export const SHEET = { w: 1600, h: 1200 } as const;

export const TOOLS: Record<ToolId, { label: string; key: string; reach: number }> = {
  pencil: { label: "Pencil", key: "p", reach: 0.5 },
  ink: { label: "Ink pen", key: "i", reach: 1 },
  marker: { label: "Marker", key: "m", reach: 1.8 },
  wash: { label: "Watercolour wash", key: "w", reach: 3.2 },
  eraser: { label: "Eraser", key: "e", reach: 2.2 },
};

export const pointsOf = (s: Stroke) => (s.p.length / 3) | 0;

/** Draws one stroke, optionally only its first `upto` points (for replays). `k` scales sheet units to pixels. */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, k = 1, upto?: number) {
  const p = s.p;
  const n = Math.min(upto ?? Infinity, pointsOf(s));
  if (n < 1) return;
  const X = (i: number) => p[i * 3] * k;
  const Y = (i: number) => p[i * 3 + 1] * k;
  const P = (i: number) => p[i * 3 + 2] / 99;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    if (n === 1) {
      ctx.lineTo(X(0) + 0.01, Y(0));
      return;
    }
    for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
    ctx.lineTo(X(n - 1), Y(n - 1));
  };
  const w = s.w * k;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = s.c;
  switch (s.tool) {
    case "pencil":
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = Math.max(0.7, w * 0.5);
      path();
      ctx.stroke();
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = Math.max(0.5, w * 0.3);
      ctx.translate(0.9 * k, -0.7 * k);
      path();
      ctx.stroke();
      break;
    case "ink": {
      const width = (i: number) => Math.max(0.7, w * (0.3 + 0.95 * P(i)));
      if (n < 3) {
        ctx.lineWidth = width(0);
        path();
        ctx.stroke();
        break;
      }
      let px = X(0);
      let py = Y(0);
      for (let i = 1; i < n - 1; i++) {
        const mx = (X(i) + X(i + 1)) / 2;
        const my = (Y(i) + Y(i + 1)) / 2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(X(i), Y(i), mx, my);
        ctx.lineWidth = width(i);
        ctx.stroke();
        px = mx;
        py = my;
      }
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(X(n - 1), Y(n - 1));
      ctx.lineWidth = width(n - 1);
      ctx.stroke();
      break;
    }
    case "marker":
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = w * 1.8;
      path();
      ctx.stroke();
      break;
    case "wash":
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = w * 3.2;
      ctx.shadowColor = s.c;
      ctx.shadowBlur = w * 1.3;
      path();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.13;
      ctx.lineWidth = w * 1.9;
      path();
      ctx.stroke();
      break;
    case "eraser":
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = w * 2.2;
      path();
      ctx.stroke();
      break;
  }
  ctx.restore();
}

export const PAPER_COLOR = "#FBFAF5";

/** Renders a whole piece onto a canvas sized to any 4:3 box. */
export function renderPiece(canvas: HTMLCanvasElement, strokes: Stroke[]) {
  const ctx = canvas.getContext("2d")!;
  const k = canvas.width / SHEET.w;
  const layer = document.createElement("canvas");
  layer.width = canvas.width;
  layer.height = canvas.height;
  const lc = layer.getContext("2d")!;
  strokes.forEach((s) => drawStroke(lc, s, k));
  ctx.fillStyle = PAPER_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(layer, 0, 0);
}

export const toolsUsed = (strokes: Stroke[]) =>
  [...new Set(strokes.map((s) => s.tool))].map((t) => TOOLS[t].label.split(" ")[0].toLowerCase());

export function paletteOf(strokes: Stroke[], max = 6) {
  const m = new Map<string, number>();
  strokes.forEach((s) => s.tool !== "eraser" && m.set(s.c, (m.get(s.c) || 0) + pointsOf(s)));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map((e) => e[0]);
}

export const fmtMin = (m: number) => {
  const s = Math.round(m * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
