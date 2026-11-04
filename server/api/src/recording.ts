import { decode, FORMAT } from "../../../src/engine/codec.ts";

/* Reading a recording on the server, with the same codec the studio writes it with.
   For now this only describes it; the proof-of-hand checks (2.5) build on the same pass. */

const OPS = new Set(["move", "dup", "merge"]);
export const MAX_BYTES = 2 * 1024 * 1024;

export interface Summary {
  bytes: number;
  format: number;
  strokes: number;
  drawn: number;
  layers: number;
  /** first to last stroke end, in seconds; 0 when the recording has no times */
  seconds: number;
}

export function summarise(bytes: Uint8Array): Summary {
  const strokes = decode(bytes);
  const times = strokes.map((s) => s.t).filter((t): t is number => t !== undefined);
  return {
    bytes: bytes.length,
    format: bytes[2],
    strokes: strokes.length,
    drawn: strokes.filter((s) => !OPS.has(s.tool)).length,
    layers: new Set(strokes.map((s) => s.l ?? 0)).size,
    seconds: times.length > 1 ? Math.round((Math.max(...times) - Math.min(...times)) / 1000) : 0,
  };
}

export { decode, FORMAT };
