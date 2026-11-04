import { describe, expect, it } from "vitest";
import { anchor, matrix, toScreen, toSheet, type View } from "../view";

const views: View[] = [
  { s: 1, r: 0, f: 1, ox: 0, oy: 0 },
  { s: 0.37, r: 0.5, f: 1, ox: 120, oy: -40 },
  { s: 2.5, r: -2.1, f: -1, ox: -300, oy: 77 },
];

describe("view", () => {
  it("maps sheet to screen and back", () => {
    for (const v of views)
      for (const [x, y] of [[0, 0], [1600, 1200], [-50, 333.3]]) {
        const [X, Y] = toScreen(v, x, y);
        const [bx, by] = toSheet(v, X, Y);
        expect(bx).toBeCloseTo(x, 6);
        expect(by).toBeCloseTo(y, 6);
      }
  });
  it("anchors a sheet point under a screen point", () => {
    const v = anchor({ ...views[2], ox: 0, oy: 0 }, [400, 300], 50, 60);
    const [X, Y] = toScreen(v, 400, 300);
    expect(X).toBeCloseTo(50);
    expect(Y).toBeCloseTo(60);
  });
  it("gives the canvas the same transform", () => {
    const v = views[2];
    const [a, b, c, d, e, f] = matrix(v, 2);
    const [x, y] = [123, 456];
    const [X, Y] = toScreen(v, x, y);
    expect(a * x + c * y + e).toBeCloseTo(X * 2);
    expect(b * x + d * y + f).toBeCloseTo(Y * 2);
  });
});
