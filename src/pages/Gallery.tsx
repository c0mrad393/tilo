import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Icon } from "../components/Icon";
import { PinCard, PlateCard } from "../components/PinCard";
import { ReplayCanvas } from "../components/ReplayCanvas";
import { ACCOUNTS, useAccount } from "../data/account";
import { allPieces, stampTotal, useLocal } from "../data/local";
import { listPieces, loadStrokes, type Published, type Sort } from "../data/pieces";
import { PROMPT } from "../data/prompt";
import { PAPERS, paperOf } from "../engine/paper";
import { isAnimated } from "../engine/frames";
import { drawnCount, fmtMin, isPixelShape, toolsUsed, type Piece, type Stroke } from "../engine/stroke";

const FILTERS: [Sort, string][] = ACCOUNTS
  ? [["new", "Newest"], ["stamped", "Most stamped this week"], ["prompt", `Subject No. ${PROMPT.no}`], ["remix", "Remixes"], ["pixel", "Pixel art"], ["anim", "Animation"]]
  : [["stamped", "Most stamped"], ["new", "Newest"], ["prompt", `Subject No. ${PROMPT.no}`], ["remix", "Remixes"], ["pixel", "Pixel art"], ["anim", "Animation"]];

type Shown = Piece | Published;

/* the plate on the exhibition wall; a published piece's recording is fetched when it comes up */
function ExpoPlate({ p }: { p: Shown }) {
  const [strokes, setStrokes] = useState<Stroke[] | null>("strokes" in p ? p.strokes : null);
  useEffect(() => {
    if (!strokes) loadStrokes(p.id).then(setStrokes, () => {});
  }, [p.id]);
  return strokes ? (
    <ReplayCanvas strokes={strokes} layers={p.layers} anim={p.anim} paper={p.paper} shape={p.shape} aspect={4 / 3} mode="loop" label={`${p.title} by ${p.by}, replaying`} />
  ) : (
    <img className="card-picture" src={(p as Published).picture} alt={`${p.title} by ${p.by}`} />
  );
}

