import { floodFill } from "./brushes";
import { PAPERS, shadeGrain, type PaperId } from "./paper";
import { fillCells, paintCells } from "./pixel";
import { fromArr, partway, setOn } from "./select";
import { mirrored } from "./symmetry";
import { drawStroke, pointsOf, type LayerDef, type SheetSize, type Stroke } from "./stroke";

/* Holds one canvas per layer at a fixed pixel size and composites them, bottom to top, with
   each layer's blend mode and opacity. `k` is pixels per sheet unit. The studio and every
   replay draw through a Painter, so what you see while drawing is what a replay shows.
   `paper` null leaves the sheet transparent, for drawings that sit on another surface. */
export class Painter {
  private canvases = new Map<number, HTMLCanvasElement>();
  private work: HTMLCanvasElement;
  private sample: HTMLCanvasElement | null = null;
  private lift: HTMLCanvasElement | null = null;
  layers: LayerDef[];

  paper: PaperId | null;
  /** with frames: the one frame shown; unset shows every layer, as on a still */
  frame?: number;

  constructor(readonly width: number, readonly height: number, readonly k: number, layers: LayerDef[], paper: PaperId | null = "smooth") {
    this.layers = layers;
    this.paper = paper;
    this.work = this.blank();
    layers.forEach((l) => this.canvas(l.id));
  }

  /** The sheet's size in sheet units. */
  get sheet(): SheetSize {
    return { w: this.width / this.k, h: this.height / this.k };
  }

  private blank() {
    const c = document.createElement("canvas");
    c.width = this.width;
    c.height = this.height;
    return c;
  }

  canvas(id: number) {
    let c = this.canvases.get(id);
    if (!c) this.canvases.set(id, (c = this.blank()));
    return c;
  }

  /** The frame a stroke's layer is on. A still's layers are all on frame 0. */
  frameOf(s: Stroke) {
    const id = this.layerOf(s);
    return this.layers.find((l) => l.id === id)?.f ?? 0;
  }

  /** The layer a stroke belongs on: its own (missing means layer 0) if it still exists,
      otherwise the bottom one. */
  layerOf(s: Stroke) {
    const id = s.l ?? 0;
    return this.layers.some((l) => l.id === id) ? id : this.layers[0].id;
  }

  setLayers(layers: LayerDef[]) {
    this.layers = layers;
    for (const id of [...this.canvases.keys()]) if (!layers.some((l) => l.id === id)) this.canvases.delete(id);
    layers.forEach((l) => this.canvas(l.id));
  }

  clear() {
    for (const c of this.canvases.values()) c.getContext("2d")!.clearRect(0, 0, this.width, this.height);
  }

  apply(s: Stroke) {
    if (s.tool === "dup" || s.tool === "merge") return this.layerOp(s);
    const ctx = this.canvas(this.layerOf(s)).getContext("2d")!;
    if (s.tool === "move") return this.move(ctx, s, 1);
    if (s.tool === "pixelfill") return this.pixelFill(ctx, s);
    if (s.tool !== "fill") return drawStroke(ctx, s, this.k, undefined, this.paper ?? "smooth", this.sheet);
    // fill looks at every visible layer, so it stops at lines drawn on other layers too
    for (const copy of mirrored(s, this.sheet.w, this.sheet.h)) {
      const sample = (this.sample ??= this.blank());
      const sc = sample.getContext("2d")!;
      sc.clearRect(0, 0, this.width, this.height);
      this.render(sc, undefined, "sample", this.frameOf(s));
      floodFill(ctx, sample, copy.p[0] * this.k, copy.p[1] * this.k, s.c, s.a ?? 1);
    }
  }

  /* dup copies the source layer onto the stroke's layer; merge draws it there with its own
     blend and opacity, then empties it. As with strokes, a missing layer is layer 0. */
  private layerOp(s: Stroke) {
    const from = this.layers.find((l) => l.id === s.src), to = s.l ?? 0;
    if (!from || to === from.id) return;
    const src = this.canvas(from.id);
    const ctx = this.canvas(to).getContext("2d")!;
    ctx.save();
    if (s.tool === "dup") {
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(src, 0, 0);
    } else {
      ctx.globalAlpha = from.opacity;
      ctx.globalCompositeOperation = from.blend;
      ctx.drawImage(src, 0, 0);
      src.getContext("2d")!.clearRect(0, 0, this.width, this.height);
    }
    ctx.restore();
  }

