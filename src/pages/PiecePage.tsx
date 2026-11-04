import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Icon } from "../components/Icon";
import { Trace } from "../components/Trace";
import { ACCOUNTS, useAccount } from "../data/account";
import { allPieces, pieceById, stampCount, toggleStamp, useLocal } from "../data/local";
import { type Full, getPiece, listPieces, loadPiece, myStamps, type Published, setStamp, takeDown } from "../data/pieces";
import { STAMPS, STAMP_COLOR } from "../data/samples";
import { Replayer, prefersReducedMotion } from "../engine/replay";
import { drawnCount, fmtMin, paletteOf, SHAPES, sizeOf, toolsUsed, type Piece } from "../engine/stroke";

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
    const { w, h } = sizeOf(piece);
    c.width = w;
    c.height = h;
    rep.current = new Replayer(c, piece.strokes, piece.paper ?? "smooth", w, piece.layers);
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
      <div className="player-frame plate reg" style={{ ["--aspect" as string]: sizeOf(piece).w / sizeOf(piece).h }}>
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

type Loaded = Piece | Full | null | undefined | "failed";

/** A piece from this device (a sample or a pin) at once, or a published one from the server. */
function usePiece(id: string): Loaded {
  const local = useLocal();
  const here = pieceById(id, local);
  const [remote, setRemote] = useState<Loaded>(undefined);
  useEffect(() => {
    if (here || !ACCOUNTS) return;
    let live = true;
    setRemote(undefined);
    loadPiece(id).then(
      (p) => live && setRemote(p),
      () => live && setRemote("failed"),
    );
    return () => {
      live = false;
    };
  }, [id, !!here]);
  return here ?? (ACCOUNTS ? remote : null);
}

function StampRow({ on, count, toggle, disabled }: { on: (k: string) => boolean; count: (k: string) => number; toggle: (k: string) => void; disabled?: boolean }) {
  return (
    <div className="stamp-row">
      {STAMPS.map((k, j) => {
        const n = count(k);
        return (
          <button key={k} className="stamp" aria-pressed={on(k)} disabled={disabled} onClick={() => toggle(k)} style={{ ["--sc" as string]: STAMP_COLOR[k], ["--sr" as string]: `${(j % 3) - 1.5}deg` }}>
            {k}{n ? <b>{n}</b> : null}
          </button>
        );
      })}
    </div>
  );
}

/* stamps on a piece of this device, kept on this device */
function LocalStamps({ piece }: { piece: Piece }) {
  const local = useLocal();
  return <StampRow on={(k) => !!local.stamps[piece.id]?.[k]} count={(k) => stampCount(piece, k, local)} toggle={(k) => toggleStamp(piece.id, k)} />;
}

/* stamps on a published piece, written to the server and shown before it answers */
function ServerStamps({ piece }: { piece: Published }) {
  const { profile } = useAccount();
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState(piece.stamps ?? {});
  useEffect(() => {
    if (profile) myStamps(piece.id, profile.id).then(setMine, () => {});
  }, [piece.id, profile?.id]);
  const toggle = (k: string) => {
    if (!profile) return;
    const on = !mine.has(k);
    const before = { mine, counts };
    const next = new Set(mine);
    if (on) next.add(k);
    else next.delete(k);
    setMine(next);
    setCounts({ ...counts, [k]: Math.max(0, (counts[k] ?? 0) + (on ? 1 : -1)) });
    setStamp(piece.id, k, on, profile.id).catch(() => {
      setMine(before.mine);
      setCounts(before.counts);
    });
  };
  return (
    <>
      <StampRow on={(k) => mine.has(k)} count={(k) => counts[k] ?? 0} toggle={toggle} disabled={!profile} />
      {!profile && <p className="serif stamp-note"><Link to="/account">Sign in</Link> to stamp it.</p>}
    </>
  );
}

/* where a published piece came from, and what grew out of it */
function Lineage({ piece }: { piece: Piece }) {
  const local = useLocal();
  const published = "owner" in piece;
  const [src, setSrc] = useState<Piece | undefined>(() => (piece.remixOf ? pieceById(piece.remixOf, local) : undefined));
  const [kids, setKids] = useState<{ id: string; title: string }[]>(() => (published ? [] : allPieces(local).filter((q) => q.remixOf === piece.id)));
  useEffect(() => {
    if (!published) return;
    let live = true;
    if (piece.remixOf) getPiece(piece.remixOf).then((p) => live && setSrc(p));
    listPieces({ remixOf: piece.id, size: 12 }).then((r) => live && setKids(r.items), () => {});
    return () => {
      live = false;
    };
  }, [piece.id]);
  return (
    <p className="lineage serif">
      {src && <>Remix of <Link to={`/piece/${src.id}`} viewTransition>{src.title}</Link> by @{src.by}. </>}
      {kids.length > 0 && <>{kids.length} remix{kids.length > 1 ? "es" : ""} grew out of this: {kids.map((k, i) => <span key={k.id}>{i ? ", " : ""}<Link to={`/piece/${k.id}`} viewTransition>{k.title}</Link></span>)}.</>}
      {!src && !kids.length && "No remixes yet. Start one and the credit links back here."}
    </p>
  );
}

