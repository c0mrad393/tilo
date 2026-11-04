import { describe, expect, it } from "vitest";
import { decode, encode, FORMAT, fromBase64, toBase64 } from "../codec";
import type { Stroke, ToolId } from "../stroke";

const TOOLS: ToolId[] = ["pencil", "ink", "brushpen", "charcoal", "marker", "wash", "gouache", "oil", "spray", "fill", "lasso", "smudge", "eraser"];

// a seeded generator, so a failure can be reproduced
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function randomStrokes(seed: number, count: number): Stroke[] {
  const r = rng(seed);
  let t = 1_790_000_000_000;
  return Array.from({ length: count }, () => {
    const n = 1 + Math.floor(r() * 60);
    const s: Stroke = {
      tool: TOOLS[Math.floor(r() * TOOLS.length)],
      c: "#" + Math.floor(r() * 0xffffff).toString(16).padStart(6, "0").toUpperCase(),
      w: Math.round(r() * 800) / 10,
      p: Array.from({ length: n }, () => [Math.round((r() * 1800 - 100) * 10) / 10 + 0, Math.round((r() * 1400 - 100) * 10) / 10 + 0, Math.floor(r() * 100)]).flat(),
    };
    if (r() < 0.8) s.t = t += Math.floor(r() * 9000);
    if (r() < 0.5) s.l = Math.floor(r() * 8);
    if (r() < 0.3) s.a = Math.round(r() * 95 + 5) / 100;
    if (r() < 0.2) s.m = ["v", "h", "vh", "r6", "r8"][Math.floor(r() * 5)];
    if (r() < 0.3) s.r = Math.floor(r() * 1e9);
    if (r() < 0.2) s.tl = Array.from({ length: n }, () => [Math.floor(r() * 360), Math.floor(r() * 91)]).flat();
    return s;
  });
}

// fields the format leaves out when they hold their default: layer 0 and full opacity
const normal = (s: Stroke): Stroke => {
  const { l, a, ...rest } = s;
  return { ...rest, ...(l ? { l } : {}), ...(a !== undefined && a < 1 ? { a } : {}) };
};

// layer actions: a move of a lasso selection, a layer copy and a merge
const OPS: Stroke[] = [
  { tool: "ink", c: "#1B1E1D", w: 8, p: [100, 200, 50, 300, 260, 70], t: 1793735906754 },
  { tool: "move", c: "", w: 0, p: [90, 190, 0, 320, 190, 0, 320, 280, 0, 90, 280, 0], t: 1793735907000, x: [205, 235, 1.25, -1.25, 0.5236, -40.5, 12] },
  { tool: "dup", c: "", w: 0, p: [], l: 1, src: 0, t: 1793735907100 },
  { tool: "merge", c: "", w: 0, p: [], src: 1, t: 1793735907200 },
];

describe("recording v2", () => {
  it("round-trips strokes exactly at its precision", () => {
    for (const seed of [1, 2, 3, 42, 1234]) {
      const strokes = randomStrokes(seed, 200);
      expect(decode(encode(strokes))).toEqual(strokes.map(normal));
    }
  });

  it("keeps an empty recording", () => {
    expect(decode(encode([]))).toEqual([]);
  });

  it("starts with the magic bytes and its version", () => {
    // plain strokes are still written as format 2, so older readers keep working
    expect([...encode(randomStrokes(7, 3)).subarray(0, 3)]).toEqual([84, 76, 2]);
    expect([...encode(OPS).subarray(0, 3)]).toEqual([84, 76, FORMAT]);
  });

  it("refuses data that isn't a recording, is cut short or is from a newer format", () => {
    expect(() => decode(new Uint8Array([1, 2, 3]))).toThrow();
    const b = encode(randomStrokes(9, 20));
    expect(() => decode(b.subarray(0, b.length - 5))).toThrow();
    const newer = b.slice();
    newer[2] = FORMAT + 1;
    expect(() => decode(newer)).toThrow(/newer/);
  });

  it("survives base64", () => {
    const b = encode(randomStrokes(5, 50));
    expect(fromBase64(toBase64(b))).toEqual(b);
  });

  it("round-trips layer actions (format 3)", () => {
    expect(decode(encode(OPS))).toEqual(OPS);
    // mixed in among ordinary strokes, everything after them still lines up
    const mixed = [...randomStrokes(11, 40), ...OPS, ...randomStrokes(12, 40)];
    expect(decode(encode(mixed))).toEqual(mixed.map(normal));
  });

  it("keeps a transform at the precision the studio rounds to", () => {
    expect(decode(encode([{ tool: "move", c: "", w: 0, p: [], x: [1.04, -2.06, 0.9996, 1.0004, -3.14159, 0.05, -0.04] }]))[0].x).toEqual([1, -2.1, 1, 1, -3.1416, 0.1, 0]);
  });

  // Published recordings must stay readable forever. If this snapshot changes, the format
  // changed: bump FORMAT and keep a decoder for the old version instead.
  it("keeps its byte layout", () => {
    const strokes: Stroke[] = [
      { tool: "ink", c: "#1B1E1D", w: 8, p: [100, 200, 50, 110.5, 205.2, 60], t: 1793735906754, l: 1 },
      { tool: "brushpen", c: "#2B37D4", w: 12.5, p: [-20.3, 1199.9, 0], a: 0.35, m: "r6", r: 987654321, tl: [359, 12] },
      { tool: "fill", c: "#FFFFFF", w: 1, p: [10, 10, 99], t: 1793735906700 },
    ];
    expect(toBase64(encode(strokes))).toMatchSnapshot();
  });

  it("keeps its format 3 byte layout", () => {
    expect(toBase64(encode(OPS))).toMatchSnapshot();
  });
});
