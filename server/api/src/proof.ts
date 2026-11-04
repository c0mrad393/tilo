import type { Stroke } from "../../../src/engine/stroke.ts";

/* Proof of hand, v1. Everything here is read from the recording: each stroke carries the
   time it ended, and its points in the order they were laid down. A recording that couldn't
   have been drawn (times out of order, from before Tilo or from the future, strokes faster
   than any hand) is refused; one that reads like a person drawing earns the "Recorded on
   Tilo" badge. This is a deterrent, not proof: a careful script can fake all of it, which
   the "How proof works" page says plainly. Stage 4 looks at how each stroke moves. */

const OPS = new Set(["move", "dup", "merge"]);
/** nothing was drawn on Tilo before this (1 January 2026) */
const EPOCH = Date.UTC(2026, 0, 1);
/** a device clock may run a little ahead */
const AHEAD_MS = 10 * 60_000;
/** a clock that corrects itself may step back a little; more than this is made up */
const BACK_MS = 60_000;
/** sheet units a millisecond: a flick across a whole sheet in under 30 ms */
const FASTEST = 50;
/** points a millisecond: no pointer reports faster than 1000 times a second */
const DENSEST = 1.2;
/** for the badge, the artist's own part of the piece has at least this much in it */
const MIN_STROKES = 3;
const MIN_SECONDS = 5;

export interface Proof {
  /** set when the recording can't be a drawing, and the piece is refused */
  refuse?: string;
  /** passes every check, so the piece gets the badge */
  badge: boolean;
  /** why it didn't get the badge, for mods */
  notes: string[];
}

const pathLength = (p: number[]) => {
  let d = 0;
  for (let i = 3; i < p.length; i += 3) d += Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]);
  return d;
};

/** `base` strokes at the start came from the piece this remixes, which was checked when it
    was published; the badge's minimums apply to what came after. */
export function proofOf(strokes: Stroke[], { base = 0, now = Date.now() }: { base?: number; now?: number } = {}): Proof {
  const notes: string[] = [];
  const own = strokes.slice(base).filter((s) => !OPS.has(s.tool));
  const untimed = own.filter((s) => s.t === undefined).length;
  if (untimed) notes.push(`${untimed} of the strokes have no time`);

  let prev: number | undefined;
  let back = 0;
  let impossible = 0;
  for (const [i, s] of strokes.entries()) {
    if (s.t === undefined) continue;
    if (s.t < EPOCH) return { refuse: "The recording's times are from before Tilo existed.", badge: false, notes };
    if (s.t > now + AHEAD_MS) return { refuse: "The recording's times are in the future.", badge: false, notes };
    if (prev !== undefined && s.t < prev) {
      if (prev - s.t > BACK_MS) return { refuse: "The recording's strokes are out of order in time.", badge: false, notes };
      back++;
    }
    // a stroke was drawn at most between the stroke before it ending and its own end
    if (i >= base && prev !== undefined && !OPS.has(s.tool)) {
      const ms = s.t - prev;
      const n = s.p.length / 3;
      const len = pathLength(s.p);
      if ((ms <= 0 && len > 30) || (ms > 0 && (len / ms > FASTEST || n / ms > DENSEST))) impossible++;
    }
    prev = Math.max(prev ?? s.t, s.t);
  }
  if (impossible > Math.max(2, own.length * 0.01))
    return { refuse: "Some strokes in the recording are faster than a hand can draw.", badge: false, notes };
  if (impossible) notes.push(`${impossible} strokes faster than a hand`);
  if (back) notes.push(`the clock stepped back ${back} times`);

  // a pen reports its pressure, and no hand holds it exactly level for a whole piece
  const pen = own.filter((s) => s.tl?.length);
  if (pen.length >= MIN_STROKES) {
    const first = pen[0].p[2];
    if (pen.every((s) => s.p.every((v, j) => j % 3 !== 2 || v === first))) notes.push("the pen's pressure never changes");
  }

  const times = own.map((s) => s.t).filter((t): t is number => t !== undefined);
  const seconds = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 1000 : 0;
  if (own.length < MIN_STROKES) notes.push(`only ${own.length} new stroke${own.length === 1 ? "" : "s"}`);
  else if (times.length > 1 && seconds < MIN_SECONDS) notes.push("drawn in under five seconds");

  return { badge: !notes.length, notes };
}