  /* lifts what is inside the outline, clears it, and puts it back transformed (`k` of the way) */
  private move(ctx: CanvasRenderingContext2D, s: Stroke, part: number) {
    const n = pointsOf(s);
    if (n < 3 || !s.x) return;
    const k = this.k;
    const outline = new Path2D();
    for (let i = 0; i < n; i++) outline[i ? "lineTo" : "moveTo"](s.p[i * 3] * k, s.p[i * 3 + 1] * k);
    outline.closePath();
    const lift = (this.lift ??= this.blank());
    const lc = lift.getContext("2d")!;
    lc.globalCompositeOperation = "copy";
    lc.drawImage(ctx.canvas, 0, 0);
    lc.globalCompositeOperation = "destination-in";
    lc.fill(outline);
    lc.globalCompositeOperation = "source-over";
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fill(outline);
    ctx.restore();
    ctx.save();
    setOn(ctx, partway(fromArr(s.x), part), k);
    ctx.drawImage(lift, 0, 0);
    ctx.restore();
  }

  /** Composites the paper and the layers into `ctx` at its current transform. A `live` stroke
      is drawn on a copy of its layer, so tools that change existing pixels preview without
      committing. "plain" leaves out the grain; "sample" also puts the layers on white, for
      reading where lines are; "bare" leaves out the paper, for drawing over one already there. With `frame` (or the painter's own) only that frame's layers
      are drawn. */
  render(ctx: CanvasRenderingContext2D, live?: { stroke: Stroke; upto?: number }, look: "full" | "plain" | "sample" | "bare" = "full", frame = this.frame) {
    const paper = look === "sample" ? "#FFFFFF" : look === "bare" ? null : this.paper && PAPERS[this.paper].color;
    if (paper) {
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    if (!this.width || !this.height) return; // a canvas not laid out yet has nothing to show
    const liveId = live ? this.layerOf(live.stroke) : null;
    ctx.save();
    for (const l of this.layers) {
      if (l.hidden || l.gone || (frame !== undefined && (l.f ?? 0) !== frame)) continue;
      let src = this.canvas(l.id);
      if (l.id === liveId && live) {
        const w = this.work.getContext("2d")!;
        w.globalCompositeOperation = "copy";
        w.drawImage(src, 0, 0);
        w.globalCompositeOperation = "source-over";
        const ls = live.stroke;
        if (ls.tool === "fill") this.previewFill(w, ls);
        else if (ls.tool === "pixelfill") this.pixelFill(w, ls);
        else if (ls.tool === "move") this.move(w, ls, live.upto === undefined ? 1 : live.upto / Math.max(1, pointsOf(ls)));
        else drawStroke(w, ls, this.k, live.upto, this.paper ?? "smooth", this.sheet);
        src = this.work;
      }
      ctx.globalAlpha = l.opacity;
      ctx.globalCompositeOperation = l.blend;
      ctx.drawImage(src, 0, 0);
    }
    ctx.restore();
    // the grain goes over the paint too, the way paint sits in the paper's tooth
    if (look === "full" && this.paper) shadeGrain(ctx, this.paper, this.k, this.width, this.height);
  }

  private previewFill(w: CanvasRenderingContext2D, s: Stroke) {
    const sample = (this.sample ??= this.blank());
    const sc = sample.getContext("2d")!;
    sc.clearRect(0, 0, this.width, this.height);
    this.render(sc, undefined, "sample", this.frameOf(s));
    floodFill(w, sample, s.p[0] * this.k, s.p[1] * this.k, s.c, s.a ?? 1);
  }

  /* fills cells, reading the visible layers of its frame at cell centres the way the fill tool does */
  private pixelFill(ctx: CanvasRenderingContext2D, s: Stroke) {
    if (s.p.length < 3) return;
    const sample = (this.sample ??= this.blank());
    const sc = sample.getContext("2d", { willReadFrequently: true })!;
    sc.clearRect(0, 0, this.width, this.height);
    this.render(sc, undefined, "sample", this.frameOf(s));
    const { grid, mask } = fillCells(s, this.sheet, sc.getImageData(0, 0, this.width, this.height), this.k);
    ctx.save();
    ctx.globalAlpha = s.a ?? 1;
    ctx.fillStyle = s.c;
    paintCells(ctx, grid, mask, this.k);
    ctx.restore();
  }

  /** The colour under a point of the composite, as #rrggbb. */
  pick(x: number, y: number) {
    const sample = (this.sample ??= this.blank());
    const sc = sample.getContext("2d", { willReadFrequently: true })!;
    sc.clearRect(0, 0, this.width, this.height);
    this.render(sc, undefined, "plain");
    const d = sc.getImageData(Math.floor(x * this.k), Math.floor(y * this.k), 1, 1).data;
    return "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
}
