/* Tilo's own GIF writer (GIF89a), for animations: made in the browser for export, and by the
   server's worker for the gallery, from the same file. Plain TypeScript, no DOM.
   One colour table for the whole loop. Pixel art almost always has fewer than 256 colours,
   so they are kept exactly; with more (layer opacity, blends), median cut picks 256 and every
   pixel takes the nearest. A frame that is the same as the one before only adds its
   time to it, and each later frame stores only the rectangle that changed. Frames see-through
   in places (no paper) are stored whole, so a cell that empties shows empty. */

export interface GifFrame {
  /** width × height × 4 bytes, RGBA */
  rgba: Uint8Array | Uint8ClampedArray;
  /** time on screen; a GIF counts in hundredths of a second, two at least */
  ms: number;
}

class Bytes {
  buf = new Uint8Array(4096);
  n = 0;
  byte(b: number) {
    if (this.n === this.buf.length) {
      const next = new Uint8Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.n++] = b;
  }
  u16(v: number) {
    this.byte(v & 255);
    this.byte((v >> 8) & 255);
  }
  all(bs: ArrayLike<number>) {
    for (let i = 0; i < bs.length; i++) this.byte(bs[i]);
  }
  done() {
    return this.buf.slice(0, this.n);
  }
}

const rgbAt = (d: ArrayLike<number>, i: number) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];

