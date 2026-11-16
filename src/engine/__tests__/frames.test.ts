import { beforeAll, describe, expect, it } from "vitest";
import { decode, encode } from "../codec";
import { cleanMs, frameAt, isAnimated, loopMs, nextFrameId, playOrder, type Anim } from "../frames";
import type { Painter as PainterT } from "../painter";
import type { Replayer as ReplayerT } from "../replay";
import type { LayerDef, Stroke } from "../stroke";

const anim = (ms: number[], extra: Partial<Anim> = {}): Anim => ({ frames: ms.map((m, id) => ({ id, ms: m })), ...extra });

describe("frame timing", () => {
  it("keeps frame times to whole steps of 10 ms between 20 ms and 2 s", () => {
    expect([cleanMs(5), cleanMs(124), cleanMs(126), cleanMs(9000), cleanMs(NaN)]).toEqual([20, 120, 130, 2000, 120]);
  });

  it("plays forward, or forward and back without repeating the ends", () => {
    const a = anim([100, 100, 100, 100]);
    expect(playOrder(a).map((f) => f.id)).toEqual([0, 1, 2, 3]);
    expect(playOrder({ ...a, bounce: true }).map((f) => f.id)).toEqual([0, 1, 2, 3, 2, 1]);
    expect(loopMs({ ...a, bounce: true })).toBe(600);
  });

  it("finds the frame on screen at any time, going round for ever", () => {
    const a = anim([100, 200, 50]);
    expect([0, 99, 100, 299, 300, 349, 350, 3500 + 120].map((t) => frameAt(a, t)?.id)).toEqual([0, 0, 1, 1, 2, 2, 0, 1]);
  });

  it("leaves deleted frames out of the loop", () => {
    const a: Anim = { frames: [{ id: 0, ms: 100, gone: true }, { id: 1, ms: 100 }, { id: 4, ms: 100 }] };
    expect(playOrder(a).map((f) => f.id)).toEqual([1, 4]);
    expect(isAnimated({ anim: a })).toBe(true);
    expect(isAnimated({ anim: { frames: [{ id: 0, ms: 100 }, { id: 1, ms: 100, gone: true }] } })).toBe(false);
    expect(isAnimated({})).toBe(false);
    expect(nextFrameId(a)).toBe(5);
    expect(nextFrameId(undefined)).toBe(0);
  });
});

// two frames on a 16 × 16 pixel sheet: frame 0 has a black wall down column 3; frame 1 is
// copied from it, gets a red cell, and is filled green from the top left
const pen = (p: number[], l: number, c = "#000000"): Stroke => ({ tool: "pixel", c, w: 80, p, g: 16, ...(l ? { l } : {}) });
const cell = (c: number, r: number) => [c * 80 + 40, r * 80 + 40, 50];
const LAYERS: LayerDef[] = [
  { id: 0, name: "Layer 1", blend: "source-over", opacity: 1 },
  { id: 1, name: "Layer 1", blend: "source-over", opacity: 1, f: 1 },
  { id: 2, name: "Layer 1", blend: "source-over", opacity: 1, f: 2 },
];
const STROKES: Stroke[] = [
  pen([...cell(3, 0), ...cell(3, 15)], 0),
  { tool: "dup", c: "", w: 0, p: [], l: 1, src: 0 },
  pen(cell(8, 8), 1, "#FF0000"),
  // frame 2 is new and empty: its fill reads only its own frame, so it passes column 3
  { tool: "pixelfill", c: "#00FF00", w: 0, p: cell(0, 0), g: 16, l: 2 },
];
const ANIM: Anim = { frames: [{ id: 0, ms: 100 }, { id: 1, ms: 200 }, { id: 2, ms: 100 }] };

describe("recording an animation", () => {
  it("needs no new format: copying a frame is a layer copy", () => {
    const bytes = encode(STROKES);
    expect(bytes[2]).toBe(4); // pixel tools, as in 3.1
    expect(decode(bytes)).toEqual(STROKES);
    const drawn = STROKES.map((s) => (s.tool === "pixelfill" ? { ...s, tool: "fill" as const, g: undefined } : s.tool === "pixel" ? { ...s, tool: "ink" as const, g: undefined } : s));
    expect(encode(drawn)[2]).toBe(3);
  });
});

