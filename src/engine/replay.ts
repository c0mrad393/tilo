import { drawStroke, PAPER_COLOR, pointsOf, type Stroke } from "./stroke";

/** How much of a replay's running time a stroke takes. Background washes go by faster
    than line work, so replays reach the drawing sooner. */
export const strokeWeight = (s: Stroke) => Math.max(4, pointsOf(s)) * (s.tool === "wash" ? 0.4 : 1);

/* Draws a piece at any point of its recording. Finished strokes are cached on a layer,
   so playing forward only draws what is new; seeking backwards rebuilds the layer. */
export class Replayer {
  private cum: number[] = [];
  private total = 1;
  private layer: HTMLCanvasElement;
  private done = -1;
  private k: number;
  constructor(
    private canvas: HTMLCanvasElement,
    private strokes: Stroke[],
    private paper: string | null = PAPER_COLOR,
    sheetWidth = 1600,
  ) {
    let t = 0;
    strokes.forEach((s) => {
      t += strokeWeight(s);
      this.cum.push(t);
    });
    this.total = t || 1;
    this.layer = document.createElement("canvas");
    this.layer.width = canvas.width;
    this.layer.height = canvas.height;
    this.k = canvas.width / sheetWidth;
  }
  get strokeCount() {
    return this.strokes.length;
  }
  /** Draws the state at `pos` (0-1) and returns the index of the stroke being drawn. */
  draw(pos: number) {
    const target = Math.max(0, Math.min(1, pos)) * this.total;
    let idx = 0;
    while (idx < this.cum.length && this.cum[idx] <= target) idx++;
    const lc = this.layer.getContext("2d")!;
    if (idx - 1 < this.done) {
      lc.clearRect(0, 0, this.layer.width, this.layer.height);
      this.done = -1;
    }
    for (let i = this.done + 1; i < idx; i++) drawStroke(lc, this.strokes[i], this.k);
    this.done = idx - 1;

    const ctx = this.canvas.getContext("2d")!;
    if (this.paper) {
      ctx.fillStyle = this.paper;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (idx < this.strokes.length) {
      const prev = idx ? this.cum[idx - 1] : 0;
      const s = this.strokes[idx];
      const partial = Math.floor(((target - prev) / (this.cum[idx] - prev)) * pointsOf(s));
      if (partial > 0 && s.tool === "eraser") {
        const tmp = document.createElement("canvas");
        tmp.width = this.canvas.width;
        tmp.height = this.canvas.height;
        const t2 = tmp.getContext("2d")!;
        t2.drawImage(this.layer, 0, 0);
        drawStroke(t2, s, this.k, partial);
        ctx.drawImage(tmp, 0, 0);
      } else {
        ctx.drawImage(this.layer, 0, 0);
        if (partial > 0) drawStroke(ctx, s, this.k, partial);
      }
    } else ctx.drawImage(this.layer, 0, 0);
    return Math.min(idx, this.strokes.length - 1);
  }
}

export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Plays `fn(pos)` from 0 to 1 over `ms`. Returns a cancel function. */
export function play(ms: number, fn: (pos: number) => void, from = 0) {
  let raf = 0;
  let pos = from;
  let last = performance.now();
  const tick = (now: number) => {
    pos = Math.min(1, pos + (now - last) / ms);
    last = now;
    fn(pos);
    if (pos < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
