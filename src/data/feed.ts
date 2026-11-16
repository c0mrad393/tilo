/* The feed's scheduling, from Stage 3.3: plain code with no DOM, so it is tested on its own.
   The page tells it which piece is most in view; it says which one plays, which are made
   ready, which show only their picture, which are kept as empty blocks, and which
   recordings to fetch. A painter is megabytes on a drawing sheet, so at most three live. */

/** What a piece in the feed holds.
    - play: the one on screen, with its painter, replaying (or paused by the viewer)
    - ready: just before or after it, painter built and first stroke shown, so it starts at once
    - picture: its picture only; no painter, its canvas let go
    - spacer: far from view, an empty block of its height */
export type Slot = "play" | "ready" | "picture" | "spacer";

export interface FeedPlan {
  current: number;
  slots: Slot[];
  /** recordings to have, nearest first */
  load: number[];
}

/** a piece plays once more than this much of it is on screen */
export const IN_VIEW = 0.6;
/** recordings are fetched this many pieces (screens) ahead and behind */
export const FETCH_AROUND = 2;
/** pieces further than this from the current one are kept as spacers */
export const KEEP_AROUND = 6;
/** decoded recordings kept */
export const RECORDINGS = 8;
/** live painters at most */
export const PAINTERS = 3;

/** The piece most in view, if more than 60 % of it is; else the one before stays current. */
export function pickCurrent(ratios: ArrayLike<number>, prev: number) {
  let best = prev, top = prev >= 0 && prev < ratios.length ? ratios[prev] : 0;
  for (let i = 0; i < ratios.length; i++) if (ratios[i] > top) [best, top] = [i, ratios[i]];
  return top > IN_VIEW ? best : prev;
}

/**
 * Who holds what, for `n` pieces with `current` on screen.
 * `manual` (reduced motion or data saver): nothing plays by itself, so no painter is built
 * until Play is pressed on the current piece. `save` (data saver): recordings are fetched
 * only for a piece whose Play was pressed.
 */
export function planFeed(n: number, current: number, o: { manual?: boolean; save?: boolean; pressed?: ReadonlySet<number> } = {}): FeedPlan {
  const pressed = o.pressed ?? new Set<number>();
  const manual = o.manual || o.save;
  const slots: Slot[] = [];
  for (let i = 0; i < n; i++) {
    const d = Math.abs(i - current);
    if (current < 0) slots.push(i < KEEP_AROUND ? "picture" : "spacer");
    else if (d > KEEP_AROUND) slots.push("spacer");
    else if (d === 0) slots.push(!manual || pressed.has(i) ? "play" : "picture");
    else if (d === 1 && !manual) slots.push("ready");
    else slots.push("picture");
  }
  const load: number[] = [];
  if (current >= 0)
    for (let d = 0; d <= FETCH_AROUND; d++)
      for (const i of d ? [current + d, current - d] : [current]) {
        if (i < 0 || i >= n) continue;
        if (o.save ? i === current && pressed.has(i) : true) load.push(i);
      }
  return { current, slots, load };
}

/** A replay's length in the feed: 6 to 15 s however many strokes, so a long piece doesn't hold it up. */
export const feedMs = (strokes: number) => Math.max(6000, Math.min(15000, 4000 + strokes * 30));

/** Whether the next page should load: the current piece is this near the end of what's loaded. */
export const wantsMore = (n: number, current: number, more: boolean) => more && current >= n - 4;

/** A store that keeps the last `size` values used and fetches the rest, once each. A fetch
    that fails is forgotten, so it is tried again next time. */
export class Lru<V> {
  private map = new Map<string, Promise<V>>();
  constructor(private size: number, private fetchOne: (key: string) => Promise<V>) {}
  get(key: string) {
    let v = this.map.get(key);
    if (v) this.map.delete(key);
    else {
      v = this.fetchOne(key);
      v.catch(() => this.map.get(key) === v && this.map.delete(key));
    }
    this.map.set(key, v);
    while (this.map.size > this.size) this.map.delete(this.map.keys().next().value!);
    return v;
  }
  has(key: string) {
    return this.map.has(key);
  }
  get keys() {
    return [...this.map.keys()];
  }
}
