import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex, normHex, remember } from "../colour";

describe("colour", () => {
  it("reads hex in the forms people type", () => {
    expect(normHex("#abc")).toBe("#AABBCC");
    expect(normHex(" 2b37d4 ")).toBe("#2B37D4");
    expect(normHex("#12345")).toBeNull();
    expect(normHex("red")).toBeNull();
  });

  it("goes to HSV and back without drift", () => {
    for (const hex of ["#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF", "#2B37D4", "#F2C14E", "#7A4E2D", "#808080"]) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
    expect(hexToHsv("#FF0000")).toEqual([0, 1, 1]);
    expect(hexToHsv("#00FFFF")[0]).toBe(180);
  });

  it("keeps recent colours newest first, without repeats", () => {
    let l: string[] = [];
    for (const c of ["#A", "#B", "#A", "#C"]) l = remember(l, c, 2);
    expect(l).toEqual(["#C", "#A"]);
  });
});