// the engine on skia, the way the server's worker runs it (from tilo-api's modules); skipped
// where those aren't installed
const skia: { createCanvas: (w: number, h: number) => HTMLCanvasElement } | null = await import(
  /* @vite-ignore */ new URL("../../../server/api/node_modules/@napi-rs/canvas/index.js", import.meta.url).href
).catch(() => null);

describe.skipIf(!skia)("painting frames", () => {
  let Painter: typeof PainterT, Replayer: typeof ReplayerT;
  beforeAll(async () => {
    const m = skia as unknown as Record<string, unknown>;
    Object.assign(globalThis, { DOMMatrix: m.DOMMatrix, ImageData: m.ImageData, Path2D: m.Path2D, document: { createElement: () => skia!.createCanvas(1, 1) } });
    ({ Painter } = await import("../painter"));
    ({ Replayer } = await import("../replay"));
  });
  const at = (c: HTMLCanvasElement, x: number, y: number) => [...c.getContext("2d")!.getImageData(x, y, 1, 1).data].slice(0, 3);
  const BLACK = [0, 0, 0], WHITE = [255, 255, 255], RED = [255, 0, 0], GREEN = [0, 255, 0];

  const painted = () => {
    const p = new Painter(160, 160, 160 / 1280, LAYERS.map((l) => ({ ...l })), "plain");
    STROKES.forEach((s) => p.apply(s));
    return p;
  };
  const shot = (p: PainterT, frame?: number) => {
    const c = skia!.createCanvas(160, 160);
    p.frame = frame;
    p.render(c.getContext("2d")!);
    return c;
  };

  it("shows only the chosen frame's layers, and every layer on a still", () => {
    const p = painted();
    const f0 = shot(p, 0), f1 = shot(p, 1), f2 = shot(p, 2), all = shot(p, undefined);
    expect([at(f0, 35, 5), at(f0, 85, 85), at(f0, 155, 5)]).toEqual([BLACK, WHITE, WHITE]);
    expect([at(f1, 35, 5), at(f1, 85, 85)]).toEqual([BLACK, RED]);
    expect([at(f2, 35, 5), at(f2, 155, 155)]).toEqual([GREEN, GREEN]);
    // a still composites everything, as before frames
    expect(at(all, 85, 85)).toEqual(GREEN);
  });

  it("replays each stroke on its frame, then plays the loop at its times", () => {
    const c = skia!.createCanvas(160, 160);
    const rep = new Replayer(c, STROKES, "plain", 1280, LAYERS.map((l) => ({ ...l })), 1280, { anim: ANIM, grid: 16 });
    expect(rep.animated).toBe(true);
    expect(rep.loopMs).toBe(400);
    rep.draw(0.999);
    // the fill is still coming: frame 2 is on screen, empty
    expect([at(c, 35, 5), at(c, 85, 85)]).toEqual([WHITE, WHITE]);
    rep.draw(1);
    expect(at(c, 35, 5)).toEqual(GREEN);
    expect([0, 150, 350, 450].map((t) => rep.loop(t))).toEqual([0, 1, 2, 0]);
    rep.loop(150);
    expect([at(c, 35, 5), at(c, 85, 85), at(c, 0, 0)]).toEqual([BLACK, RED, WHITE]);
    // seeking back starts over and shows the frame being drawn then
    rep.draw(0.2);
    expect([at(c, 35, 5), at(c, 85, 85)]).toEqual([BLACK, WHITE]);
  });

  it("paints an animation at one pixel per cell and keeps the cells sharp", () => {
    const c = skia!.createCanvas(160, 160);
    const rep = new Replayer(c, STROKES, "plain", 1280, LAYERS.map((l) => ({ ...l })), 1280, { anim: ANIM, grid: 16 });
    rep.loop(150);
    // the red cell's edges, with no blend into its neighbours
    expect([at(c, 80, 80), at(c, 89, 89), at(c, 79, 80), at(c, 90, 80)]).toEqual([RED, RED, WHITE, WHITE]);
  });

  it("leaves a still's replay as it was", () => {
    const c = skia!.createCanvas(160, 160);
    const rep = new Replayer(c, STROKES.slice(0, 1), "plain", 1280, [LAYERS[0]], 1280, { anim: { frames: [{ id: 0, ms: 100 }] }, grid: 16 });
    expect(rep.animated).toBe(false);
    rep.draw(1);
    expect(at(c, 35, 5)).toEqual(BLACK);
  });
});
