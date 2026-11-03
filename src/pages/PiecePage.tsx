import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Icon } from "../components/Icon";
import { Trace } from "../components/Trace";
import { allPieces, pieceById, stampCount, toggleStamp, useLocal } from "../data/local";
import { STAMPS, STAMP_COLOR } from "../data/samples";
import { Replayer, prefersReducedMotion } from "../engine/replay";
import { fmtMin, paletteOf, toolsUsed, type Piece } from "../engine/stroke";

function Player({ piece }: { piece: Piece }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const rep = useRef<Replayer | null>(null);
  const [pos, setPos] = useState(prefersReducedMotion() ? 1 : 0);
  const [playing, setPlaying] = useState(!prefersReducedMotion());
  const [speed, setSpeed] = useState(1);
  const [idx, setIdx] = useState(0);
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    const c = cv.current!;
    c.width = 1600;
    c.height = 1200;
    rep.current = new Replayer(c, piece.strokes, piece.paper ?? "smooth", 1600, piece.layers);
    setIdx(rep.current.draw(posRef.current));
  }, [piece]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const dur = Math.min(16000, 5000 + piece.strokes.length * 45);
    let p = posRef.current >= 1 ? 0 : posRef.current;
    const tick = (now: number) => {
      p = Math.min(1, p + ((now - last) / dur) * speed);
      last = now;
      setPos(p);
      setIdx(rep.current!.draw(p));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, piece]);

  const seek = (v: number) => {
    setPlaying(false);
    setPos(v);
    setIdx(rep.current!.draw(v));
  };
  return (
    <div className="player-wrap">
      <div className="player-frame plate reg">
        <canvas ref={cv} role="img" aria-label={`${piece.title}, replay at ${Math.round(pos * 100)} percent`} />
      </div>
      <Trace strokes={piece.strokes} pos={pos} onSeek={seek} />
      <div className="player">
        <button className="play" onClick={() => setPlaying((v) => !v)} aria-label={playing ? "Pause replay" : "Play replay"}>
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <input type="range" id="scrub" min={0} max={1000} value={Math.round(pos * 1000)} onChange={(e) => seek(+e.target.value / 1000)} aria-label="Replay position" />
        <span className="mono num clock">{fmtMin(piece.minutes * pos)} / {fmtMin(piece.minutes)}</span>
        <button className="speed mono" onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))} aria-label={`Replay speed ${speed} times`}>{speed}×</button>
      </div>
      <p className="kicker stroke-no">Stroke {Math.min(idx + 1, piece.strokes.length).toLocaleString()} of {piece.strokes.length.toLocaleString()} · drag along the trace to scrub</p>
    </div>
  );
}

export function PiecePage() {
  const { id = "" } = useParams();
  const local = useLocal();
  const nav = useNavigate();
  const piece = pieceById(id, local);
  if (!piece)
    return (
      <main className="wrap piece-missing">
        <h1>This piece isn't on the board</h1>
        <p className="serif">It may have been pinned on another device. <Link to="/gallery">Back to the gallery</Link></p>
      </main>
    );
  const src = piece.remixOf ? pieceById(piece.remixOf, local) : undefined;
  const kids = allPieces(local).filter((q) => q.remixOf === piece.id);
  return (
    <main className="wrap piece-page">
      <Link to="/gallery" viewTransition className="back-link"><Icon name="back" size={18} />Gallery</Link>
      <div className="piece-grid">
        <Player key={piece.id} piece={piece} />
        <section className="piece-info" aria-labelledby="p-title">
          <h1 id="p-title">{piece.title}</h1>
          <p className="who serif">@{piece.by}{piece.mine ? " (you)" : ""}{piece.prompt ? ` · Subject No. ${piece.prompt}` : ""}{piece.sample ? " · sample piece" : ""}</p>
          <div className="proof-box"><Icon name="proof" /><p className="serif"><b>Recorded on Tilo.</b> All {piece.strokes.length.toLocaleString()} strokes were saved as they were made. Press play to watch them in order.</p></div>
          <dl className="facts">
            <dt>Time</dt><dd>{fmtMin(piece.minutes)} min{piece.prompt && piece.minutes <= 10 ? " · inside the 10:00 limit" : ""}</dd>
            <dt>Tools</dt><dd>{toolsUsed(piece.strokes).join(" · ")}</dd>
            <dt>Inks</dt><dd className="swatches">{paletteOf(piece.strokes).map((c) => <i key={c} style={{ ["--c" as string]: c }} title={c} />)}</dd>
            <dt>Sheet</dt><dd>4:3 · 1600 × 1200</dd>
          </dl>
          <div>
            <p className="kicker stamp-head">Stamp it · pick any that fit</p>
            <div className="stamp-row">
              {STAMPS.map((k, j) => {
                const on = !!local.stamps[piece.id]?.[k];
                const n = stampCount(piece, k, local);
                return (
                  <button key={k} className="stamp" aria-pressed={on} onClick={() => toggleStamp(piece.id, k)} style={{ ["--sc" as string]: STAMP_COLOR[k], ["--sr" as string]: `${(j % 3) - 1.5}deg` }}>
                    {k}{n ? <b>{n}</b> : null}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="lineage serif">
            {src && <>Remix of <Link to={`/piece/${src.id}`} viewTransition>{src.title}</Link> by @{src.by}. </>}
            {kids.length > 0 && <>{kids.length} remix{kids.length > 1 ? "es" : ""} grew out of this: {kids.map((k, i) => <span key={k.id}>{i ? ", " : ""}<Link to={`/piece/${k.id}`} viewTransition>{k.title}</Link></span>)}.</>}
            {!src && !kids.length && "No remixes yet. Start one and the credit links back here."}
          </p>
          <div className="piece-actions">
            <button className="btn btn-ink" onClick={() => nav(`/studio?remix=${piece.id}`, { viewTransition: true })}><Icon name="remix" />Remix in studio</button>
          </div>
        </section>
      </div>
    </main>
  );
}
