import { frameAt, isAnimated, loopMs, type Anim } from "./frames";
import { Painter } from "./painter";
import type { PaperId } from "./paper";
import { BASE_LAYER, pointsOf, type LayerDef, type Stroke } from "./stroke";

/** How much of a replay's running time a stroke takes. Background washes go by faster
    than line work, so replays reach the drawing sooner. */
export const strokeWeight = (s: Stroke) =>
  s.tool === "dup" || s.tool === "merge" ? 6 : s.tool === "move" ? 40 : Math.max(4, pointsOf(s)) * (s.tool === "wash" ? 0.4 : 1);

/* Draws a piece at any point of its recording. Finished strokes stay on the painter's
   layers, so playing forward only draws what is new; seeking backwards starts over.
   Given the sheet's height too, a sheet of another shape is fitted and centred in the canvas.
   An animation (`anim` with two frames or more) shows each stroke on the frame it was drawn
   on, and `loop(t)` then plays its frames. A pixel animation (`grid` given) paints at one
   pixel per cell and is scaled up with the cells kept sharp, so many frames stay light. */
export class Replayer {
  private cum: number[] = [];
  private total = 1;
  private painter: Painter;
  private done = -1;
  private at: [number, number] = [0, 0];
  private size: [number, number];
  /** a small painter's picture before it is scaled up */
  private flat: HTMLCanvasElement | null = null;
  private anim: Anim | null;
  constructor(
    private canvas: HTMLCanvasElement,
    private strokes: Stroke[],
    paper: PaperId | null = "smooth",
    sheetWidth = 1600,
    layers: LayerDef[] = [BASE_LAYER],
    sheetHeight?: number,
    opts: { anim?: Anim | null; grid?: number } = {},
  ) {
    let t = 0;
    strokes.forEach((s) => {
      t += strokeWeight(s);
      this.cum.push(t);
    });
    this.total = t || 1;
    let k = canvas.width / sheetWidth, w = canvas.width, h = canvas.height;
    if (sheetHeight) {
      k = Math.min(canvas.width / sheetWidth, canvas.height / sheetHeight);
      w = Math.round(sheetWidth * k);
      h = Math.round(sheetHeight * k);
      this.at = [Math.round((canvas.width - w) / 2), Math.round((canvas.height - h) / 2)];
    }
    this.size = [w, h];
    this.anim = opts.anim && isAnimated({ anim: opts.anim }) ? opts.anim : null;
    const ls = layers.length ? layers : [BASE_LAYER];
    if (this.anim && opts.grid) {
      const cols = Math.round(opts.grid), rows = Math.max(1, Math.round(((sheetHeight ?? (sheetWidth * canvas.height) / canvas.width) * cols) / sheetWidth));
      this.painter = new Painter(cols, rows, cols / sheetWidth, ls, paper);
      this.flat = document.createElement("canvas");
      this.flat.width = cols;
      this.flat.height = rows;
    } else this.painter = new Painter(w, h, k, ls, paper);
    if (this.anim) this.painter.frame = strokes.length ? this.painter.frameOf(strokes[0]) : this.anim.frames[0]?.id;
  }
  get strokeCount() {
    return this.strokes.length;
  }
  /** whether the piece has a loop to play after its strokes */
  get animated() {
    return !!this.anim;
  }
  /** the loop's length once round, in ms (0 for a still) */
  get loopMs() {
    return this.anim ? loopMs(this.anim) : 0;
  }
  /** Draws the state at `pos` (0-1) and returns the index of the stroke being drawn. */
  draw(pos: number) {
    const target = Math.max(0, Math.min(1, pos)) * this.total;
    let idx = 0;
    while (idx < this.cum.length && this.cum[idx] <= target) idx++;
    this.upTo(idx);

    let live: { stroke: Stroke; upto: number } | undefined;
    if (idx < this.strokes.length) {
      const prev = idx ? this.cum[idx - 1] : 0;
      const s = this.strokes[idx];
      const upto = Math.floor(((target - prev) / (this.cum[idx] - prev)) * pointsOf(s));
      // a move plays out over its share of the time; fills and layer copies land at once
      if (upto > 0 && s.tool !== "fill" && s.tool !== "dup" && s.tool !== "merge") live = { stroke: s, upto };
    }
    // an animation shows the frame the artist was drawing on
    if (this.anim && this.strokes.length) this.painter.frame = this.painter.frameOf(this.strokes[Math.min(idx, this.strokes.length - 1)]);
    this.show(live);
    return Math.min(idx, this.strokes.length - 1);
  }
  /** Draws the finished piece's frame `t` ms into its loop and returns that frame's id. */
  loop(t: number) {
    this.upTo(this.strokes.length);
    const f = this.anim ? frameAt(this.anim, t) : undefined;
    if (f) this.painter.frame = f.id;
    this.show();
    return f?.id;
  }
  /** applies every stroke before `idx`, starting over when that means going back */
  private upTo(idx: number) {
    if (idx - 1 < this.done) {
      this.painter.clear();
      this.done = -1;
    }
    for (let i = this.done + 1; i < idx; i++) this.painter.apply(this.strokes[i]);
    this.done = idx - 1;
  }
  private show(live?: { stroke: Stroke; upto: number }) {
    const ctx = this.canvas.getContext("2d")!;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.flat) {
      const f = this.flat.getContext("2d")!;
      f.clearRect(0, 0, this.flat.width, this.flat.height);
      this.painter.render(f, live);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.flat, this.at[0], this.at[1], this.size[0], this.size[1]);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(...this.at);
    this.painter.render(ctx, live);
    ctx.restore();
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
