import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Icon } from "../components/Icon";
import { ReplayCanvas } from "../components/ReplayCanvas";
import { draft, pieceById, pinPiece } from "../data/local";
import { PROMPT } from "../data/samples";
import { capture } from "../engine/capture";
import { drawStroke, fmtMin, SHEET, TOOLS, type Stroke, type ToolId } from "../engine/stroke";

const NO_STROKES: Stroke[] = [];
const FREE = ["#1B1E1D", "#5B5F66", "#2B37D4", "#3FA7D6", "#3E7C6B", "#8DBF5A", "#F2C14E", "#E26D3D", "#C9392F", "#A1386B", "#7A4E2D", "#FFFFFF"];

/* Studio carried over from prototype 0.1. Stage 1 replaces the brush engine and adds layers. */
export function Studio() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const remix = params.get("remix") ? pieceById(params.get("remix")!) : undefined;
  const [promptMode, setPromptMode] = useState(params.get("prompt") === String(PROMPT.no));
  const [tool, setTool] = useState<ToolId>("ink");
  const [color, setColor] = useState(promptMode ? PROMPT.palette[0] : FREE[0]);
  const [size, setSize] = useState(8);
  const [strokes, setStrokes] = useState<Stroke[]>(() => (remix ? [] : draft.load().strokes));
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [ms, setMs] = useState(() => (remix ? 0 : draft.load().ms));
  const [toast, setToast] = useState("");
  const base = remix?.strokes ?? NO_STROKES;

  const cv = useRef<HTMLCanvasElement>(null);
  const sheetBox = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const committed = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const cur = useRef<Stroke | null>(null);
  const lastUp = useRef(0);
  const cfg = useRef({ tool, color, size });
  cfg.current = { tool, color, size };
  const pinDlg = useRef<HTMLDialogElement>(null);
  const clearDlg = useRef<HTMLDialogElement>(null);
  const replayDlg = useRef<HTMLDialogElement>(null);
  const [replayKey, setReplayKey] = useState(0);
  const [title, setTitle] = useState("");
  const [enter, setEnter] = useState(true);

  const palette = promptMode ? PROMPT.palette : FREE;
  const timeLeft = PROMPT.minutes * 60000 - ms;

  const say = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast(""), 2600);
  };

  const paint = useCallback(() => {
    const ctx = cv.current!.getContext("2d")!;
    ctx.clearRect(0, 0, SHEET.w, SHEET.h);
    const c = cur.current;
    if (c && c.tool === "eraser") {
      const tmp = document.createElement("canvas");
      tmp.width = SHEET.w;
      tmp.height = SHEET.h;
      const t = tmp.getContext("2d")!;
      t.drawImage(committed.current, 0, 0);
      drawStroke(t, c);
      ctx.drawImage(tmp, 0, 0);
      return;
    }
    ctx.drawImage(committed.current, 0, 0);
    if (c) drawStroke(ctx, c);
  }, []);

  const rebuild = useCallback((list: Stroke[]) => {
    const c = committed.current;
    c.width = SHEET.w;
    c.height = SHEET.h;
    const ctx = c.getContext("2d")!;
    base.forEach((s) => drawStroke(ctx, s));
    list.forEach((s) => drawStroke(ctx, s));
    paint();
  }, [base, paint]);

  useEffect(() => rebuild(strokes), [strokes, rebuild]);
  useEffect(() => {
    if (!remix) draft.save(strokes, ms);
  }, [strokes, ms, remix]);
  useEffect(() => {
    if (!palette.includes(color)) setColor(palette[0]);
  }, [palette, color]);

  // fit the sheet into the available space at 4:3
  useEffect(() => {
    const box = sheetBox.current!;
    const fit = () => {
      const r = box.getBoundingClientRect();
      const pad = innerWidth < 860 ? 20 : 48;
      const w = Math.max(200, Math.min(r.width - pad, ((r.height - pad) * 4) / 3));
      cv.current!.style.width = w + "px";
      cv.current!.style.height = (w * 3) / 4 + "px";
    };
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // drawing
  useEffect(() => {
    const c = cv.current!;
    return capture(c, {
      toLocal: (e) => {
        const r = c.getBoundingClientRect();
        return [((e.clientX - r.left) / r.width) * SHEET.w, ((e.clientY - r.top) / r.height) * SHEET.h];
      },
      start: () => {
        const k = cfg.current;
        cur.current = { tool: k.tool, c: k.color, w: k.size, p: [] };
      },
      point: (x, y, pr) => {
        cur.current?.p.push(Math.round(x), Math.round(y), pr);
        paint();
      },
      end: () => {
        const s = cur.current;
        cur.current = null;
        lastUp.current = performance.now();
        if (s && s.p.length) {
          drawStroke(committed.current.getContext("2d")!, s);
          setStrokes((list) => [...list, s]);
          setRedo([]);
        }
        paint();
      },
    });
  }, [paint]);

  // drawing time: pen down, plus short pauses between strokes
  useEffect(() => {
    const t = setInterval(() => {
      if (cur.current || (lastUp.current && performance.now() - lastUp.current < 4000)) setMs((m) => m + 250);
    }, 250);
    return () => clearInterval(t);
  }, []);

  const moveRing = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    const d = Math.max(6, size * TOOLS[tool].reach * (r.width / SHEET.w));
    const el = ring.current!;
    el.style.width = el.style.height = d + "px";
    el.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px) translate(-50%, -50%)`;
  };

  const undo = () => {
    if (!strokes.length) return;
    setRedo((r) => [...r, strokes[strokes.length - 1]]);
    setStrokes((s) => s.slice(0, -1));
  };
  const redoOne = () => {
    if (!redo.length) return;
    setStrokes((s) => [...s, redo[redo.length - 1]]);
    setRedo((r) => r.slice(0, -1));
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]") || (e.target as HTMLElement).matches("input[type=text]")) return;
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redoOne();
        else undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = (Object.keys(TOOLS) as ToolId[]).find((id) => TOOLS[id].key === k);
      if (t) setTool(t);
      if (k === "[") setSize((s) => Math.max(1, s - 2));
      if (k === "]") setSize((s) => Math.min(40, s + 2));
      if (k === "escape") nav("/", { viewTransition: true });
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  const openPin = () => {
    if (!strokes.length) return say("The sheet is empty. Draw something first.");
    setTitle("");
    setEnter(promptMode && timeLeft > 0);
    pinDlg.current!.showModal();
  };
  const doPin = (e: React.FormEvent) => {
    e.preventDefault();
    pinPiece({
      id: "mine-" + Date.now().toString(36),
      title: title.trim() || "Untitled",
      by: "you",
      minutes: Math.max(0.1, ms / 60000),
      strokes: [...base, ...strokes],
      mine: true,
      stamps: {},
      tilt: -1.2,
      prompt: promptMode && enter && timeLeft > 0 ? PROMPT.no : undefined,
      remixOf: remix?.id,
    });
    pinDlg.current!.close();
    if (!remix) draft.save([], 0);
    nav("/gallery?sort=new", { viewTransition: true });
  };

  return (
    <div className="studio">
      <div className="studio-top">
        <button className="icon-btn" onClick={() => nav("/", { viewTransition: true })} aria-label="Back to Tilo"><Icon name="back" /></button>
        <div className="studio-title">
          {remix ? <>Remix<small>of “{remix.title}” by @{remix.by}</small></> : promptMode ? <>Prompt #{PROMPT.no} · {PROMPT.title}<small>6 colours · 10:00 on the clock, starts at your first stroke</small></> : <>Blank sheet<small>Free palette · no clock</small></>}
        </div>
        <span className="sp" />
        {promptMode && <span className={`timer mono${timeLeft < 60000 ? " is-warn" : ""}`}>{timeLeft > 0 ? fmtMin(timeLeft / 60000) : "Time's up"}</span>}
        <button className="btn btn-mat" onClick={() => { if (!strokes.length && !base.length) return say("Draw something first, then watch it back"); setReplayKey((k) => k + 1); replayDlg.current!.showModal(); }} aria-label="Replay your sheet"><Icon name="replay" /><span className="hide-s">Replay</span></button>
        <button className="btn btn-ink" onClick={openPin}><Icon name="pin" />Pin to gallery</button>
      </div>

      <div className="studio-tools" role="toolbar" aria-label="Brushes">
        {(Object.keys(TOOLS) as ToolId[]).map((t) => (
          <button key={t} className="tool" aria-pressed={tool === t} aria-label={`${TOOLS[t].label} (${TOOLS[t].key.toUpperCase()})`} title={`${TOOLS[t].label} · ${TOOLS[t].key.toUpperCase()}`} onClick={() => setTool(t)}>
            <Icon name={t} />
          </button>
        ))}
        <hr />
        <button className="icon-btn" onClick={undo} disabled={!strokes.length} aria-label="Undo" title="Undo · ⌘Z"><Icon name="undo" /></button>
        <button className="icon-btn" onClick={redoOne} disabled={!redo.length} aria-label="Redo" title="Redo · ⇧⌘Z"><Icon name="redo" /></button>
        <button className="icon-btn" onClick={() => strokes.length && clearDlg.current!.showModal()} aria-label="Clear the sheet" title="Clear"><Icon name="trash" /></button>
      </div>

      <div className="studio-sheet" ref={sheetBox}>
        {remix && <p className="remix-banner">Remixing “{remix.title}” by @{remix.by}. Their strokes are the base and can't be undone.</p>}
        <div className="studio-paper" onPointerMove={moveRing}>
          <canvas ref={cv} width={SHEET.w} height={SHEET.h} role="img" aria-label="Your drawing sheet" />
          <div className="ring" ref={ring} />
        </div>
      </div>

      <aside className="studio-panel" aria-label="Sheet settings">
        <div className="sheet panel-card">
          <h3 className="mono caps">Colour</h3>
          <div className="pal">
            {palette.map((c, i) => (
              <button key={c} className="chip-btn" aria-pressed={c === color} aria-label={`Colour ${promptMode ? PROMPT.names[i] : c}`} onClick={() => setColor(c)}>
                <span className="chip" style={{ ["--c" as string]: c }} />
              </button>
            ))}
          </div>
          {!remix && (
            <label className="check"><input type="checkbox" id="lock" checked={promptMode} onChange={(e) => setPromptMode(e.target.checked)} /> Use Prompt #{PROMPT.no} colours only</label>
          )}
          {!promptMode && <label className="custom">Mix your own <input type="color" id="custom" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} /></label>}
        </div>
        <div className="sheet panel-card">
          <h3 className="mono caps">Brush size</h3>
          <div className="sizer">
            <input type="range" id="size" min={1} max={40} value={size} onChange={(e) => setSize(+e.target.value)} aria-label="Brush size" />
            <span className="dot"><i style={{ width: Math.max(3, Math.min(44, size * 1.1)), height: Math.max(3, Math.min(44, size * 1.1)) }} /></span>
          </div>
        </div>
        <div className="sheet panel-card">
          <h3 className="mono caps">This sheet</h3>
          <div className="stats">
            <div><b>{(strokes.length + base.length).toLocaleString()}</b><span>strokes</span></div>
            <div><b>{fmtMin(ms / 60000)}</b><span>drawing time</span></div>
          </div>
        </div>
        <div className="sheet panel-card opt">
          <h3 className="mono caps">Keys</h3>
          <p className="keys"><kbd>P</kbd> pencil <kbd>I</kbd> ink <kbd>M</kbd> marker <kbd>W</kbd> wash <kbd>E</kbd> eraser <kbd>[</kbd> <kbd>]</kbd> size <kbd>⌘Z</kbd> undo <kbd>⇧⌘Z</kbd> redo</p>
        </div>
      </aside>

      <dialog ref={pinDlg} aria-labelledby="pin-h">
        <form className="small-sheet sheet tape" onSubmit={doPin}>
          <h2 id="pin-h">Pin to the gallery</h2>
          <p>Your piece goes up with its full recording. Until accounts open, it stays on this device.</p>
          <div className="field"><label htmlFor="pin-title">Title</label><input type="text" id="pin-title" maxLength={60} placeholder="Untitled" autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          {promptMode && (
            <label className="check"><input type="checkbox" id="pin-enter" checked={enter} disabled={timeLeft <= 0} onChange={(e) => setEnter(e.target.checked)} /> {timeLeft > 0 ? `Enter it in Prompt #${PROMPT.no}` : "Over the 10:00 limit, so it can't be entered"}</label>
          )}
          <div className="row"><button type="button" className="btn btn-quiet" onClick={() => pinDlg.current!.close()}>Keep drawing</button><button type="submit" className="btn btn-ink">Pin it</button></div>
        </form>
      </dialog>

      <dialog ref={clearDlg} aria-labelledby="clear-h">
        <div className="small-sheet sheet">
          <h2 id="clear-h">Start over?</h2>
          <p>This removes every stroke on the sheet, including its recording. Undo won't bring it back.</p>
          <div className="row">
            <button className="btn btn-quiet" onClick={() => clearDlg.current!.close()}>Keep it</button>
            <button className="btn btn-ink" onClick={() => { setStrokes([]); setRedo([]); setMs(0); clearDlg.current!.close(); say("Sheet cleared"); }}>Clear the sheet</button>
          </div>
        </div>
      </dialog>

      <dialog ref={replayDlg} className="replay-dlg" aria-label="Replay of your sheet" onClick={(e) => e.target === e.currentTarget && replayDlg.current!.close()}>
        <div className="replay-box sheet">
          <ReplayCanvas key={replayKey} strokes={[...base, ...strokes]} mode="once" label="Your sheet, replaying" />
          <div className="row"><span className="mono">{strokes.length + base.length} STROKES · {fmtMin(ms / 60000)}</span><button className="btn btn-quiet" onClick={() => replayDlg.current!.close()}>Close</button></div>
        </div>
      </dialog>

      <div className="toast" role="status" data-show={toast ? "" : undefined}>{toast}</div>
    </div>
  );
}
