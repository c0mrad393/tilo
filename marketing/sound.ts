/* The video's sound, made here rather than licensed: every stroke a replay draws in a frame is
   heard with its own tool (pencil scratch, ink glide, a brush's swish, a marker's squeak),
   panned to where it lands on the sheet, plus soft whooshes, paper taps and one chime for the
   cuts. make-video.ts tells it what was drawn in each frame; render() turns that into a
   48 kHz stereo WAV. */

import type { Stroke } from "../src/engine/stroke";

export const RATE = 48000;

/* ---------- what happened, frame by frame ---------- */
interface Ev { tool: string; n: number; pr: number; pan: number; gain: number; taps: number }
interface Cue { at: number; kind: "whoosh" | "tap" | "chime"; gain: number; dur?: number; up?: boolean }
const frames: Ev[][] = [];
const cues: Cue[] = [];
let now = -1;
/** the frame being drawn; -1 while drawing stills, so nothing is heard */
export const at = (frame: number) => {
  now = frame;
  if (frame >= 0) frames[frame] ??= [];
};

const last = new WeakMap<object, { pos: number; idx: number }>();
/** a replay has moved from where it was to `pos` and stands at stroke `idx`: hear the strokes it passed */
export function heard(key: object, strokes: Stroke[], pos: number, idx: number, gain: number, sheetW: number) {
  const was = last.get(key);
  last.set(key, { pos, idx });
  if (now < 0 || !strokes.length) return;
  let from = was && was.pos <= pos && was.idx <= idx ? was.idx : -1;
  if (was && pos <= was.pos) return; // standing still, or rewound for the next scene
  if (from < 0) from = 0;
  const by = new Map<string, { n: number; pr: number; x: number }>();
  const stop = Math.min(idx, strokes.length - 1);
  for (let i = Math.max(from, stop - 40); i <= stop; i++) {
    const s = strokes[i];
    if (!s.p.length) continue;
    const k = by.get(s.tool) ?? { n: 0, pr: 0, x: 0 };
    // pressure and place from the middle of the stroke
    const m = Math.floor(s.p.length / 6) * 3;
    k.n++;
    k.pr += (s.p[m + 2] ?? 60) / 99;
    k.x += s.p[m] / sheetW;
    by.set(s.tool, k);
  }
  // the stroke that was live last frame carries on; the rest touch down this frame
  const going = was ? strokes[from]?.tool : undefined;
  for (const [tool, k] of by)
    frames[now].push({ tool, n: k.n, pr: k.pr / k.n, pan: (k.x / k.n - 0.5) * 0.7, gain, taps: Math.min(3, k.n - (tool === going ? 1 : 0)) });
}
/** a single stroke being drawn outside a replay, as the highlighter is */
export function stroke(tool: string, pr: number, pan: number, gain: number) {
  if (now >= 0) frames[now].push({ tool, n: 1, pr, pan, gain, taps: 0 });
}
export const cue = (c: Cue) => cues.push(c);

/* ---------- each tool's voice ---------- */
interface Voice { f: number; q: number; level: number; grain: number; crackle: number; tap: number }
const VOICES: Record<string, Voice> = {
  pencil: { f: 4200, q: 0.9, level: 0.55, grain: 0.8, crackle: 0, tap: 0.5 },
  ink: { f: 2600, q: 0.8, level: 0.34, grain: 0.25, crackle: 0, tap: 0.35 },
  brushpen: { f: 1800, q: 0.7, level: 0.34, grain: 0.2, crackle: 0, tap: 0.25 },
  charcoal: { f: 1400, q: 0.6, level: 0.5, grain: 0.9, crackle: 0.0015, tap: 0.4 },
  marker: { f: 2300, q: 2.6, level: 0.42, grain: 0.15, crackle: 0, tap: 0.3 },
  wash: { f: 700, q: 0.5, level: 0.42, grain: 0.1, crackle: 0, tap: 0.1 },
  gouache: { f: 900, q: 0.6, level: 0.4, grain: 0.2, crackle: 0, tap: 0.15 },
  oil: { f: 620, q: 0.6, level: 0.45, grain: 0.25, crackle: 0, tap: 0.15 },
  spray: { f: 6500, q: 0.5, level: 0.26, grain: 0.3, crackle: 0, tap: 0 },
  lasso: { f: 1100, q: 0.5, level: 0.24, grain: 0.15, crackle: 0, tap: 0.12 },
  fill: { f: 300, q: 0.7, level: 0.1, grain: 0, crackle: 0, tap: 0.4 },
  smudge: { f: 520, q: 0.5, level: 0.3, grain: 0.1, crackle: 0, tap: 0 },
  eraser: { f: 3000, q: 1.2, level: 0.36, grain: 0.5, crackle: 0, tap: 0.2 },
};