/** The loop's colours: exact when they fit, else 256 by median cut. */
function paletteOf(frames: GifFrame[], room: number) {
  const counts = new Map<number, number>();
  for (const f of frames)
    for (let i = 0; i < f.rgba.length; i += 4) {
      if (f.rgba[i + 3] < 128) continue;
      const c = rgbAt(f.rgba, i);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  if (counts.size <= room) {
    const colours = [...counts.keys()];
    const index = new Map(colours.map((c, i) => [c, i]));
    return { colours, nearest: (c: number) => index.get(c)! };
  }
  // median cut: split the box of colours with the widest spread at its middle, by use
  type Box = { cs: number[] };
  const ch = (c: number, k: number) => (c >> (16 - 8 * k)) & 255;
  const spread = (b: Box) => {
    let best = 0, axis = 0;
    for (let k = 0; k < 3; k++) {
      let lo = 255, hi = 0;
      for (const c of b.cs) {
        const v = ch(c, k);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo > best) {
        best = hi - lo;
        axis = k;
      }
    }
    return { best, axis };
  };
  const boxes: Box[] = [{ cs: [...counts.keys()] }];
  while (boxes.length < room) {
    let pick = -1, score = 0;
    boxes.forEach((b, i) => {
      if (b.cs.length < 2) return;
      const s = spread(b).best * Math.sqrt(b.cs.reduce((t, c) => t + counts.get(c)!, 0));
      if (s > score) {
        score = s;
        pick = i;
      }
    });
    if (pick < 0) break;
    const box = boxes[pick];
    const { axis } = spread(box);
    box.cs.sort((x, y) => ch(x, axis) - ch(y, axis));
    const total = box.cs.reduce((t, c) => t + counts.get(c)!, 0);
    let run = 0, cut = 1;
    for (let i = 0; i < box.cs.length - 1; i++) {
      run += counts.get(box.cs[i])!;
      cut = i + 1;
      if (run >= total / 2) break;
    }
    boxes.splice(pick, 1, { cs: box.cs.slice(0, cut) }, { cs: box.cs.slice(cut) });
  }
  const colours = boxes.map((b) => {
    let r = 0, g = 0, bl = 0, n = 0;
    for (const c of b.cs) {
      const w = counts.get(c)!;
      r += ch(c, 0) * w;
      g += ch(c, 1) * w;
      bl += ch(c, 2) * w;
      n += w;
    }
    return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(bl / n);
  });
  const cache = new Map<number, number>();
  const nearest = (c: number) => {
    let best = cache.get(c);
    if (best !== undefined) return best;
    const r = c >> 16, g = (c >> 8) & 255, b = c & 255;
    let bd = Infinity;
    best = 0;
    for (let i = 0; i < colours.length; i++) {
      const p = colours[i], dr = (p >> 16) - r, dg = ((p >> 8) & 255) - g, db = (p & 255) - b;
      const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    cache.set(c, best);
    return best;
  };
  return { colours, nearest };
}

/** LZW, as GIF wants it: codes packed from the low bit up, in sub-blocks of 255 bytes. */
function lzw(out: Bytes, minSize: number, index: Uint8Array) {
  const clear = 1 << minSize, eoi = clear + 1;
  let size = minSize + 1, next = eoi + 1;
  let table = new Map<number, number>();
  const packed = new Bytes();
  let acc = 0, bits = 0;
  const emit = (code: number) => {
    acc |= code << bits;
    bits += size;
    while (bits >= 8) {
      packed.byte(acc & 255);
      acc >>>= 8;
      bits -= 8;
    }
  };
  emit(clear);
  let run = index[0];
  for (let i = 1; i < index.length; i++) {
    const k = index[i];
    const key = (run << 8) | k;
    const hit = table.get(key);
    if (hit !== undefined) {
      run = hit;
      continue;
    }
    emit(run);
    if (next === 4096) {
      emit(clear);
      table = new Map();
      next = eoi + 1;
      size = minSize + 1;
    } else {
      if (next >= 1 << size) size++;
      table.set(key, next++);
    }
    run = k;
  }
  emit(run);
  emit(eoi);
  if (bits > 0) packed.byte(acc & 255);
  const data = packed.done();
  out.byte(minSize);
  for (let i = 0; i < data.length; i += 255) {
    const n = Math.min(255, data.length - i);
    out.byte(n);
    out.all(data.subarray(i, i + n));
  }
  out.byte(0);
}

/** Writes the frames as a GIF that loops for ever. */
export function encodeGif(width: number, height: number, frames: GifFrame[]): Uint8Array {
  if (!frames.length) throw new Error("A GIF needs a frame");
  const clearPx = frames.some((f) => {
    for (let i = 3; i < f.rgba.length; i += 4) if (f.rgba[i] < 128) return true;
    return false;
  });
  const { colours, nearest } = paletteOf(frames, clearPx ? 255 : 256);
  const blank = colours.length; // the see-through index, when there is one
  const used = colours.length + (clearPx ? 1 : 0);
  const bits = Math.max(1, Math.ceil(Math.log2(Math.max(2, used))));

  // every frame as colour indices; one the same as the frame before adds its time to it
  const shots: { index: Uint8Array; ms: number }[] = [];
  for (const f of frames) {
    const index = new Uint8Array(width * height);
    for (let i = 0, j = 0; j < index.length; i += 4, j++) index[j] = f.rgba[i + 3] < 128 ? blank : nearest(rgbAt(f.rgba, i));
    const last = shots[shots.length - 1];
    if (last && last.index.every((v, i) => v === index[i])) last.ms += f.ms;
    else shots.push({ index, ms: f.ms });
  }

  const out = new Bytes();
  out.all([71, 73, 70, 56, 57, 97]); // GIF89a
  out.u16(width);
  out.u16(height);
  out.byte(0x80 | (7 << 4) | (bits - 1));
  out.byte(0);
  out.byte(0);
  for (let i = 0; i < 1 << bits; i++) {
    const c = colours[i] ?? 0;
    out.byte(c >> 16);
    out.byte((c >> 8) & 255);
    out.byte(c & 255);
  }
  // NETSCAPE2.0: loop for ever
  out.all([0x21, 0xff, 11, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 3, 1, 0, 0, 0]);

  let prev: Uint8Array | null = null;
  for (const shot of shots) {
    let x0 = 0, y0 = 0, x1 = width - 1, y1 = height - 1;
    if (prev && !clearPx) {
      // only the rectangle that changed
      x0 = width;
      y0 = height;
      x1 = -1;
      y1 = -1;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const i = y * width + x;
          if (shot.index[i] === prev[i]) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const part = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) part.set(shot.index.subarray((y0 + y) * width + x0, (y0 + y) * width + x0 + w), y * w);
    // graphic control: kept (1) under the next frame, or cleared (2) when frames are see-through
    out.all([0x21, 0xf9, 4, ((clearPx ? 2 : 1) << 2) | (clearPx ? 1 : 0)]);
    out.u16(Math.max(2, Math.round(shot.ms / 10)));
    out.byte(clearPx ? blank : 0);
    out.byte(0);
    out.byte(0x2c);
    out.u16(x0);
    out.u16(y0);
    out.u16(w);
    out.u16(h);
    out.byte(0);
    lzw(out, Math.max(2, bits), part);
    prev = shot.index;
  }
  out.byte(0x3b);
  return out.done();
}
