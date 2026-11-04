import { describe, expect, it } from "vitest";
import { NO_GUIDES } from "../../data/library";
import { snapDirection } from "../guides";
import { PAPER_IDS, toothAt } from "../paper";
import type { Stroke } from "../stroke";
import { mirrored } from "../symmetry";

const W = 1600, H = 1200;
const base: Stroke = { tool: "brushpen", c: "#000000", w: 4, p: [100, 200, 50], tl: [30, 45] };

describe("symmetry", () => {
  it("makes one copy per mode", () => {
    expect(mirrored(base, W, H)).toHaveLength(1);
    expect(mirrored({ ...base, m: "v" }, W, H)).toHaveLength(2);
    expect(mirrored({ ...base, m: "vh" }, W, H)).toHaveLength(4);
    expect(mirrored({ ...base, m: "r6" }, W, H)).toHaveLength(6);
  });
  it("mirrors points and turns the pen with them", () => {
    const [, v] = mirrored({ ...base, m: "v" }, W, H);
    expect(v.p.slice(0, 2)).toEqual([1500, 200]);
    expect(v.tl![0]).toBe(150);
    const r = mirrored({ ...base, m: "r6" }, W, H);
    expect(r[3].p[0]).toBeCloseTo(1500);
    expect(r[3].p[1]).toBeCloseTo(1000);
    expect(r[3].tl![0]).toBe(210);
  });
  it("leaves the stored stroke alone", () => {
    const s = { ...base, m: "vh", p: [...base.p] };
    mirrored(s, W, H);
    expect(s.p).toEqual(base.p);
  });
});

describe("perspective snap", () => {
  const g = { ...NO_GUIDES, mode: 1 as const, vp: [[800, 500], [0, 0]] as [number, number][] };
  const dir = (...a: [number, number, number, number]) => snapDirection(g, ...a).map((v) => v + 0); // -0 to 0
  it("picks the guide nearest the stroke's heading", () => {
    expect(dir(100, 900, 105, 700)).toEqual([0, -1]);
    expect(dir(100, 900, 300, 905)).toEqual([1, 0]);
    const [x, y] = snapDirection(g, 0, 1000, 100, 940);
    expect(x / y).toBeCloseTo(800 / -500);
  });
});

describe("paper tooth", () => {
  it("is in range and repeats every 256 units", () => {
    for (const id of PAPER_IDS) {
      for (const [x, y] of [[0, 0], [17, 99], [1000.5, 3]]) {
        const v = toothAt(id, x, y);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        expect(toothAt(id, x + 256, y - 512)).toBe(v);
      }
    }
  });
});

describe("painter layers", () => {
  it("puts a stroke with no layer on layer 0, wherever layer 0 sits in the stack", async () => {
    const { Painter } = await import("../painter");
    const layerOf = Painter.prototype.layerOf;
    const stack = { layers: [{ id: 2 }, { id: 0 }, { id: 1 }] } as unknown as InstanceType<typeof Painter>;
    expect(layerOf.call(stack, { ...base })).toBe(0);
    expect(layerOf.call(stack, { ...base, l: 1 })).toBe(1);
    expect(layerOf.call(stack, { ...base, l: 9 })).toBe(2);
  });
});