function Exhibition({ list }: { list: Shown[] }) {
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
  const count = "strokes" in p ? drawnCount(p.strokes) : p.count;
  return (
    <section className="expo" aria-roledescription="carousel" aria-label="Exhibition view">
      <div className="expo-wall">
        <div className="expo-frame plate reg">
          <ExpoPlate key={p.id} p={p} />
        </div>
        <aside className="expo-label" aria-live="polite">
          <span className="kicker num">Plate {String(i + 1).padStart(2, "0")} of {String(list.length).padStart(2, "0")}</span>
          <h2>{p.title}</h2>
          <p className="serif expo-by">@{p.by}{p.mine ? " (you)" : ""}{p.ai ? " · AI-made, drawn by Claude in code" : ""}</p>
          <p className="serif">{"strokes" in p ? `${toolsUsed(p.strokes).join(", ")} on ` : "On "}{PAPERS[paperOf(p.paper)].name.toLowerCase()}.<br />{count.toLocaleString()} strokes{p.ai ? "" : `, ${fmtMin(p.minutes)} min`}.</p>
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

/* the shared gallery: published pieces from the server, a page at a time */
function usePublished(sort: Sort, me?: string) {
  const [state, setState] = useState<{ items: Published[]; more: boolean; page: number; status: "loading" | "ready" | "failed"; none?: boolean }>({ items: [], more: false, page: 0, status: "loading" });
  const load = (page: number, keep: Published[]) => {
    setState((s) => ({ ...s, status: "loading" }));
    let live = true;
    listPieces({ sort, subject: PROMPT.no, page, me }).then(
      // pages are by offset, so a piece published meanwhile can turn up again on the next one
      (r) => live && setState({ items: [...keep, ...r.items.filter((p) => !keep.some((k) => k.id === p.id))], more: r.more, page, status: "ready", none: "none" in r }),
      () => live && setState((s) => ({ ...s, status: "failed" })),
    );
    return () => {
      live = false;
    };
  };
  useEffect(() => {
    // Following waits for the session (the gallery falls back to Newest once it's known to be none)
    if (ACCOUNTS && (sort !== "following" || me)) return load(0, []);
  }, [sort, me]);
  return { ...state, next: () => load(state.page + 1, state.items) };
}

export function Gallery() {
  const local = useLocal();
  const [params, setParams] = useSearchParams();
  const { ready, profile } = useAccount();
  // Following needs someone to follow from; until the session is known it waits as Newest
  const filters: [Sort, string][] = profile ? [...FILTERS.slice(0, 1), ["following", "Following"], ...FILTERS.slice(1)] : FILTERS;
  const asked = (params.get("sort") as Sort) || FILTERS[0][0];
  const sort = asked === "following" && !profile && ready ? FILTERS[0][0] : asked;
  const view = params.get("view") === "exhibition" ? "exhibition" : "board";
  const set = (k: string, v: string) => setParams((p) => { p.set(k, v); return p; }, { replace: true });
  const shared = usePublished(sort, profile?.id);

  // pieces of this device: what was pinned here, and without accounts the samples (with
  // accounts they are published as @tilo, so they come with the shared gallery)
  let list: Piece[] = ACCOUNTS ? local.mine : allPieces(local);
  if (sort === "stamped") list = [...local.mine, ...list.filter((p) => !p.mine).sort((a, b) => stampTotal(b, local) - stampTotal(a, local))];
  if (sort === "prompt") list = list.filter((p) => p.prompt === PROMPT.no);
  if (sort === "remix") list = list.filter((p) => p.remixOf);
  if (sort === "pixel") list = list.filter((p) => isPixelShape(p.shape));
  if (sort === "anim") list = list.filter((p) => isAnimated(p));
  const mine = list.filter((p) => p.mine);

  const board = (items: Shown[]) => (
    <div className="salon is-wide">
      {items.map((p, i) => ("owner" in p ? <PlateCard key={p.id} piece={p} index={i} no={i + 1} /> : <PinCard key={p.id} piece={p} index={i} no={i + 1} />))}
    </div>
  );

  return (
    <main id="main" tabIndex={-1} className="wrap gallery-page">
      <header className="page-head">
        <h1>The gallery</h1>
        <p className="serif">
          {ACCOUNTS
            ? "Everything here was drawn on Tilo and can be replayed from its first stroke. Tilo is new, so the gallery is small for now. The pieces marked AI-made are samples Claude drew in code; the rest are by hand, and the hands are meant to win."
            : "Everything here was drawn on Tilo and can be replayed from its first stroke. The pieces marked AI-made are samples Claude drew in code, there to be beaten by hand; what you pin stays on this device until accounts open."}
        </p>
        <div className="gal-controls">
          <div className="filters" role="group" aria-label="Sort the gallery">
            {filters.map(([k, l]) => (
              <button key={k} className="filter" aria-pressed={sort === k} onClick={() => set("sort", k)}>{l}</button>
            ))}
          </div>
          <div className="filters" role="group" aria-label="View">
            <button className="filter" aria-pressed={view === "board"} onClick={() => set("view", "board")}><Icon name="grid" size={16} />Wall of plates</button>
            <button className="filter" aria-pressed={view === "exhibition"} onClick={() => set("view", "exhibition")}><Icon name="frame" size={16} />Exhibition</button>
            {ACCOUNTS && <Link className="filter" to={`/feed?sort=${sort}`} viewTransition><Icon name="play" size={16} />Watch as a feed</Link>}
          </div>
        </div>
      </header>
      {!ACCOUNTS ? (
        list.length === 0 ? (
          <p className="empty serif">Nothing here yet. <Link to="/studio">Start a sheet</Link> and pin it.</p>
        ) : view === "board" ? board(list) : <Exhibition list={list} />
      ) : (
        <>
          {shared.status === "failed" && !shared.items.length ? (
            <p className="empty serif" role="alert">The gallery didn't load: Tilo's server didn't answer. Check your connection and reload.</p>
          ) : shared.status === "ready" && !shared.items.length ? (
            sort === "following" ? (
              <p className="empty serif">
                {shared.none
                  ? <>You don't follow anyone yet. Open an artist's page from any piece and follow them; their new pieces show up here.</>
                  : "Nobody you follow has published anything yet."}
              </p>
            ) : (
              <p className="empty serif">{sort === "stamped" ? "Nothing has been stamped this week yet." : sort === "pixel" ? "No pixel art published yet." : sort === "anim" ? "No animations published yet. Give a pixel sheet a second frame and it moves." : "Nothing published here yet."} <Link to={sort === "pixel" || sort === "anim" ? "/studio?new&kind=pixel" : "/studio"}>Start a {sort === "pixel" || sort === "anim" ? "pixel sheet" : "sheet"}</Link> and publish it.</p>
            )
          ) : view === "board" ? board(shared.items) : shared.items.length ? <Exhibition list={shared.items} /> : null}
          {shared.status === "loading" && <p className="serif page-wait" aria-live="polite">Hanging the next plates…</p>}
          {shared.more && shared.status !== "loading" && (
            <div className="gal-more"><button className="btn btn-line" onClick={shared.next}>Show more pieces</button></div>
          )}
          {mine.length > 0 && view === "board" && (
            <section className="gal-section" aria-labelledby="gal-mine">
              <h2 id="gal-mine" className="kicker">Pinned on this device</h2>
              <p className="serif">Only you see these. {profile ? <>Publish them from <Link to="/account">your account</Link> to put them up for everyone.</> : <><Link to="/account">Sign in</Link> to publish them for everyone.</>}</p>
              {board(mine)}
            </section>
          )}
        </>
      )}
    </main>
  );
}