/* ---------- building blocks ---------- */
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const rnd01 = () => (rnd() + 1) / 2;

class Band {
  private b0 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(f: number, q: number) { this.set(f, q); }
  set(f: number, q: number) {
    const w = (2 * Math.PI * Math.min(f, RATE * 0.45)) / RATE, al = Math.sin(w) / (2 * q), a0 = 1 + al;
    this.b0 = al / a0; this.b2 = -al / a0; this.a1 = (-2 * Math.cos(w)) / a0; this.a2 = (1 - al) / a0;
  }
  run(x: number) {
    const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** one stroke heard: the tool's band of noise, swelling in and out, with its grain, a touch-down
    tap, and a slight rise in pitch as the hand speeds up */
function gesture(L: Float32Array, R: Float32Array, i0: number, dur: number, v: Voice, gain: number, pan: number) {
  const len = Math.round(dur * RATE), band = new Band(v.f, v.q), band2 = new Band(v.f * 1.6, v.q), hp = new Band(Math.max(160, v.f * 0.35), 0.5);
  const lg = Math.sqrt(0.5 - pan * 0.5) * 1.41, rg = Math.sqrt(0.5 + pan * 0.5) * 1.41;
  let grainV = 1, grainLeft = 0;
  for (let k = 0; k < len && i0 + k < L.length; k++) {
    const p = k / len;
    if (k % 96 === 0) band.set(v.f * (0.9 + 0.2 * Math.sin(Math.PI * p)), v.q);
    if (--grainLeft <= 0) {
      grainLeft = 30 + rnd01() * 140;
      grainV = 1 - v.grain * rnd01();
    }
    const env = Math.min(1, p / 0.12) * Math.min(1, (1 - p) / 0.3);
    let x = band.run(rnd()) * 0.7 + band2.run(rnd()) * 0.3;
    x = x * 0.6 + hp.run(x) * 0.4;
    if (v.crackle && rnd01() < v.crackle * 3) x += rnd() * 2;
    const s = x * env * grainV * v.level * gain;
    L[i0 + k] += s * lg;
    R[i0 + k] += s * rg;
  }
  if (v.tap) {
    const tb = new Band(v.f * 0.8, 1.4);
    for (let k = 0; k < RATE * 0.015 && i0 + k < L.length; k++) {
      const s = tb.run(rnd()) * v.tap * gain * 0.6 * Math.exp(-k / (RATE * 0.003));
      L[i0 + k] += s * lg;
      R[i0 + k] += s * rg;
    }
  }
}

/** a soft held chord: sines a little apart, in slowly and out slowly */
function pad(L: Float32Array, R: Float32Array, from: number, to: number, notes: number[], gain: number) {
  const i0 = Math.round(from * RATE), i1 = Math.round(to * RATE);
  for (let i = i0; i < i1 && i < L.length; i++) {
    const tt = (i - i0) / RATE, left = (i1 - i) / RATE;
    const env = Math.min(1, tt / 1.2, left / 0.9);
    let l = 0, r = 0;
    notes.forEach((f, j) => {
      const w = 1 / (1 + j * 0.4);
      l += Math.sin(2 * Math.PI * f * 0.998 * tt + j) * w;
      r += Math.sin(2 * Math.PI * f * 1.002 * tt + j * 2) * w;
    });
    // a slow swell inside the chord, so it breathes
    const b = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.25 * tt);
    L[i] += l * env * b * gain;
    R[i] += r * env * b * gain;
  }
}
export interface Chord { from: number; to: number; notes: number[] }

/* ---------- the mix ---------- */
export function render(frameCount: number, fps: number, chords: Chord[] = []) {
  const per = RATE / fps, n = Math.round(frameCount * per);
  const L = new Float32Array(n), R = new Float32Array(n);

  /* A replay passes a hundred strokes a second, which heard all at once is rain. So the sound
     picks gestures out of what is being drawn, six to nine a second, each one stroke's voice
     with its own swell, the way a drawing sounds when you sit next to it. A slow replay (the
     logo writing itself) chains its gestures stroke by stroke. */
  let next = 0;
  for (let fr = 0; fr < frameCount; fr++) {
    const evs = frames[fr] ?? [];
    const t = fr / fps;
    if (!evs.length || t < next) continue;
    // a tool is picked as often as it is drawn, louder tools a little more
    const total = evs.reduce((a, e) => a + e.n * (VOICES[e.tool]?.level ?? 0.2), 0);
    let r = rnd01() * total, e = evs[0];
    for (const x of evs) if ((r -= x.n * (VOICES[x.tool]?.level ?? 0.2)) <= 0) { e = x; break; }
    const v = VOICES[e.tool];
    if (!v) continue;
    const brush = v.f < 1200;
    const dur = (brush ? 0.22 : 0.11) + rnd01() * (brush ? 0.2 : 0.14);
    gesture(L, R, Math.round(t * RATE + rnd01() * per), dur, v, e.gain * (0.45 + 0.55 * e.pr) * (0.7 + 0.3 * rnd01()), e.pan + rnd() * 0.15);
    next = t + dur * 0.75 + 0.02 + rnd01() * 0.08;
  }

  for (const c of cues) {
    const i0 = Math.round(c.at * RATE);
    if (c.kind === "whoosh") {
      // noise swept through a band, up or down, swelling and fading
      const len = Math.round((c.dur ?? 0.5) * RATE), b = new Band(400, 0.8);
      for (let k = 0; k < len && i0 + k < n; k++) {
        const p = k / len;
        if (k % 64 === 0) b.set(c.up === false ? 2400 * Math.pow(0.15, p) : 350 * Math.pow(7, p), 0.8);
        const s = b.run(rnd()) * c.gain * Math.pow(Math.sin(Math.PI * p), 1.6);
        L[i0 + k] += s * (1 - p * 0.4);
        R[i0 + k] += s * (0.6 + p * 0.4);
      }
    } else if (c.kind === "tap") {
      // a sheet landing on the table: a low thump and a little paper
      const b = new Band(2200, 1);
      for (let k = 0; k < RATE * 0.18 && i0 + k < n; k++) {
        const tt = k / RATE;
        const s = (Math.sin(2 * Math.PI * (230 - 80 * Math.min(1, tt * 8)) * tt) * Math.exp(-tt / 0.03) * 0.5 + b.run(rnd()) * Math.exp(-tt / 0.008) * 0.6) * c.gain;
        L[i0 + k] += s;
        R[i0 + k] += s;
      }
    } else {
      // a soft two-note chime, E6 then B6
      for (const [f, d, g] of [[1318.5, 0, 1], [1975.5, 0.11, 0.7]] as const)
        for (let k = 0; k < RATE * 1.6; k++) {
          const i = i0 + Math.round(d * RATE) + k;
          if (i >= n) break;
          const tt = k / RATE;
          const env = Math.min(1, tt / 0.004) * Math.exp(-tt / 0.45);
          const s = (Math.sin(2 * Math.PI * f * tt) + 0.25 * Math.sin(2 * Math.PI * f * 2.01 * tt) * Math.exp(-tt / 0.15)) * env * g * c.gain;
          L[i] += s * 0.9;
          R[i] += s;
        }
    }
  }

  for (const c of chords) pad(L, R, c.from, c.to, c.notes, 0.008);

  // a quiet room under it all, so the gaps aren't dead air
  const room = new Band(500, 0.4);
  for (let i = 0; i < n; i++) {
    const s = room.run(rnd()) * 0.006 * Math.min(1, i / RATE, (n - i) / RATE);
    L[i] += s;
    R[i] += s;
  }
  return { L, R };
}

/** 16-bit stereo WAV, peak-normalized to -1 dBFS (loudness is set when it is muxed) */
export function wav({ L, R }: { L: Float32Array; R: Float32Array }) {
  let peak = 1e-9;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = 0.89 / peak, buf = Buffer.alloc(44 + L.length * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + L.length * 4, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(L.length * 4, 40);
  for (let i = 0; i < L.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
  }
  return buf;
}
