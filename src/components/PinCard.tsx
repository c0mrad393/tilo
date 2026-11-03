import { Link } from "react-router";
import { fmtMin, type Piece } from "../engine/stroke";
import { STAMP_COLOR } from "../data/samples";
import { ReplayCanvas } from "./ReplayCanvas";

export function Stamp({ name, count, tilt = -2 }: { name: string; count?: number; tilt?: number }) {
  return (
    <span className="stamp" style={{ ["--sc" as string]: STAMP_COLOR[name] ?? "#B23A2E", ["--sr" as string]: `${tilt}deg` }}>
      {name}
      {count ? <b>{count}</b> : null}
    </span>
  );
}

/* A piece pinned to the board. Hovering or focusing it plays its replay. */
export function PinCard({ piece, index = 0, mode = "hover" as const }: { piece: Piece; index?: number; mode?: "hover" | "static" | "loop" }) {
  const top = Object.entries(piece.stamps || {}).sort((a, b) => b[1] - a[1]).slice(0, 2);
  return (
    <Link
      to={`/piece/${piece.id}`}
      viewTransition
      data-replay-host
      className="pin sheet tape lift settle"
      style={{ ["--r" as string]: `${piece.tilt ?? 0}deg`, ["--tr" as string]: `${((index * 37) % 7) - 3}deg`, ["--settle-r" as string]: `${(piece.tilt ?? 0) * 1.6}deg` }}
      aria-label={`${piece.title} by ${piece.by}. Open the piece.`}
    >
      <ReplayCanvas strokes={piece.strokes} mode={mode} label={`${piece.title}, drawn by ${piece.by}`} />
      {piece.mine && <span className="pin-flag mono">YOURS</span>}
      <span className="pin-meta">
        <span className="pin-title">{piece.title}</span>
        <span className="pin-by">@{piece.by}</span>
      </span>
      <span className="pin-facts mono">
        <span>{piece.strokes.length.toLocaleString()} STROKES</span>
        <span>{fmtMin(piece.minutes)} MIN</span>
        {piece.remixOf && <span>REMIX</span>}
      </span>
      {top.length > 0 && (
        <span className="pin-stamps">
          {top.map(([k, v], j) => <Stamp key={k} name={k} count={v} tilt={j ? 2 : -2} />)}
        </span>
      )}
    </Link>
  );
}
