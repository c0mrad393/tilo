import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Icon } from "../components/Icon";
import { lastSheet, library, migrateDraft, onLibraryChange, type SheetMeta } from "../data/library";
import { PAPERS, paperOf } from "../engine/paper";
import { fmtMin } from "../engine/stroke";

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const edited = (t: number) => (new Date(t).toDateString() === new Date().toDateString() ? `today ${clock.format(t)}` : day.format(t));

/* Every sheet you have started, kept on this device. */
export function Library() {
  const nav = useNavigate();
  const [sheets, setSheets] = useState<SheetMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [doomed, setDoomed] = useState<SheetMeta | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const dlg = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      library
        .list()
        .then((l) => live && setSheets(l))
        .catch(() => live && setFailed(true));
    migrateDraft().then(load);
    const off = onLibraryChange(load);
    return () => {
      live = false;
      off();
    };
  }, []);

  // pictures as object URLs, made once per stored picture and let go when they leave
  useEffect(() => {
    if (!sheets) return;
    const urls: Record<string, string> = {};
    sheets.forEach((s) => s.thumb && (urls[s.id] = URL.createObjectURL(s.thumb)));
    setThumbs(urls);
    return () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
  }, [sheets]);

  const duplicate = async (s: SheetMeta) => {
    const copy = await library.duplicate(s.id);
    if (copy) nav(`/studio?sheet=${copy.id}`, { viewTransition: true });
  };
  const remove = async () => {
    if (!doomed) return;
    if (lastSheet.get() === doomed.id) lastSheet.set(null);
    await library.remove(doomed.id);
    dlg.current!.close();
  };

  return (
    <main id="main" tabIndex={-1} className="wrap library-page">
      <header className="page-head">
        <h1>Your sheets</h1>
        <p className="serif">Every drawing you start is kept here, on this device, with its whole recording. Pin one to put it in the gallery; the sheet stays here either way.</p>
        <div className="gal-controls">
          <p className="serif lib-count">{sheets ? `${sheets.length} ${sheets.length === 1 ? "sheet" : "sheets"}` : failed ? "" : "Opening the drawer…"}</p>
          <div className="row-btns lib-new">
            <Link to="/studio?new&kind=pixel" viewTransition className="btn btn-line"><Icon name="pixel" />New pixel sheet</Link>
            <Link to="/studio?new" viewTransition className="btn btn-ink"><Icon name="plus" />New sheet</Link>
          </div>
        </div>
      </header>

      {failed ? (
        <p className="empty serif">This browser won't let Tilo keep sheets (private windows often don't). You can still draw, and export a PNG or timelapse before you leave.</p>
      ) : sheets && sheets.length === 0 ? (
        <p className="empty serif">No sheets yet. <Link to="/studio?new" viewTransition>Start one</Link>, and it will wait for you here.</p>
      ) : (
        <ul className="sheets">
          {sheets?.map((s, i) => (
            <li key={s.id} className="card sheet-card press" style={{ ["--press-delay" as string]: `${(i % 4) * 70}ms` }}>
              <Link to={`/studio?sheet=${s.id}`} viewTransition className="sheet-open" aria-label={`Open ${s.title || "Untitled"}`}>
                <span className="plate">
                  {thumbs[s.id] ? <img src={thumbs[s.id]} alt="" width={400} height={300} /> : <span className="sheet-blank" style={{ background: PAPERS[paperOf(s.paper)].color }} />}
                  {s.pinned && <span className="card-flag kicker">Pinned</span>}
                </span>
                <span className="card-cap">
                  <span className="card-title">{s.title || "Untitled"}</span>
                  <span className="card-by serif">
                    edited {edited(s.updated)} · {s.count.toLocaleString()} {s.count === 1 ? "stroke" : "strokes"} · {fmtMin(s.ms / 60000)} · {PAPERS[paperOf(s.paper)].name.toLowerCase()}
                  </span>
                </span>
              </Link>
              <div className="sheet-actions">
                {s.pinned && <Link className="icon-btn" to={`/piece/${s.pinned}`} viewTransition aria-label={`See ${s.title || "Untitled"} in the gallery`} title="See it in the gallery"><Icon name="frame" size={18} /></Link>}
                <button className="icon-btn" onClick={() => duplicate(s)} aria-label={`Duplicate ${s.title || "Untitled"}`} title="Duplicate"><Icon name="copy" size={18} /></button>
                <button className="icon-btn" onClick={() => { setDoomed(s); dlg.current!.showModal(); }} aria-label={`Delete ${s.title || "Untitled"}`} title="Delete"><Icon name="trash" size={18} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <dialog ref={dlg} aria-labelledby="del-h">
        <div className="small-sheet sheet">
          <h2 id="del-h">Delete “{doomed?.title || "Untitled"}”?</h2>
          <p>The sheet and its recording go for good. {doomed?.pinned ? "The pinned copy in the gallery stays." : "Nothing of it is anywhere else."}</p>
          <div className="row">
            <button className="btn btn-quiet" onClick={() => dlg.current!.close()}>Keep it</button>
            <button className="btn btn-ink" onClick={remove}>Delete the sheet</button>
          </div>
        </div>
      </dialog>
    </main>
  );
}
