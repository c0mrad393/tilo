import { useState } from "react";
import { Link } from "react-router";
import { loadStrokes, type Published } from "../data/pieces";
import { drawnCount, fmtMin, type Piece, type Stroke } from "../engine/stroke";
import { STAMP_COLOR } from "../data/prompt";
import { usePicture } from "./Moderation";
import { ReplayCanvas } from "./ReplayCanvas";

export function Stamp({ name, count, tilt = -2 }: { name: string; count?: number; tilt?: number }) {
  return (
    <span className="stamp" style={{ ["--sc" as string]: STAMP_COLOR[name] ?? "#B23A2E", ["--sr" as string]: `${tilt}deg` }}>
      {name}
      {count ? <b>{count}</b> : null}
    </span>
  );
}

/** the mark on every piece an AI drew: Tilo's samples, which Claude drew in code */
export const AiMark = ({ className = "" }: { className?: string }) => (
  <span className={`card-ai kicker ${className}`} title="Drawn by Claude, an AI, in code, stroke by stroke">AI-made</span>
);

/** the caption line under a plate. An AI piece says who drew it and leaves out the minutes,
    which a program doesn't spend the way a hand does. */
export function byLine(piece: { by: string; minutes: number; remixOf?: string; ai?: boolean }, strokes: number) {
  const n = `${strokes.toLocaleString()} strokes${piece.remixOf ? " · remix" : ""}`;
  return piece.ai ? `@${piece.by} · drawn by AI · ${n}` : `@${piece.by} · ${fmtMin(piece.minutes)} min · ${n}`;
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
      aria-label={`${piece.title} by ${piece.by}${piece.ai ? ", drawn by an AI" : ""}. Open the piece.`}
    >
      <span className="plate">
        <ReplayCanvas strokes={piece.strokes} layers={piece.layers} paper={piece.paper} shape={piece.shape} aspect={4 / 3} mode={mode} label={`${piece.title}, drawn by ${piece.by}`} />
        {piece.mine && <span className="card-flag kicker">Yours</span>}
        {piece.ai && <AiMark />}
      </span>
      <span className="card-cap">
        {no !== undefined && <span className="card-no kicker">Plate {String(no).padStart(2, "0")}</span>}
        <span className="card-title">{piece.title}</span>
        <span className="card-by serif">
          {byLine(piece, drawnCount(piece.strokes))}
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

/* A published piece as a plate. It shows the picture the server keeps, and fetches the
   recording only when someone points at it or tabs to it, so a page of the gallery costs a
   page of pictures. */
export function PlateCard({ piece, index = 0, no }: { piece: Published; index?: number; no?: number }) {
  const [strokes, setStrokes] = useState<Stroke[] | null>(null);
  const picture = usePicture(piece);
  const want = () => {
    if (!strokes) loadStrokes(piece.id, piece.status === "live").then(setStrokes, () => {});
  };
  const top = Object.entries(piece.stamps || {}).sort((a, b) => b[1] - a[1]).slice(0, 2);
  return (
    <Link
      to={`/piece/${piece.id}`}
      viewTransition
      data-replay-host
      className="card lift press"
      style={{ ["--press-delay" as string]: `${(index % 4) * 90}ms` }}
      aria-label={`${piece.title} by ${piece.by}${piece.ai ? ", drawn by an AI" : ""}. Open the piece.`}
      onPointerEnter={want}
      onFocus={want}
    >
      <span className="plate">
        {strokes ? (
          <ReplayCanvas strokes={strokes} layers={piece.layers} paper={piece.paper} shape={piece.shape} aspect={4 / 3} mode="hover" label={`${piece.title}, drawn by ${piece.by}`} />
        ) : (
          picture && <img className="card-picture" src={picture} alt={`${piece.title}, drawn by ${piece.by}`} loading="lazy" decoding="async" />
        )}
        {piece.ai && <AiMark />}
        {piece.status !== "live" && <span className="card-flag kicker">{piece.why === "check" ? "Being checked" : piece.status === "held" ? "Waiting for a mod" : "Out of the gallery"}</span>}
      </span>
      <span className="card-cap">
        {no !== undefined && <span className="card-no kicker">Plate {String(no).padStart(2, "0")}</span>}
        <span className="card-title">{piece.title}</span>
        <span className="card-by serif">
          {byLine(piece, piece.count)}
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
