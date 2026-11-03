import { floodFill } from "./brushes";
import { mirrored } from "./symmetry";
import { drawStroke, SHEET, type LayerDef, type Stroke } from "./stroke";

/* Holds one canvas per layer at a fixed pixel size and composites them, bottom to top, with
   each layer's blend mode and opacity. `k` is pixels per sheet unit. The studio and every
   replay draw through a Painter, so what you see while drawing is what a replay shows. */
export class Painter {
  private canvases = new Map<number, HTMLCanvasElement>();
  private work: HTMLCanvasElement;
  private sample: HTMLCanvasElement | null = null;
  layers: LayerDef[];

  constructor(readonly width: number, readonly height: number, readonly k: number, layers: LayerDef[]) {
    this.layers = layers;
    this.work = this.blank();
    layers.forEach((l) => this.canvas(l.id));
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

  /** The layer a stroke belongs on: its own if it still exists, otherwise the bottom one. */
  layerOf(s: Stroke) {
    return this.layers.some((l) => l.id === s.l) ? s.l! : this.layers[0].id;
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
    const ctx = this.canvas(this.layerOf(s)).getContext("2d")!;
    if (s.tool !== "fill") return drawStroke(ctx, s, this.k);
    // fill looks at every visible layer, so it stops at lines drawn on other layers too
    for (const copy of mirrored(s, SHEET.w, SHEET.h)) {
      const sample = (this.sample ??= this.blank());
      const sc = sample.getContext("2d")!;
      sc.clearRect(0, 0, this.width, this.height);
      this.render(sc, "#FFFFFF");
      floodFill(ctx, sample, copy.p[0] * this.k, copy.p[1] * this.k, s.c, s.a ?? 1);
    }
  }

  /** Composites the layers into `ctx` at its current transform. A `live` stroke is drawn on
      a copy of its layer, so tools that change existing pixels preview without committing. */
  render(ctx: CanvasRenderingContext2D, paper: string | null, live?: { stroke: Stroke; upto?: number }) {
    if (paper) {
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    if (!this.width || !this.height) return; // a canvas not laid out yet has nothing to show
    const liveId = live ? this.layerOf(live.stroke) : null;
    ctx.save();
    for (const l of this.layers) {
      if (l.hidden) continue;
      let src = this.canvas(l.id);
      if (l.id === liveId && live) {
        const w = this.work.getContext("2d")!;
        w.globalCompositeOperation = "copy";
        w.drawImage(src, 0, 0);
        w.globalCompositeOperation = "source-over";
        if (live.stroke.tool === "fill") this.previewFill(w, live.stroke);
        else drawStroke(w, live.stroke, this.k, live.upto);
        src = this.work;
      }
      ctx.globalAlpha = l.opacity;
      ctx.globalCompositeOperation = l.blend;
      ctx.drawImage(src, 0, 0);
    }
    ctx.restore();
  }

  private previewFill(w: CanvasRenderingContext2D, s: Stroke) {
    const sample = (this.sample ??= this.blank());
    const sc = sample.getContext("2d")!;
    sc.clearRect(0, 0, this.width, this.height);
    this.render(sc, "#FFFFFF");
    floodFill(w, sample, s.p[0] * this.k, s.p[1] * this.k, s.c, s.a ?? 1);
  }

  /** The colour under a point of the composite, as #rrggbb. */
  pick(x: number, y: number, paper: string) {
    const sample = (this.sample ??= this.blank());
    const sc = sample.getContext("2d", { willReadFrequently: true })!;
    sc.clearRect(0, 0, this.width, this.height);
    this.render(sc, paper);
    const d = sc.getImageData(Math.floor(x * this.k), Math.floor(y * this.k), 1, 1).data;
    return "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
}
