import { Painter } from "./painter";
import type { PaperId } from "./paper";
import { BASE_LAYER, pointsOf, type LayerDef, type Stroke } from "./stroke";

/** How much of a replay's running time a stroke takes. Background washes go by faster
    than line work, so replays reach the drawing sooner. */
export const strokeWeight = (s: Stroke) => Math.max(4, pointsOf(s)) * (s.tool === "wash" ? 0.4 : 1);

/* Draws a piece at any point of its recording. Finished strokes stay on the painter's
   layers, so playing forward only draws what is new; seeking backwards starts over. */
export class Replayer {
  private cum: number[] = [];
  private total = 1;
  private painter: Painter;
  private done = -1;
  constructor(
    private canvas: HTMLCanvasElement,
    private strokes: Stroke[],
    paper: PaperId | null = "smooth",
    sheetWidth = 1600,
    layers: LayerDef[] = [BASE_LAYER],
  ) {
    let t = 0;
    strokes.forEach((s) => {
      t += strokeWeight(s);
      this.cum.push(t);
    });
    this.total = t || 1;
    this.painter = new Painter(canvas.width, canvas.height, canvas.width / sheetWidth, layers.length ? layers : [BASE_LAYER], paper);
  }
  get strokeCount() {
    return this.strokes.length;
  }
  /** Draws the state at `pos` (0-1) and returns the index of the stroke being drawn. */
  draw(pos: number) {
    const target = Math.max(0, Math.min(1, pos)) * this.total;
    let idx = 0;
    while (idx < this.cum.length && this.cum[idx] <= target) idx++;
    if (idx - 1 < this.done) {
      this.painter.clear();
      this.done = -1;
    }
    for (let i = this.done + 1; i < idx; i++) this.painter.apply(this.strokes[i]);
    this.done = idx - 1;

    const ctx = this.canvas.getContext("2d")!;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    let live: { stroke: Stroke; upto: number } | undefined;
    if (idx < this.strokes.length) {
      const prev = idx ? this.cum[idx - 1] : 0;
      const s = this.strokes[idx];
      const upto = Math.floor(((target - prev) / (this.cum[idx] - prev)) * pointsOf(s));
      if (upto > 0 && s.tool !== "fill") live = { stroke: s, upto };
    }
    this.painter.render(ctx, live);
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
