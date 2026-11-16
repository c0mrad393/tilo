import { describe, expect, it } from "vitest";
import { encodeGif, type GifFrame } from "../gif";

/* A small GIF reader, only for checking what the writer wrote: the loop block, every frame's
   time, rectangle and disposal, and the pixels once each frame is drawn over the last. */
function readGif(b: Uint8Array) {
  let i = 0;
  const u8 = () => b[i++];
  const u16 = () => b[i++] | (b[i++] << 8);
  expect(String.fromCharCode(...b.subarray(0, 6))).toBe("GIF89a");
  i = 6;
  const W = u16(), H = u16(), packed = u8();
  i += 2;
  const table: number[][] = [];
  if (packed & 0x80) for (let k = 0; k < 1 << ((packed & 7) + 1); k++) table.push([u8(), u8(), u8()]);
  let loops: number | null = null;
  const frames: { ms: number; rect: number[]; dispose: number; rgba: Uint8Array }[] = [];
  let screen = new Uint8Array(W * H * 4);
  let gce = { ms: 0, dispose: 0, clear: -1 };
  for (;;) {
    const tag = u8();
    if (tag === 0x3b) break;
    if (tag === 0x21) {
      const label = u8();
      const blocks: number[][] = [];
      for (let n = u8(); n; n = u8()) {
        blocks.push([...b.subarray(i, i + n)]);
        i += n;
      }
      if (label === 0xf9) {
        const [p, d0, d1, t] = blocks[0];
        gce = { ms: (d0 | (d1 << 8)) * 10, dispose: (p >> 2) & 7, clear: p & 1 ? t : -1 };
      }
      if (label === 0xff && String.fromCharCode(...blocks[0]) === "NETSCAPE2.0") loops = blocks[1][1] | (blocks[1][2] << 8);
      continue;
    }
    expect(tag).toBe(0x2c);
    const x = u16(), y = u16(), w = u16(), h = u16();
    expect(u8() & 0x80).toBe(0); // no table of its own
    const min = u8();
    const data: number[] = [];
    for (let n = u8(); n; n = u8()) {
      data.push(...b.subarray(i, i + n));
      i += n;
    }
    const idx = lzwDecode(min, data);
    expect(idx.length).toBe(w * h);
    const next = gce.dispose === 2 ? new Uint8Array(W * H * 4) : screen.slice();
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        const v = idx[r * w + c];
        if (v === gce.clear) continue;
        const o = ((y + r) * W + x + c) * 4;
        next.set([...table[v], 255], o);
      }
    screen = next;
    frames.push({ ms: gce.ms, rect: [x, y, w, h], dispose: gce.dispose, rgba: screen.slice() });
  }
  return { W, H, loops, colours: table.length, frames };
}

function lzwDecode(min: number, data: number[]) {
  const clear = 1 << min, eoi = clear + 1;
  let size = min + 1, next = eoi + 1, pos = 0, prev: number[] | null = null;
  let dict: number[][] = [];
  const reset = () => {
    dict = Array.from({ length: clear }, (_, k) => [k]);
    dict.push([], []);
    size = min + 1;
    next = eoi + 1;
    prev = null;
  };
  reset();
  const read = () => {
    let v = 0;
    for (let k = 0; k < size; k++, pos++) v |= ((data[pos >> 3] >> (pos & 7)) & 1) << k;
    return v;
  };
  const out: number[] = [];
  for (;;) {
    const code = read();
    if (code === clear) {
      reset();
      continue;
    }
    if (code === eoi) break;
    const entry: number[] = code < next ? dict[code] : [...prev!, prev![0]];
    out.push(...entry);
    if (prev && next < 4096) {
      dict[next++] = [...prev, entry[0]];
      if (next === 1 << size && size < 12) size++;
    }
    prev = entry;
  }
  return out;
}

const solid = (w: number, h: number, rgb: number[], paint: [number, number, number[]][] = []) => {
  const d = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) d.set([...rgb, 255], i * 4);
  for (const [x, y, c] of paint) d.set(c.length === 4 ? c : [...c, 255], (y * w + x) * 4);
  return d;
};
const px = (f: { rgba: Uint8Array }, W: number, x: number, y: number) => [...f.rgba.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)];

