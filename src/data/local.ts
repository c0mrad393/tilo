import { useSyncExternalStore } from "react";
import type { Piece, Stroke } from "../engine/stroke";
import { SAMPLES } from "./samples";

/* Per-device state until accounts arrive in Stage 2: pinned pieces, stamps, the studio draft
   and your marks on the wall. Storage can be missing or full, so every access is guarded. */
const KEY = "tilo.";
function read<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(KEY + k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(KEY + k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

interface State {
  mine: Piece[];
  stamps: Record<string, Record<string, 1>>;
}
let state: State = {
  mine: read<Piece[]>("pinned", []).filter((p) => p && Array.isArray(p.strokes)),
  stamps: read("stamps", {}),
};
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export const useLocal = () => useSyncExternalStore(subscribe, () => state);

export const allPieces = (s: State = state) => [...s.mine, ...SAMPLES];
export const pieceById = (id: string, s: State = state) => allPieces(s).find((p) => p.id === id);

export function pinPiece(p: Piece) {
  const mine = [p, ...state.mine];
  while (mine.length > 1 && JSON.stringify(mine).length > 3e6) mine.pop();
  state = { ...state, mine };
  const ok = write("pinned", mine);
  emit();
  return ok;
}

export function toggleStamp(pieceId: string, stamp: string) {
  const forPiece = { ...(state.stamps[pieceId] || {}) };
  if (forPiece[stamp]) delete forPiece[stamp];
  else forPiece[stamp] = 1;
  state = { ...state, stamps: { ...state.stamps, [pieceId]: forPiece } };
  write("stamps", state.stamps);
  emit();
}

export function stampCount(p: Piece, stamp: string, s: State = state) {
  return (p.stamps?.[stamp] || 0) + (s.stamps[p.id]?.[stamp] ? 1 : 0);
}
export const stampTotal = (p: Piece, s: State = state) =>
  Object.values(p.stamps || {}).reduce((a, b) => a + b, 0) + Object.keys(s.stamps[p.id] || {}).length;

export const draft = {
  load: () => ({ strokes: read<Stroke[]>("draft", []), ms: read<number>("draftTime", 0) }),
  save: (strokes: Stroke[], ms: number) => {
    write("draft", strokes);
    write("draftTime", ms);
  },
};

export const wallMarks = {
  load: () => read<Stroke[]>("wall", []),
  save: (s: Stroke[]) => write("wall", s.slice(-400)),
};
