import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useAccount } from "../data/account";
import { capture } from "../engine/capture";
import { drawStroke, TOOLS, type Stroke, type ToolId } from "../engine/stroke";
import { PAPER, themeById, themeFor, WALL, WALL_COLORS, WALL_POINTS } from "../data/wall";
import { outline } from "../data/wall-art";
import { addMarks, type FoundMark, liveWall, marksIn, moderateWall, takeBack, timeLeft, WALL_LIVE } from "../data/wall-live";
import { Icon } from "./Icon";
import { ReportButton } from "./Moderation";

type WallTool = Extract<ToolId, "pencil" | "ink" | "marker"> | "hand" | "pick";
const SIZES: [number, number][] = [[3, 4], [6, 8], [14, 14]];
const K = 1.5; // offscreen resolution per wall unit
/** how often an open wall asks for new marks, while it's on screen */
const POLL_MS = 8_000;

interface Info {
  no: number;
  theme: string;
  title: string;
  ends: string;
  count: number;
  artists: number;
}
type Box = { x: number; y: number; w: number; h: number };

/* The shared wall: one sheet with a subject that everyone sees and members draw on. It
   loads the wall's latest picture from the server and the marks made since, asks for new
   ones every few seconds while it is on screen, and sends each mark once it is finished. On
   the /wall page mods get a tool to pick out marks and rub them off. */
