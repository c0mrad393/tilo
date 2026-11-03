import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Icon } from "../components/Icon";
import { PinCard } from "../components/PinCard";
import { ReplayCanvas } from "../components/ReplayCanvas";
import { allPieces, stampTotal, useLocal } from "../data/local";
import { PROMPT } from "../data/samples";
import { fmtMin, toolsUsed, type Piece } from "../engine/stroke";

const FILTERS = [["stamped", "Most stamped"], ["new", "Newest"], ["prompt", `Subject No. ${PROMPT.no}`], ["remix", "Remixes"]] as const;
type Sort = (typeof FILTERS)[number][0];

function Exhibition({ list }: { list: Piece[] }) {
  const [i, setI] = useState(0);
  const p = list[Math.min(i, list.length - 1)];
  const go = (d: number) => setI((n) => (n + d + list.length) % list.length);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  if (!p) return null;
  return (
    <section className="expo" aria-roledescription="carousel" aria-label="Exhibition view">
      <div className="expo-wall">
        <div className="expo-frame plate reg">
          <ReplayCanvas key={p.id} strokes={p.strokes} layers={p.layers} mode="loop" label={`${p.title} by ${p.by}, replaying`} />
        </div>
        <aside className="expo-label" aria-live="polite">
          <span className="kicker num">Plate {String(i + 1).padStart(2, "0")} of {String(list.length).padStart(2, "0")}</span>
          <h2>{p.title}</h2>
          <p className="serif expo-by">@{p.by}{p.mine ? " (you)" : ""}</p>
          <p className="serif">{toolsUsed(p.strokes).join(", ")} on Tilo paper.<br />{p.strokes.length} strokes, {fmtMin(p.minutes)} min.</p>
          <Link to={`/piece/${p.id}`} viewTransition className="expo-open">Open the piece<Icon name="arrow" size={16} /></Link>
        </aside>
      </div>
      <div className="expo-nav">
        <button className="btn btn-line" onClick={() => go(-1)} aria-label="Previous piece"><Icon name="back" />Previous</button>
        <span className="kicker">Arrow keys work too</span>
        <button className="btn btn-line" onClick={() => go(1)} aria-label="Next piece">Next<Icon name="next" /></button>
      </div>
    </section>
  );
}

export function Gallery() {
  const local = useLocal();
  const [params, setParams] = useSearchParams();
  const sort = (params.get("sort") as Sort) || "stamped";
  const view = params.get("view") === "exhibition" ? "exhibition" : "board";
  const set = (k: string, v: string) => setParams((p) => { p.set(k, v); return p; }, { replace: true });

  let list = allPieces(local);
  if (sort === "stamped") list = [...local.mine, ...list.filter((p) => !p.mine).sort((a, b) => stampTotal(b, local) - stampTotal(a, local))];
  if (sort === "prompt") list = list.filter((p) => p.prompt === PROMPT.no);
  if (sort === "remix") list = list.filter((p) => p.remixOf);

  return (
    <main className="wrap gallery-page">
      <header className="page-head">
        <h1>The gallery</h1>
        <p className="serif">Everything here was drawn on Tilo and can be replayed from its first stroke. The pieces and artists are samples for the prototype; what you pin stays on this device until accounts open.</p>
        <div className="gal-controls">
          <div className="filters" role="group" aria-label="Sort the gallery">
            {FILTERS.map(([k, l]) => (
              <button key={k} className="filter" aria-pressed={sort === k} onClick={() => set("sort", k)}>{l}</button>
            ))}
          </div>
          <div className="filters" role="group" aria-label="View">
            <button className="filter" aria-pressed={view === "board"} onClick={() => set("view", "board")}><Icon name="grid" size={16} />Wall of plates</button>
            <button className="filter" aria-pressed={view === "exhibition"} onClick={() => set("view", "exhibition")}><Icon name="frame" size={16} />Exhibition</button>
          </div>
        </div>
      </header>
      {list.length === 0 ? (
        <p className="empty serif">Nothing here yet. <Link to="/studio">Start a sheet</Link> and pin it.</p>
      ) : view === "board" ? (
        <div className="salon is-wide">{list.map((p, i) => <PinCard key={p.id} piece={p} index={i} no={i + 1} />)}</div>
      ) : (
        <Exhibition list={list} />
      )}
    </main>
  );
}
