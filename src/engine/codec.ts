import type { Stroke, ToolId } from "./stroke";

/* Recorder v2: a stroke list as compact bytes.
   Layout: "TL", format version, then the colour table and the strokes. Numbers are
   unsigned LEB128 varints; signed ones are zigzagged first. Point coordinates are tenths of
   a sheet unit, stored as the difference from the point before, which keeps most of them to
   one byte. A stroke's end time is stored as the difference from the stroke before.
   Tool ids are written by position in TOOL_ORDER, so that list only ever grows at the end. */

export const FORMAT = 2;
const TOOL_ORDER: ToolId[] = ["pencil", "ink", "brushpen", "charcoal", "marker", "wash", "gouache", "oil", "spray", "fill", "lasso", "smudge", "eraser"];
const F_T = 1, F_L = 2, F_A = 4, F_M = 8, F_R = 16, F_TL = 32;

class Writer {
  buf = new Uint8Array(1024);
  n = 0;
  byte(b: number) {
    if (this.n === this.buf.length) {
      const next = new Uint8Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.n++] = b;
  }
  uint(v: number) {
    v = Math.max(0, Math.round(v));
    // arithmetic rather than bit operations, so values past 2^31 (timestamps) survive
    while (v >= 128) {
      this.byte((v % 128) + 128);
      v = Math.floor(v / 128);
    }
    this.byte(v);
  }
  int(v: number) {
    v = Math.round(v);
    this.uint(v >= 0 ? v * 2 : -v * 2 - 1);
  }
  str(s: string) {
    const b = new TextEncoder().encode(s);
    this.uint(b.length);
    for (const x of b) this.byte(x);
  }
  done() {
    return this.buf.slice(0, this.n);
  }
}

class Reader {
  i = 0;
  constructor(private b: Uint8Array) {}
  byte() {
    if (this.i >= this.b.length) throw new Error("Recording ends early");
    return this.b[this.i++];
  }
  uint() {
    let v = 0, mul = 1, b: number;
    do {
      b = this.byte();
      v += (b & 127) * mul;
      mul *= 128;
    } while (b & 128);
    return v;
  }
  int() {
    const v = this.uint();
    return v % 2 ? -(v + 1) / 2 : v / 2;
  }
  str() {
    const len = this.uint();
    if (this.i + len > this.b.length) throw new Error("Recording ends early");
    const s = new TextDecoder().decode(this.b.subarray(this.i, this.i + len));
    this.i += len;
    return s;
  }
}

export function encode(strokes: Stroke[]): Uint8Array {
  const w = new Writer();
  w.byte(84); // T
  w.byte(76); // L
  w.byte(FORMAT);
  const colours = [...new Set(strokes.map((s) => s.c))];
  const ci = new Map(colours.map((c, i) => [c, i]));
  w.uint(colours.length);
  colours.forEach((c) => w.str(c));
  w.uint(strokes.length);
  let prevT = 0, px = 0, py = 0;
  for (const s of strokes) {
    const tool = TOOL_ORDER.indexOf(s.tool);
    w.byte(tool < 0 ? 1 : tool);
    const flags = (s.t ? F_T : 0) | (s.l ? F_L : 0) | (s.a !== undefined && s.a < 1 ? F_A : 0) | (s.m ? F_M : 0) | (s.r !== undefined ? F_R : 0) | (s.tl?.length ? F_TL : 0);
    w.byte(flags);
    w.uint(ci.get(s.c)!);
    w.uint(s.w * 10);
    if (flags & F_T) {
      w.int(s.t! - prevT);
      prevT = s.t!;
    }
    if (flags & F_L) w.uint(s.l!);
    if (flags & F_A) w.byte(Math.round(s.a! * 100));
    if (flags & F_M) w.str(s.m!);
    if (flags & F_R) w.uint(s.r!);
    const n = (s.p.length / 3) | 0;
    w.uint(n);
    let pp = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.round(s.p[i * 3] * 10), y = Math.round(s.p[i * 3 + 1] * 10), pr = Math.round(s.p[i * 3 + 2]);
      w.int(x - px);
      w.int(y - py);
      w.int(pr - pp);
      px = x;
      py = y;
      pp = pr;
    }
    if (flags & F_TL) {
      let pa = 0, pl = 0;
      for (let i = 0; i < n; i++) {
        const az = Math.round(s.tl![i * 2] ?? 0), alt = Math.round(s.tl![i * 2 + 1] ?? 90);
        w.int(az - pa);
        w.int(alt - pl);
        pa = az;
        pl = alt;
      }
    }
  }
  return w.done();
}

export function decode(bytes: Uint8Array): Stroke[] {
  const r = new Reader(bytes);
  if (r.byte() !== 84 || r.byte() !== 76) throw new Error("Not a Tilo recording");
  const version = r.byte();
  if (version > FORMAT) throw new Error(`Recording format ${version} is newer than this app`);
  const colours = Array.from({ length: r.uint() }, () => r.str());
  const count = r.uint();
  const out: Stroke[] = [];
  let prevT = 0, px = 0, py = 0;
  for (let k = 0; k < count; k++) {
    const tool = TOOL_ORDER[r.byte()] ?? "ink";
    const flags = r.byte();
    const s: Stroke = { tool, c: colours[r.uint()] ?? "#000000", w: r.uint() / 10, p: [] };
    if (flags & F_T) s.t = prevT += r.int();
    if (flags & F_L) s.l = r.uint();
    if (flags & F_A) s.a = r.byte() / 100;
    if (flags & F_M) s.m = r.str();
    if (flags & F_R) s.r = r.uint();
    const n = r.uint();
    const p = new Array<number>(n * 3);
    let pp = 0;
    for (let i = 0; i < n; i++) {
      px += r.int();
      py += r.int();
      pp += r.int();
      p[i * 3] = px / 10;
      p[i * 3 + 1] = py / 10;
      p[i * 3 + 2] = pp;
    }
    s.p = p;
    if (flags & F_TL) {
      const tl = new Array<number>(n * 2);
      let pa = 0, pl = 0;
      for (let i = 0; i < n; i++) {
        tl[i * 2] = pa += r.int();
        tl[i * 2 + 1] = pl += r.int();
      }
      s.tl = tl;
    }
    out.push(s);
  }
  return out;
}

export function toBase64(b: Uint8Array) {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(s: string) {
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}
