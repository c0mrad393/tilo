import { describe, expect, it, vi } from "vitest";
import { KEEP_AROUND, Lru, PAINTERS, feedMs, pickCurrent, planFeed, wantsMore } from "../feed";

const live = (slots: string[]) => slots.filter((s) => s === "play" || s === "ready").length;

describe("which piece plays", () => {
  it("is the one more than 60 % in view, and stays put between two", () => {
    expect(pickCurrent([0.1, 0.9, 0], 0)).toBe(1);
    expect(pickCurrent([0.5, 0.5, 0], 0)).toBe(0);
    expect(pickCurrent([0.45, 0.55, 0], 0)).toBe(0);
    expect(pickCurrent([0, 0.3, 0.7], 1)).toBe(2);
    expect(pickCurrent([], -1)).toBe(-1);
    expect(pickCurrent([0.2, 0.61], -1)).toBe(1);
  });
});

describe("the plan", () => {
  it("plays one, readies its neighbours, shows pictures around and spacers far off", () => {
    const { slots, load } = planFeed(20, 10);
    expect(slots[10]).toBe("play");
    expect([slots[9], slots[11]]).toEqual(["ready", "ready"]);
    expect([slots[8], slots[12], slots[10 - KEEP_AROUND], slots[10 + KEEP_AROUND]]).toEqual(["picture", "picture", "picture", "picture"]);
    expect([slots[10 - KEEP_AROUND - 1], slots[10 + KEEP_AROUND + 1], slots[0], slots[19]]).toEqual(["spacer", "spacer", "spacer", "spacer"]);
    expect(load).toEqual([10, 11, 9, 12, 8]);
  });

  it("never keeps more than three painters, at the ends too", () => {
    for (const n of [1, 2, 3, 12, 50]) for (let c = 0; c < n; c++) expect(live(planFeed(n, c).slots)).toBeLessThanOrEqual(PAINTERS);
    expect(planFeed(5, 0).slots).toEqual(["play", "ready", "picture", "picture", "picture"]);
    expect(planFeed(5, 0).load).toEqual([0, 1, 2]);
    expect(planFeed(1, 0).load).toEqual([0]);
  });

  it("builds nothing before a piece is in view", () => {
    const { slots, load } = planFeed(10, -1);
    expect(live(slots)).toBe(0);
    expect(load).toEqual([]);
    expect(slots.slice(0, 7)).toEqual(["picture", "picture", "picture", "picture", "picture", "picture", "spacer"]);
  });

  it("plays nothing by itself for a viewer who prefers less motion, but fetches ahead", () => {
    const p = planFeed(10, 4, { manual: true });
    expect(live(p.slots)).toBe(0);
    expect(p.load).toEqual([4, 5, 3, 6, 2]);
    const pressed = planFeed(10, 4, { manual: true, pressed: new Set([4]) });
    expect(pressed.slots[4]).toBe("play");
    expect(live(pressed.slots)).toBe(1);
  });

  it("fetches only what Play was pressed on with data saver on", () => {
    expect(planFeed(10, 4, { save: true }).load).toEqual([]);
    expect(live(planFeed(10, 4, { save: true }).slots)).toBe(0);
    const p = planFeed(10, 4, { save: true, pressed: new Set([2, 4]) });
    expect(p.load).toEqual([4]);
    expect(p.slots[4]).toBe("play");
    expect(p.slots[2]).toBe("picture");
  });

  it("keeps a flat number of painters and recordings over a long scroll", () => {
    const cache = new Lru<number>(8, async () => 1);
    let most = 0;
    for (let c = 0; c < 60; c++) {
      const { slots, load } = planFeed(60, c);
      load.forEach((i) => cache.get(String(i)));
      most = Math.max(most, live(slots), cache.keys.length > 8 ? 99 : 0);
      expect(slots.filter((s) => s !== "spacer").length).toBeLessThanOrEqual(2 * KEEP_AROUND + 1);
    }
    expect(most).toBeLessThanOrEqual(3);
  });
});

describe("timing and paging", () => {
  it("takes 6 to 15 s per replay", () => {
    expect([feedMs(0), feedMs(100), feedMs(200), feedMs(5000)]).toEqual([6000, 7000, 10000, 15000]);
  });
  it("asks for the next page four pieces from the end", () => {
    expect([wantsMore(12, 7, true), wantsMore(12, 8, true), wantsMore(12, 11, false)]).toEqual([false, true, false]);
  });
});

describe("the recording cache", () => {
  it("fetches each once, keeps the last eight used, and drops the oldest", async () => {
    const fetchOne = vi.fn(async (k: string) => k.toUpperCase());
    const c = new Lru(3, fetchOne);
    expect(await c.get("a")).toBe("A");
    await c.get("b");
    await c.get("a");
    await c.get("c");
    expect(fetchOne).toHaveBeenCalledTimes(3);
    await c.get("d"); // b was used longest ago
    expect(c.keys).toEqual(["a", "c", "d"]);
    await c.get("b");
    expect(fetchOne).toHaveBeenCalledTimes(5);
    expect(c.has("a")).toBe(false);
  });

  it("shares one fetch between callers and forgets one that failed", async () => {
    let n = 0;
    const c = new Lru(8, async () => {
      n++;
      if (n === 1) throw new Error("offline");
      return n;
    });
    const [x, y] = [c.get("k"), c.get("k")];
    expect(x).toBe(y);
    await expect(x).rejects.toThrow("offline");
    expect(c.has("k")).toBe(false);
    expect(await c.get("k")).toBe(2);
  });
});
