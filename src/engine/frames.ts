/* Frames (3.2 Animation). A frame is a group of layers: every layer names its frame in `f`
   (missing means frame 0), and the piece keeps its frames in play order, each with its time
   on screen. Nothing about frames is in the stroke list: a stroke names its layer, and its
   layer names its frame. Copying a frame is recorded as one layer copy (`dup`) per layer, so
   a replay repeats it; a new frame, the frame order and the times don't change any pixels
   and sit beside the layers, as the layer order and a layer's opacity do.
   Plain data, no DOM, so the server reads it too. */

export interface FrameDef {
  id: number;
  /** time on screen in ms: MS_MIN to MS_MAX in steps of MS_STEP */
  ms: number;
  /** deleted, but a frame copied from it still replays from its strokes: out of the loop */
  gone?: true;
}

export interface Anim {
  /** in play order */
  frames: FrameDef[];
  /** play forward and then back (1 2 3 4 3 2) instead of round (1 2 3 4 1 2) */
  bounce?: true;
}

export const MS_MIN = 20, MS_MAX = 2000, MS_STEP = 10, MS_DEFAULT = 120;
export const MAX_FRAMES = 24;

/** A frame time as stored: whole steps of 10 ms between 20 ms and 2 s. */
export const cleanMs = (ms: number) => Math.min(MS_MAX, Math.max(MS_MIN, Math.round((Number.isFinite(ms) ? ms : MS_DEFAULT) / MS_STEP) * MS_STEP));

/** The frame a layer is on. */
export const frameOfLayer = (l: { f?: number } | undefined) => l?.f ?? 0;

/** The frames that play, in order. */
export const liveFrames = (a: Anim | undefined) => (a?.frames ?? []).filter((f) => !f.gone);

/** A piece moves when it has two frames or more that play. */
export const isAnimated = (p: { anim?: Anim | null }): boolean => liveFrames(p.anim ?? undefined).length > 1;

/** The frames as they play once round: forward, or forward and back without repeating the ends. */
export function playOrder(a: Anim): FrameDef[] {
  const fs = liveFrames(a);
  if (!a.bounce || fs.length < 3) return fs;
  return [...fs, ...fs.slice(1, -1).reverse()];
}

/** How long the loop takes once round, in ms. */
export const loopMs = (a: Anim) => playOrder(a).reduce((t, f) => t + f.ms, 0);

/** The frame on screen `t` ms into the loop (it goes round for ever). */
export function frameAt(a: Anim, t: number): FrameDef | undefined {
  const order = playOrder(a);
  const total = order.reduce((n, f) => n + f.ms, 0);
  if (!order.length || total <= 0) return order[0];
  let at = ((t % total) + total) % total;
  for (const f of order) {
    if (at < f.ms) return f;
    at -= f.ms;
  }
  return order[order.length - 1];
}

/** A new frame id, one past the highest the piece has used. */
export const nextFrameId = (a: Anim | undefined) => Math.max(-1, ...(a?.frames ?? []).map((f) => f.id)) + 1;
