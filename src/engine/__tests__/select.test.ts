import { describe, expect, it } from "vitest";
import { apply, boundsOf, fromArr, invert, isIdentity, partway, snapped, toArr, xfAround } from "../select";

const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));

describe("selection transforms", () => {
  const t = { cx: 100, cy: 50, sx: 2, sy: -0.5, rot: Math.PI / 2, dx: 10, dy: -20 };

  it("leaves the pivot where it moves to, and inverts exactly", () => {
    near(apply(t, 100, 50), [110, 30]);
    // a point 10 to the right of the pivot: scaled to 20, turned a quarter, then shifted
    near(apply(t, 110, 50), [110, 50]);
    for (const [x, y] of [[0, 0], [123.4, -56.7], [1600, 1200]]) near(invert(t, ...apply(t, x, y)), [x, y]);
  });

  it("goes from no change to the whole transform", () => {
    expect(isIdentity(partway(t, 0))).toBe(true);
    expect(partway(t, 1)).toEqual(t);
    expect(partway(t, 0.5).rot).toBeCloseTo(Math.PI / 4);
    expect(isIdentity(xfAround(5, 5))).toBe(true);
  });

  it("survives the array form and rounding", () => {
    expect(fromArr(toArr(t))).toEqual(t);
    expect(snapped({ ...t, dx: 10.04, sx: 2.00049, rot: 1.570796 })).toEqual({ ...t, dx: 10, sx: 2, rot: 1.5708 });
  });

  it("finds the box around points", () => {
    expect(boundsOf([3, 4, -1, 9, 7, 2])).toEqual([-1, 2, 7, 9]);
    expect(boundsOf([3, 4, 0, -1, 9, 0], 3)).toEqual([-1, 4, 3, 9]);
  });
});
