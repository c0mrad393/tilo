import { useState } from "react";
import { Link } from "react-router";
import { loadStrokes, type Published } from "../data/pieces";
import { isAnimated, type Anim } from "../engine/frames";
import { prefersReducedMotion } from "../engine/replay";
import { drawnCount, fmtMin, isPixelShape, type Piece, type ShapeId, type Stroke } from "../engine/stroke";
import { STAMP_COLOR } from "../data/prompt";
import { usePicture } from "./Moderation";
import { ReplayCanvas } from "./ReplayCanvas";
import { ShareButton } from "./Share";

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

/** a pixel piece says so on its plate, so the pixel bench shows wherever pieces hang */
export const PixelMark = ({ shape, anim }: { shape?: ShapeId; anim?: Anim }) =>
  isPixelShape(shape) ? <span className="card-kind kicker">{anim && isAnimated({ anim }) ? "Pixel animation" : "Pixel art"}</span> : null;

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
        <ReplayCanvas strokes={piece.strokes} layers={piece.layers} anim={piece.anim} paper={piece.paper} shape={piece.shape} aspect={4 / 3} mode={mode} label={`${piece.title}, drawn by ${piece.by}`} />
        {piece.mine && <span className="card-flag kicker">Yours</span>}
        {piece.ai && <AiMark />}
        <PixelMark shape={piece.shape} anim={piece.anim} />
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
   page of pictures. An animation shows its loop, a small GIF scaled up sharp, which plays
   with no script; the still picture for a viewer who prefers less motion. */
export function PlateCard({ piece, index = 0, no }: { piece: Published; index?: number; no?: number }) {
  const [strokes, setStrokes] = useState<Stroke[] | null>(null);
  const picture = usePicture(piece);
  const moving = isAnimated(piece) && !prefersReducedMotion();
  const loop = usePicture({ ...piece, picture: moving ? (piece.loop ?? "") : "" });
  const want = () => {
    if (!strokes) loadStrokes(piece.id, piece.status === "live").then(setStrokes, () => {});
  };
  const top = Object.entries(piece.stamps || {}).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const live = piece.status === "live";
  return (
    <div className="card-host">
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
          <ReplayCanvas strokes={strokes} layers={piece.layers} anim={piece.anim} paper={piece.paper} shape={piece.shape} aspect={4 / 3} mode="hover" label={`${piece.title}, drawn by ${piece.by}`} />
        ) : (
          (loop || picture) && <img className="card-picture" src={(loop || picture)!} alt={`${piece.title}, drawn by ${piece.by}${loop ? ", playing as a loop" : ""}`} loading="lazy" decoding="async" />
        )}
        {piece.ai && <AiMark />}
        <PixelMark shape={piece.shape} anim={piece.anim} />
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
    {live && (
      <ShareButton
        className="icon-btn card-share"
        label=""
        target={{
          id: piece.id,
          title: piece.title,
          by: piece.by,
          ai: piece.ai,
          published: true,
          load: async () => ({ ...piece, strokes: strokes ?? (await loadStrokes(piece.id, true)) }),
        }}
      />
    )}
    </div>
  );
}