function TakeDown({ piece }: { piece: Published }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      await takeDown(piece.id);
      dlg.current!.close();
      nav(`/u/${piece.by}`, { replace: true, viewTransition: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
      setBusy(false);
    }
  };
  return (
    <>
      <button className="btn btn-quiet" onClick={() => dlg.current!.showModal()}>Take it down</button>
      <dialog ref={dlg} aria-labelledby="down-h">
        <div className="small-sheet sheet">
          <h2 id="down-h">Take “{piece.title}” down?</h2>
          <p>It leaves the gallery for good, with its stamps. Remixes of it stay up, without the link back. The sheet in your library stays.</p>
          {error && <p className="field-note is-error" role="alert">{error}</p>}
          <div className="row">
            <button className="btn btn-quiet" onClick={() => dlg.current!.close()}>Keep it up</button>
            <button className="btn btn-ink" disabled={busy} onClick={go}>{busy ? "Taking it down…" : "Take it down"}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export function PiecePage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { profile } = useAccount();
  const piece = usePiece(id);
  if (piece === undefined)
    return (
      <main id="main" tabIndex={-1} className="wrap piece-page" aria-busy="true">
        <p className="serif page-wait">Opening the piece…</p>
      </main>
    );
  if (piece === "failed")
    return (
      <main id="main" tabIndex={-1} className="wrap error-page">
        <p className="kicker">Couldn't load</p>
        <h1>This piece didn't arrive</h1>
        <p className="serif">Tilo's server didn't answer. Check your connection and reload.</p>
      </main>
    );
  if (!piece)
    return (
      <main id="main" tabIndex={-1} className="wrap piece-missing">
        <h1>This piece isn't on the board</h1>
        <p className="serif">It may have been pinned on another device, or taken down. <Link to="/gallery">Back to the gallery</Link></p>
      </main>
    );
  const published = "owner" in piece ? piece : null;
  const yours = !!published && published.owner === profile?.id;
  const sheet = sizeOf(piece);
  return (
    <main id="main" tabIndex={-1} className="wrap piece-page">
      <Link to="/gallery" viewTransition className="back-link"><Icon name="back" size={18} />Gallery</Link>
      <div className="piece-grid">
        <Player key={piece.id} piece={piece} />
        <section className="piece-info" aria-labelledby="p-title">
          <h1 id="p-title">{piece.title}</h1>
          <p className="who serif">
            {published ? <Link to={`/u/${published.by}`} viewTransition>@{published.by}</Link> : `@${piece.by}`}
            {piece.mine || yours ? " (you)" : ""}
            {piece.prompt ? ` · Subject No. ${piece.prompt}` : ""}
            {piece.sample ? " · sample piece" : ""}
            {piece.mine ? " · pinned on this device" : ""}
            {published && published.status !== "live" ? " · held for review, only you see it" : ""}
          </p>
          <div className="proof-box"><Icon name="proof" /><p className="serif"><b>Recorded on Tilo.</b> All {drawnCount(piece.strokes).toLocaleString()} strokes were saved as they were made. Press play to watch them in order.</p></div>
          <dl className="facts">
            <dt>Time</dt><dd>{fmtMin(piece.minutes)} min{piece.prompt && piece.minutes <= 10 ? " · inside the 10:00 limit" : ""}</dd>
            <dt>Tools</dt><dd>{toolsUsed(piece.strokes).join(" · ")}</dd>
            <dt>Inks</dt><dd className="swatches">{paletteOf(piece.strokes).map((c) => <i key={c} style={{ ["--c" as string]: c }} title={c} />)}</dd>
            <dt>Sheet</dt><dd>{SHAPES[piece.shape ?? "land"].name} · {sheet.w.toLocaleString()} × {sheet.h.toLocaleString()}</dd>
            {published && <><dt>Published</dt><dd>{new Date(published.created).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</dd></>}
          </dl>
          <div>
            <p className="kicker stamp-head">Stamp it · pick any that fit</p>
            {published ? <ServerStamps key={piece.id} piece={published} /> : <LocalStamps piece={piece} />}
          </div>
          <Lineage key={piece.id} piece={piece} />
          <div className="piece-actions">
            <button className="btn btn-ink" onClick={() => nav(`/studio?remix=${piece.id}`, { viewTransition: true })}><Icon name="remix" />Remix in studio</button>
            {yours && <TakeDown piece={published!} />}
          </div>
        </section>
      </div>
    </main>
  );
}
