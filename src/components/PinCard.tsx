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

/* A piece as a catalogue plate: the work with crop marks, its caption underneath.
   Hovering or focusing it plays its replay. */
export function PinCard({ piece, index = 0, no, mode = "hover" as const }: { piece: Piece; index?: number; no?: number; mode?: "hover" | "static" | "loop" }) {
  const top = Object.entries(piece.stamps || {}).sort((a, b) => b[1] - a[1]).slice(0, 2);
  return (
    <Link
      to={`/piece/${piece.id}`}
      viewTransition
      data-replay-host
      className="card lift press"
      style={{ ["--press-delay" as string]: `${(index % 4) * 90}ms` }}
      aria-label={`${piece.title} by ${piece.by}. Open the piece.`}
    >
      <span className="plate">
        <ReplayCanvas strokes={piece.strokes} layers={piece.layers} mode={mode} label={`${piece.title}, drawn by ${piece.by}`} />
        {piece.mine && <span className="card-flag kicker">Yours</span>}
      </span>
      <span className="card-cap">
        {no !== undefined && <span className="card-no kicker">Plate {String(no).padStart(2, "0")}</span>}
        <span className="card-title">{piece.title}</span>
        <span className="card-by serif">
          @{piece.by} · {fmtMin(piece.minutes)} min · {piece.strokes.length.toLocaleString()} strokes{piece.remixOf ? " · remix" : ""}
        </span>
      </span>
      {top.length > 0 && (
        <span className="card-stamps">
          {top.map(([k, v], j) => <Stamp key={k} name={k} count={v} tilt={j ? 2.5 : -2} />)}
        </span>
      )}
    </Link>
  );
}