describe("GIF writer", () => {
  it("writes a loop that never ends, with each frame's time and exact colours", () => {
    const W = 8, H = 6, red = [230, 40, 40], blue = [30, 60, 200], white = [255, 255, 255];
    const frames: GifFrame[] = [
      { rgba: solid(W, H, white, [[1, 1, red]]), ms: 120 },
      { rgba: solid(W, H, white, [[2, 1, red]]), ms: 200 },
      { rgba: solid(W, H, white, [[3, 4, blue]]), ms: 1000 },
    ];
    const g = readGif(encodeGif(W, H, frames));
    expect([g.W, g.H, g.loops]).toEqual([W, H, 0]);
    expect(g.frames.map((f) => f.ms)).toEqual([120, 200, 1000]);
    g.frames.forEach((f, k) => expect(f.rgba).toEqual(frames[k].rgba));
  });

  it("stores only the rectangle that changed, and merges a frame that didn't change", () => {
    const W = 10, H = 10, bg = [27, 27, 31], c = [255, 210, 63];
    const a = solid(W, H, bg, [[2, 3, c]]), b = solid(W, H, bg, [[6, 7, c]]);
    const g = readGif(encodeGif(W, H, [{ rgba: a, ms: 100 }, { rgba: a, ms: 100 }, { rgba: b, ms: 50 }]));
    expect(g.frames.map((f) => f.ms)).toEqual([200, 50]);
    expect(g.frames[0].rect).toEqual([0, 0, W, H]);
    expect(g.frames[1].rect).toEqual([2, 3, 5, 5]);
    expect(g.frames[1].dispose).toBe(1);
    expect(g.frames[1].rgba).toEqual(b);
  });

  it("keeps a big picture exact through the code table filling up and starting over", () => {
    const W = 160, H = 120;
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const colours = Array.from({ length: 200 }, (_, k) => [k, 255 - k, (k * 7) % 256]);
    const frame = () => {
      const d = new Uint8Array(W * H * 4);
      for (let i = 0; i < W * H; i++) d.set([...colours[Math.floor(rand() * colours.length)], 255], i * 4);
      return d;
    };
    const frames = [frame(), frame()];
    const g = readGif(encodeGif(W, H, frames.map((rgba) => ({ rgba, ms: 80 }))));
    expect(g.colours).toBe(256);
    g.frames.forEach((f, k) => expect(f.rgba).toEqual(frames[k]));
  });

  it("brings more than 256 colours down to near ones", () => {
    const W = 64, H = 64;
    const d = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d.set([x * 4, y * 4, 128, 255], (y * W + x) * 4);
    const g = readGif(encodeGif(W, H, [{ rgba: d, ms: 100 }]));
    expect(g.colours).toBe(256);
    for (const [x, y] of [[0, 0], [31, 17], [63, 63]]) {
      const [r, gg, b] = px(g.frames[0], W, x, y);
      expect(Math.abs(r - x * 4) + Math.abs(gg - y * 4) + Math.abs(b - 128)).toBeLessThan(24);
    }
  });

  it("stores see-through frames whole and clears between them", () => {
    const W = 4, H = 4, ink = [10, 10, 10];
    const a = new Uint8Array(W * H * 4), b = new Uint8Array(W * H * 4);
    a.set([...ink, 255], (1 * W + 1) * 4);
    b.set([...ink, 255], (2 * W + 2) * 4);
    const g = readGif(encodeGif(W, H, [{ rgba: a, ms: 100 }, { rgba: b, ms: 100 }]));
    expect(g.frames.map((f) => [f.rect, f.dispose])).toEqual([[[0, 0, W, H], 2], [[0, 0, W, H], 2]]);
    expect(px(g.frames[1], W, 1, 1)[3]).toBe(0);
    expect(px(g.frames[1], W, 2, 2)).toEqual([...ink, 255]);
  });
});
