import { useSyncExternalStore } from "react";
import { decode, encode, fromBase64, toBase64 } from "../engine/codec";
import type { Piece, Stroke } from "../engine/stroke";
import { SAMPLES } from "./samples";

/* Per-device state until accounts arrive in Stage 2: pinned pieces, stamps and your marks on
   the wall. Storage can be missing or full, so every access is guarded. Sheets you are still
   drawing live in the library (library.ts). */
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
/* pinned pieces are stored with their strokes as a base64 v2 recording, under half the size of JSON */
type Stored = Omit<Piece, "strokes"> & { strokes?: Stroke[]; rec?: string };
const unpack = (list: Stored[]): Piece[] =>
  list.flatMap((p) => {
    try {
      const strokes = p.rec ? decode(fromBase64(p.rec)) : p.strokes;
      if (!p || !Array.isArray(strokes)) return [];
      const { rec: _rec, ...rest } = p;
      return [{ ...rest, strokes }];
    } catch {
      return [];
    }
  });
const pack = (list: Piece[]): Stored[] => list.map(({ strokes, ...p }) => ({ ...p, rec: toBase64(encode(strokes)) }));

let state: State = {
  mine: unpack(read<Stored[]>("pinned", [])),
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
  let stored = pack(mine);
  while (mine.length > 1 && JSON.stringify(stored).length > 3e6) {
    mine.pop();
    stored = stored.slice(0, mine.length);
  }
  state = { ...state, mine };
  const ok = write("pinned", stored);
  emit();
  return ok;
}

/** Drops a pin from this device, once it has been published for everyone. */
export function unpinPiece(id: string) {
  state = { ...state, mine: state.mine.filter((p) => p.id !== id) };
  write("pinned", pack(state.mine));
  emit();
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

export const wallMarks = {
  load: () => read<Stroke[]>("wall", []),
  save: (s: Stroke[]) => write("wall", s.slice(-400)),
};