export function Wall({ page = false }: { page?: boolean }) {
  const { profile, ready } = useAccount();
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const band = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<WallTool>("ink");
  const [color, setColor] = useState(WALL_COLORS[0]);
  const [size, setSize] = useState(6);
  const [info, setInfo] = useState<Info | null>(null);
  const [state, setState] = useState<"loading" | "live" | "offline">(WALL_LIVE ? "loading" : "offline");
  const [msg, setMsg] = useState<ReactNode>(null);
  const [picked, setPicked] = useState<FoundMark[] | null>(null);
  const isMod = !!profile && profile.role !== "member";
  const cfg = useRef({ tool, color, size, member: !!profile, ready });
  cfg.current = { tool, color, size, member: !!profile, ready };
  const ringSize = useRef(() => {});
  const reload = useRef<(fresh?: boolean) => Promise<void>>(async () => {});
  const undo = useRef<() => Promise<void>>(async () => {});
  /** how many of your marks on this wall, from this visit, Undo can take back */
  const [undoable, setUndoable] = useState(0);
  const [undoing, setUndoing] = useState(false);
  const [, tickClock] = useState(0);

  useEffect(() => {
    const wbox = box.current!, wc = cv.current!;
    const off = document.createElement("canvas");
    off.width = WALL.w * K;
    off.height = WALL.h * K;
    const octx = off.getContext("2d")!;
    const view = { s: 1, ox: 0, oy: 0 };
    let cur: Stroke | null = null;
    let gone = false;

    /* ---- the wall as the server has it ---- */
    let have: { no: number; rev: number; after: number } | null = null;
    const known = new Set<number>();
    /** finished marks not yet sent */
    let queued: Stroke[] = [];
    /** ids of the marks this visit put on the wall, oldest first, for Undo */
    let mine: number[] = [];
    let sending = 0;
    let loading = false;
    /** a load asked for while one was running; true if it has to start over */
    let rerun: boolean | null = null;
    let flushTimer = 0;
    const countMine = () => setUndoable(mine.length + queued.length);

    const blank = (theme: string) => {
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.fillStyle = PAPER;
      octx.fillRect(0, 0, off.width, off.height);
      outline(theme).forEach((s) => drawStroke(octx, s, K));
    };
    const load = async (fresh = false) => {
      if (gone) return;
      if (loading) {
        rerun = (rerun ?? false) || fresh;
        return;
      }
      loading = true;
      try {
        const w = await liveWall(fresh || !have ? undefined : have);
        // a mark of ours on its way would come back twice; the next look gets it
        if (gone || (sending && !w.fresh)) return;
        // a new wall: what Undo had is on the old one
        if (have && w.no !== have.no) {
          mine = [];
          countMine();
        }
        if (w.fresh || !have) {
          if (w.picture) {
            const img = new Image();
            img.src = w.picture;
            await img.decode();
            if (gone) return;
            octx.setTransform(1, 0, 0, 1, 0, 0);
            octx.drawImage(img, 0, 0, off.width, off.height);
          } else blank(w.theme);
          known.clear();
        }
        let after = w.fresh ? w.after : Math.max(w.after, have?.after ?? 0);
        for (const m of w.marks) {
          after = Math.max(after, m.id);
          if (known.has(m.id)) continue;
          known.add(m.id);
          drawStroke(octx, m.s as Stroke, K);
        }
        // marks not sent yet stay on top
        if (w.fresh) queued.forEach((s) => drawStroke(octx, s, K));
        have = { no: w.no, rev: w.rev, after };
        setInfo({ no: w.no, theme: w.theme, title: w.title, ends: w.ends, count: w.count, artists: w.artists });
        setState("live");
        paint();
      } catch {
        if (!have) {
          // nothing from the server: the subject on its own, to look at
          blank(themeFor(1).id);
          paint();
          setState("offline");
        }
      } finally {
        loading = false;
        if (rerun !== null) {
          const again = rerun;
          rerun = null;
          void load(again);
        }
      }
    };
    reload.current = load;

    undo.current = async () => {
      if (queued.length) {
        // not sent yet: it only has to come off this page
        queued.pop();
        countMine();
        return load(true);
      }
      const id = mine.pop();
      countMine();
      if (id === undefined) return;
      try {
        await takeBack(id);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "That mark didn't come off. Try again.");
      }
      setInfo((i) => (i ? { ...i, count: Math.max(0, i.count - 1) } : i));
      await load(true);
    };

    const flush = async () => {
      flushTimer = 0;
      if (!have || !queued.length) return;
      const batch = queued.splice(0, 20);
      sending++;
      try {
        const r = await addMarks(have.no, batch);
        r.ids.forEach((id) => known.add(id));
        // only the last 50 can be taken back
        mine = [...mine, ...r.ids].slice(-50);
        countMine();
        setInfo((i) => (i ? { ...i, count: i.count + r.ids.length } : i));
        sending--;
      } catch (e) {
        sending--;
        const closed = e instanceof Error && /closed/.test(e.message);
        setMsg(closed ? "That wall just closed and a new one is up; your last marks didn't make it onto the old one." : e instanceof Error ? e.message : "Your marks didn't reach the server.");
        queued = [];
        countMine();
        // what wasn't kept comes off the page
        await load(true);
        return;
      }
      if (queued.length) void flush();
    };

    /* ---- looking ---- */
    const paint = () => {
      const ctx = wc.getContext("2d")!;
      const dpr = wc.width / Math.max(1, wbox.clientWidth);
      const s = view.s * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, wc.width, wc.height);
      ctx.setTransform(s / K, 0, 0, s / K, -view.ox * s, -view.oy * s);
      ctx.drawImage(off, 0, 0);
      if (cur) {
        ctx.setTransform(s, 0, 0, s, -view.ox * s, -view.oy * s);
        drawStroke(ctx, cur, 1);
      }
    };
    const fit = () => {
      const r = wbox.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      wc.width = Math.round(r.width * dpr);
      wc.height = Math.round(r.height * dpr);
      view.s = Math.max(r.width / WALL.w, r.height / WALL.h);
      view.ox = Math.max(0, Math.min(WALL.w - r.width / view.s, (WALL.w - r.width / view.s) / 2));
      view.oy = Math.max(0, (WALL.h - r.height / view.s) / 2);
      ringSize.current();
      paint();
    };
    ringSize.current = () => {
      const { tool: t, size: sz } = cfg.current;
      const d = Math.max(6, sz * (t === "hand" || t === "pick" ? 1 : TOOLS[t].reach) * view.s);
      ring.current!.style.width = ring.current!.style.height = d + "px";
    };
    const toWall = (e: PointerEvent): [number, number] => {
      const r = wbox.getBoundingClientRect();
      return [view.ox + (e.clientX - r.left) / view.s, view.oy + (e.clientY - r.top) / view.s];
    };

    /* ---- moving around, and a mod's pick ---- */
    let pan: { x: number; y: number; ox: number; oy: number; id: number } | null = null;
    let pick: { x: number; y: number; id: number; to: [number, number] } | null = null;
    const showBand = () => {
      const b = band.current!;
      if (!pick) return void (b.hidden = true);
      const x0 = Math.min(pick.x, pick.to[0]), y0 = Math.min(pick.y, pick.to[1]);
      b.hidden = false;
      b.style.transform = `translate(${(x0 - view.ox) * view.s}px, ${(y0 - view.oy) * view.s}px)`;
      b.style.width = Math.abs(pick.to[0] - pick.x) * view.s + "px";
      b.style.height = Math.abs(pick.to[1] - pick.y) * view.s + "px";
    };
    const onDown = (e: PointerEvent) => {
      const t = cfg.current.tool;
      if (t === "hand") {
        pan = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy, id: e.pointerId };
        wbox.setPointerCapture(e.pointerId);
      } else if (t === "pick" && have) {
        const [x, y] = toWall(e);
        pick = { x, y, id: e.pointerId, to: [x, y] };
        wbox.setPointerCapture(e.pointerId);
        showBand();
      }
    };
    const onMove = (e: PointerEvent) => {
      const r = wbox.getBoundingClientRect();
      ring.current!.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px) translate(-50%, -50%)`;
      if (pan && e.pointerId === pan.id) {
        view.ox = Math.max(0, Math.min(WALL.w - r.width / view.s, pan.ox - (e.clientX - pan.x) / view.s));
        view.oy = Math.max(0, Math.min(WALL.h - r.height / view.s, pan.oy - (e.clientY - pan.y) / view.s));
        paint();
      }
      if (pick && e.pointerId === pick.id) {
        pick.to = toWall(e);
        showBand();
      }
    };
    const onUp = (e: PointerEvent) => {
      pan = null;
      if (pick && e.pointerId === pick.id && have) {
        const b: Box = {
          x: Math.min(pick.x, pick.to[0]),
          y: Math.min(pick.y, pick.to[1]),
          w: Math.max(8, Math.abs(pick.to[0] - pick.x)),
          h: Math.max(8, Math.abs(pick.to[1] - pick.y)),
        };
        pick = null;
        marksIn(have.no, b).then(
          (marks) => {
            if (marks.length) return setPicked(marks);
            band.current!.hidden = true;
            setMsg("No marks there. Drag across the marks you want to rub out.");
          },
          (err: unknown) => {
            band.current!.hidden = true;
            setMsg(err instanceof Error ? err.message : "That didn't work.");
          },
        );
      }
    };
    wbox.addEventListener("pointerdown", onDown);
    wbox.addEventListener("pointermove", onMove);
    wbox.addEventListener("pointerup", onUp);

    /* ---- drawing ---- */
    const stopCapture = capture(wbox, {
      toLocal: toWall,
      start: () => {
        const c = cfg.current;
        if (c.tool === "hand" || c.tool === "pick" || !have) return false;
        if (!c.member) {
          setMsg(
            <>
              Only members draw on the wall. <Link to="/account">Sign in</Link> to leave a mark; Tilo is invite-only for now.
            </>,
          );
          return false;
        }
        cur = { tool: c.tool, c: c.color, w: c.size, p: [] };
      },
      point: (x, y, pr) => {
        if (!cur || cur.p.length >= WALL_POINTS * 3) return;
        cur.p.push(Math.round(x), Math.round(y), pr);
        paint();
      },
      end: () => {
        const s = cur;
        cur = null;
        if (s && s.p.length) {
          drawStroke(octx, s, K);
          queued.push(s);
          countMine();
          if (flushTimer) clearTimeout(flushTimer);
          flushTimer = window.setTimeout(() => void flush(), queued.length >= 20 ? 0 : 500);
        }
        paint();
      },
    });

    /* ---- staying current ---- */
    let onScreen = true;
    const io = new IntersectionObserver(([e]) => (onScreen = e.isIntersecting));
    io.observe(wbox);
    const poll = window.setInterval(() => {
      if (!document.hidden && onScreen && !cur && !queued.length) void load();
    }, POLL_MS);
    const back = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", back);
    // Cmd/Ctrl+Z takes back your last mark, while the pointer is over the wall
    let over = false;
    const enter = () => (over = true), leave = () => (over = false);
    wbox.addEventListener("pointerenter", enter);
    wbox.addEventListener("pointerleave", leave);
    const onKey = (e: KeyboardEvent) => {
      if (!over || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      e.preventDefault();
      void undo.current();
    };
    addEventListener("keydown", onKey);

    const ro = new ResizeObserver(fit);
    ro.observe(wbox);
    if (WALL_LIVE) void load();
    else {
      blank(themeFor(1).id);
      paint();
    }
    return () => {
      gone = true;
      if (flushTimer) {
        clearTimeout(flushTimer);
        void flush();
      }
      ro.disconnect();
      io.disconnect();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", back);
      removeEventListener("keydown", onKey);
      wbox.removeEventListener("pointerenter", enter);
      wbox.removeEventListener("pointerleave", leave);
      stopCapture();
      wbox.removeEventListener("pointerdown", onDown);
      wbox.removeEventListener("pointermove", onMove);
      wbox.removeEventListener("pointerup", onUp);
    };
  }, []);

  useEffect(() => ringSize.current(), [tool, size]);
  // the clock under the wall
  useEffect(() => {
    const t = setInterval(() => tickClock((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const subject = info ? themeById(info.theme) : themeFor(1);
  const tools: WallTool[] = ["pencil", "ink", "marker", "hand", ...(page && isMod ? (["pick"] as WallTool[]) : [])];
  const closePick = () => {
    setPicked(null);
    band.current!.hidden = true;
  };
  const label = (t: WallTool) => (t === "hand" ? "Move around the wall" : t === "pick" ? "Pick out marks to rub off (mods)" : TOOLS[t].label);

  return (
    <div className="wall-shell">
      <div className="wall-frame plate reg">
        <div className={`wall${tool === "hand" ? " panning" : tool === "pick" ? " picking" : ""}`} ref={box}>
          <canvas ref={cv} role="img" aria-label={`The wall: ${subject.title}, an outline with marks from many people`} />
          <p className="wall-note serif">
            <b>{subject.title}.</b> {subject.prompt}
          </p>
          <div className="ring" ref={ring} />
          <div className="wall-band" ref={band} hidden />
        </div>
      </div>
      <div className="tray" role="toolbar" aria-label="Wall tools">
        <div className="tray-grp">
          {tools.map((t) => (
            <button key={t} className="tool" aria-pressed={tool === t} aria-label={label(t)} title={label(t)} onClick={() => setTool(t)}>
              <Icon name={t === "pick" ? "select" : t} />
            </button>
          ))}
        </div>
        <div className="tray-grp">
          {WALL_COLORS.map((c) => (
            <button key={c} className="chip-btn" aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => { setColor(c); if (tool === "hand" || tool === "pick") setTool("ink"); }}>
              <span className="chip" style={{ ["--c" as string]: c }} />
            </button>
          ))}
        </div>
        <div className="tray-grp">
          {SIZES.map(([v, px]) => (
            <button key={v} className="size" aria-pressed={size === v} aria-label={`Brush size ${v}`} onClick={() => setSize(v)}>
              <i style={{ width: px, height: px }} />
            </button>
          ))}
        </div>
        {profile && (
          <div className="tray-grp">
            <button
              className="tool"
              aria-label="Take back your last mark"
              title="Take back your last mark"
              disabled={!undoable || undoing}
              onClick={async () => {
                setUndoing(true);
                try {
                  await undo.current();
                } finally {
                  setUndoing(false);
                }
              }}
            >
              <Icon name="undo" />
            </button>
          </div>
        )}
        <div className="tray-status kicker">
          {state === "live" && info ? (
            <>
              <span className="live">Wall No. {info.no}</span>
              <span>
                {info.count.toLocaleString()} mark{info.count === 1 ? "" : "s"}
                {info.artists ? ` by ${info.artists.toLocaleString()} ${info.artists === 1 ? "person" : "people"}` : ""}
              </span>
            </>
          ) : (
            <span className="live is-off">{state === "loading" ? "Opening the wall" : "Not connected"}</span>
          )}
        </div>
      </div>
      <p className="wall-msg serif" role="status">
        {msg ? (
          <>
            {msg} <button className="link-btn" onClick={() => setMsg(null)}>OK</button>
          </>
        ) : (
          <>
            {state === "live" && info
              ? `A new subject goes up in ${timeLeft(info.ends)}, at midnight in Tbilisi, and this wall goes into the archive. `
              : state === "offline"
                ? "The shared wall didn't load, so this is its subject on its own. "
                : ""}
            The outline is by Claude, an AI; every mark on it is by hand.{!page && <> <Link to="/wall/past">See past walls</Link></>}
          </>
        )}
      </p>
      {page && info && profile && (
        <div className="row row-start wall-actions">
          <ReportButton target={{ wall: info.no }} label={`Wall No. ${info.no}`} />
        </div>
      )}
      {picked && info && (
        <PickDialog
          no={info.no}
          marks={picked}
          onClose={closePick}
          onDone={() => {
            closePick();
            void reload.current(true);
          }}
        />
      )}
    </div>
  );
}

/** What a mod picked out: whose marks they are, and rubbing them off. */
function PickDialog({ no, marks, onClose, onDone }: { no: number; marks: FoundMark[]; onClose: () => void; onDone: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => dlg.current?.showModal(), []);
  const people = [...marks.reduce((m, k) => m.set(k.handle, (m.get(k.handle) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const ids = marks.filter((m) => !skip.has(m.handle)).map((m) => m.id);
  const toggle = (handle: string) =>
    setSkip((s) => {
      const t = new Set(s);
      if (t.has(handle)) t.delete(handle);
      else t.add(handle);
      return t;
    });
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      await moderateWall(no, "erase", ids, note);
      dlg.current?.close();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
      setBusy(false);
    }
  };
  return (
    <dialog ref={dlg} aria-labelledby="pick-h" onClose={onClose}>
      <form className="small-sheet sheet" onSubmit={(e) => { e.preventDefault(); void go(); }}>
        <h2 id="pick-h">Rub out {ids.length} mark{ids.length === 1 ? "" : "s"}</h2>
        <fieldset className="report-reasons">
          <legend className="kicker">Whose</legend>
          {people.map(([handle, n]) => (
            <label key={handle} className="check">
              <input type="checkbox" checked={!skip.has(handle)} onChange={() => toggle(handle)} />
              <span><b>@{handle}</b><span className="field-note"> {n} mark{n === 1 ? "" : "s"}</span></span>
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span className="kicker">Note<span className="field-optional">optional, for the log</span></span>
          <input value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <p className="field-note is-error" role="alert">{error}</p>}
        <div className="row">
          <button type="button" className="btn btn-quiet" onClick={() => dlg.current?.close()}>Cancel</button>
          <button className="btn btn-ink" disabled={busy || !ids.length}>{busy ? "Rubbing out…" : "Rub them out"}</button>
        </div>
      </form>
    </dialog>
  );
}
