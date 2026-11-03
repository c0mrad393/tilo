import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLoaderData, useNavigate, type LoaderFunctionArgs, type ShouldRevalidateFunctionArgs } from "react-router";
import { Icon } from "../components/Icon";
import { ReplayCanvas } from "../components/ReplayCanvas";
import { blankSheet, lastSheet, library, migrateDraft, type Guides, type Sheet } from "../data/library";
import { pieceById, pinPiece } from "../data/local";
import { PROMPT } from "../data/samples";
import { download, fileName, pictureBlob, thumbnail, timelapse, videoType } from "../engine/export";
import { drawGuides, handleAt, snapDirection } from "../engine/guides";
import { Painter } from "../engine/painter";
import { PAPER_IDS, PAPERS, type PaperId } from "../engine/paper";
import { SYMMETRY } from "../engine/symmetry";
import { BASE_LAYER, fmtMin, layersOf, SHEET, TOOLS, type Blend, type LayerDef, type Stroke, type ToolGroup, type ToolId } from "../engine/stroke";

const NO_STROKES: Stroke[] = [];
const FREE = ["#1B1E1D", "#5B5F66", "#2B37D4", "#3FA7D6", "#3E7C6B", "#8DBF5A", "#F2C14E", "#E26D3D", "#C9392F", "#A1386B", "#7A4E2D", "#FFFFFF"];
const GROUPS: [ToolGroup, string][] = [["draw", "Draw"], ["paint", "Paint"], ["shape", "Shape"], ["fix", "Fix"]];
const BLENDS: [Blend, string][] = [["source-over", "Normal"], ["multiply", "Multiply"], ["screen", "Screen"], ["overlay", "Overlay"], ["soft-light", "Soft light"], ["darken", "Darken"], ["lighten", "Lighten"], ["color-burn", "Colour burn"]];
const SEEDED = new Set<ToolId>(["charcoal", "spray", "oil"]);
const NO_SNAP = new Set<ToolId>(["fill", "lasso", "smudge"]);
const PERSPECTIVE = [[0, "Off"], [1, "1 point"], [2, "2 point"]] as const;
const MAX_LAYERS = 8;

type View = { s: number; ox: number; oy: number };

/* ---------- which sheet the studio opens ---------- */

let openSheet = "";

/** /studio resumes the sheet you were on; ?sheet=id opens one from the library; ?new, ?remix=id
    and ?prompt=no start a fresh one. A fresh sheet is only saved once something is drawn. */
export async function studioLoader({ request }: LoaderFunctionArgs): Promise<Sheet> {
  await migrateDraft();
  const q = new URL(request.url).searchParams;
  const remix = q.get("remix") && pieceById(q.get("remix")!);
  if (remix) {
    const own = layersOf(remix);
    const top: LayerDef = { id: Math.max(...own.map((l) => l.id)) + 1, name: "Your layer", blend: "source-over", opacity: 1 };
    return blankSheet({ remixOf: remix.id, paper: remix.paper ?? "smooth", layers: [...own, top], title: `After “${remix.title}”` });
  }
  if (q.get("prompt") === String(PROMPT.no)) return blankSheet({ subject: true });
  const id = q.get("sheet") ?? (q.has("new") ? null : lastSheet.get());
  if (id) {
    try {
      const s = await library.get(id);
      if (s) return { ...s, thumb: undefined }; // the studio makes its own picture
    } catch {
      // no IndexedDB here: start fresh, and the studio says it can't keep sheets
    }
  }
  return blankSheet();
}
/* swapping the address to ?sheet=<the open sheet> after its first save shouldn't reload it */
export const studioShouldRevalidate = ({ nextUrl }: ShouldRevalidateFunctionArgs) => nextUrl.searchParams.get("sheet") !== openSheet || !openSheet;

export function StudioRoute() {
  const sheet = useLoaderData() as Sheet;
  return <Studio key={sheet.id} sheet={sheet} />;
}

/* ---------- the studio ---------- */

/* Everything drawn goes through a Painter, one canvas per layer at sheet size; the screen
   shows it through a zoomable view. The sheet saves itself to the library as you work. */
function Studio({ sheet }: { sheet: Sheet }) {
  const nav = useNavigate();
  const remix = sheet.remixOf ? pieceById(sheet.remixOf) : undefined;
  const [promptMode, setPromptMode] = useState(!!sheet.subject);
  const [tool, setTool] = useState<ToolId>("ink");
  const [color, setColor] = useState(promptMode ? PROMPT.palette[0] : FREE[0]);
  const [size, setSize] = useState(8);
  const [opacity, setOpacity] = useState(1);
  const [sym, setSym] = useState("");
  const [layers, setLayers] = useState<LayerDef[]>(() => (sheet.layers.length ? sheet.layers : [BASE_LAYER]));
  const [active, setActive] = useState(() => layers[layers.length - 1].id);
  const [strokes, setStrokes] = useState<Stroke[]>(sheet.strokes);
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [ms, setMs] = useState(sheet.ms);
  const [paper, setPaper] = useState<PaperId>(sheet.paper);
  const [guides, setGuides] = useState<Guides>(sheet.guides);
  const [sheetTitle, setSheetTitle] = useState(sheet.title);
  const [zoom, setZoom] = useState(100);
  const [toast, setToast] = useState("");
  const base = remix?.strokes ?? NO_STROKES;
  const baseLayers = useRef(new Set(base.map((s) => s.l ?? 0))).current;

  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const painter = useRef<Painter | null>(null);
  const applied = useRef<Stroke[] | null>(null); // the stroke list the painter currently holds
  const cur = useRef<Stroke | null>(null);
  const view = useRef<View>({ s: 0.5, ox: 0, oy: 0 });
  const lastUp = useRef(0);
  const cfg = useRef({ tool, color, size, opacity, sym, active, guides });
  cfg.current = { tool, color, size, opacity, sym, active, guides };
  const pinDlg = useRef<HTMLDialogElement>(null);
  const clearDlg = useRef<HTMLDialogElement>(null);
  const layerDlg = useRef<HTMLDialogElement>(null);
  const replayDlg = useRef<HTMLDialogElement>(null);
  const exportDlg = useRef<HTMLDialogElement>(null);
  const [doomed, setDoomed] = useState<LayerDef | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const [title, setTitle] = useState("");
  const [enter, setEnter] = useState(true);

  const palette = promptMode ? PROMPT.palette : FREE;
  const timeLeft = PROMPT.minutes * 60000 - ms;
  const toastTimer = useRef(0);
  const say = (t: string) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  };

  // ---------- drawing the screen ----------
  const raf = useRef(0);
  const render = useCallback(() => {
    raf.current = 0;
    const c = cv.current, p = painter.current;
    if (!c || !p) return;
    const ctx = c.getContext("2d")!;
    const dpr = c.width / Math.max(1, c.clientWidth);
    const { s, ox, oy } = view.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 22 * dpr;
    ctx.shadowOffsetY = 8 * dpr;
    ctx.fillStyle = PAPERS[p.paper ?? "smooth"].color;
    ctx.fillRect(0, 0, SHEET.w, SHEET.h);
    ctx.restore();
    p.render(ctx, cur.current ? { stroke: cur.current } : undefined);
    const m = cfg.current.sym;
    if (m) {
      // symmetry guides, a hairline at any zoom
      ctx.save();
      ctx.strokeStyle = "rgba(238,58,140,0.6)";
      ctx.lineWidth = 1 / s;
      ctx.setLineDash([6 / s, 6 / s]);
      ctx.beginPath();
      const cx = SHEET.w / 2, cy = SHEET.h / 2;
      if (m.includes("v")) ctx.moveTo(cx, 0), ctx.lineTo(cx, SHEET.h);
      if (m.includes("h")) ctx.moveTo(0, cy), ctx.lineTo(SHEET.w, cy);
      if (m[0] === "r") {
        const n = parseInt(m.slice(1)) || 6;
        for (let j = 0; j < n; j++) {
          const a = (j / n) * Math.PI * 2 - Math.PI / 2;
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * 900, cy + Math.sin(a) * 900);
        }
      }
      ctx.stroke();
      ctx.restore();
    }
    drawGuides(ctx, cfg.current.guides, s);
  }, []);
  const redraw = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(render);
  }, [render]);

  const fit = useCallback(() => {
    const b = box.current!;
    const pad = innerWidth < 860 ? 12 : 32;
    const s = Math.max(0.05, Math.min((b.clientWidth - pad * 2) / SHEET.w, (b.clientHeight - pad * 2) / SHEET.h));
    view.current = { s, ox: (b.clientWidth - SHEET.w * s) / 2, oy: (b.clientHeight - SHEET.h * s) / 2 };
    setZoom(Math.round(s * 100));
    redraw();
  }, [redraw]);
  const zoomAt = useCallback((f: number, cx: number, cy: number) => {
    const v = view.current;
    const s = Math.max(0.1, Math.min(8, v.s * f));
    view.current = { s, ox: cx - (cx - v.ox) * (s / v.s), oy: cy - (cy - v.oy) * (s / v.s) };
    setZoom(Math.round(s * 100));
    redraw();
  }, [redraw]);
  const zoomCentre = (f: number) => zoomAt(f, box.current!.clientWidth / 2, box.current!.clientHeight / 2);

  // ---------- the painter follows the stroke list, the layer stack and the paper ----------
  if (!painter.current) painter.current = new Painter(SHEET.w, SHEET.h, 1, layers, paper);
  const rebuild = useCallback(() => {
    const p = painter.current!;
    p.clear();
    base.forEach((s) => p.apply(s));
    (applied.current ?? []).forEach((s) => p.apply(s));
    redraw();
  }, [base, redraw]);
  useEffect(() => {
    painter.current!.setLayers(layers);
    redraw();
  }, [layers, redraw]);
  useEffect(() => {
    if (applied.current === strokes) return;
    applied.current = strokes;
    rebuild();
  }, [strokes, rebuild]);
  useEffect(() => {
    const p = painter.current!;
    if (p.paper === paper) return;
    // charcoal catches on the paper's tooth, so a new paper redraws the strokes too
    p.paper = paper;
    rebuild();
  }, [paper, rebuild]);
  useEffect(() => {
    if (!palette.includes(color) && promptMode) setColor(palette[0]);
  }, [palette, color, promptMode]);
  useEffect(redraw, [sym, guides, redraw]);

  const commit = useCallback((s: Stroke) => {
    s.t = Date.now();
    painter.current!.apply(s);
    const next = [...(applied.current ?? []), s];
    applied.current = next;
    setStrokes(next);
    setRedo([]);
    lastUp.current = performance.now();
    redraw();
  }, [redraw]);

  // ---------- saving to the library ----------
  const saved = useRef(sheet.count > 0 || sheet.updated !== sheet.created);
  const lastSave = useRef(0);
  const saveFailed = useRef(false);
  // fields set once and kept on every later save (pinning)
  const kept = useRef<Partial<Sheet>>({});
  // what the last save wrote, so an unchanged sheet isn't written again (and its date kept)
  const sig = [strokes, layers, ms, paper, guides, sheetTitle, promptMode];
  const savedSig = useRef<unknown[]>(sig);
  const snapshot = useRef<() => { snap: Sheet; sig: unknown[] }>(null!);
  snapshot.current = () => ({ snap: { ...sheet, title: sheetTitle, ms, strokes, layers, paper, guides, subject: promptMode, updated: Date.now(), ...kept.current }, sig });
  const save = useCallback(async (extra: Partial<Sheet> = {}) => {
    Object.assign(kept.current, extra);
    const { snap, sig } = snapshot.current();
    if (!saved.current && !snap.strokes.length) return;
    if (!Object.keys(extra).length && sig.every((v, i) => v === savedSig.current[i])) return;
    savedSig.current = sig;
    lastSave.current = Date.now();
    let thumb: Blob | undefined;
    try {
      thumb = await thumbnail(painter.current!);
    } catch {
      thumb = undefined;
    }
    try {
      await library.put({ ...snap, thumb });
      if (!saved.current) {
        saved.current = true;
        openSheet = snap.id;
        nav(`/studio?sheet=${snap.id}`, { replace: true });
      }
      if (!snap.pinned) lastSheet.set(snap.id);
    } catch {
      savedSig.current = [];
      if (!saveFailed.current) say("This browser won't let Tilo keep sheets, so export before you leave");
      saveFailed.current = true;
    }
  }, [nav]);
  useEffect(() => {
    openSheet = saved.current ? sheet.id : "";
    if (saved.current && !sheet.pinned) lastSheet.set(sheet.id);
  }, [sheet]);
  useEffect(() => {
    if (!saved.current && !strokes.length) return;
    // quiet while you draw, but never more than ten seconds behind
    const t = window.setTimeout(save, Date.now() - lastSave.current > 10000 ? 0 : 900);
    return () => clearTimeout(t);
  }, [strokes, layers, ms, paper, guides, sheetTitle, promptMode, save]);
  useEffect(() => {
    const flush = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      save();
    };
  }, [save]);

  // ---------- size the screen canvas ----------
  useEffect(() => {
    const b = box.current!, c = cv.current!;
    let first = true;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      c.width = Math.round(b.clientWidth * dpr);
      c.height = Math.round(b.clientHeight * dpr);
      if (first) {
        first = false;
        fit();
      } else redraw();
    });
    ro.observe(b);
    return () => ro.disconnect();
  }, [fit, redraw]);

  // ---------- pointers: draw with one, pan with space or the middle button, pinch with two ----------
  const spaceDown = useRef(false);
  useEffect(() => {
    const c = cv.current!, b = box.current!;
    const pts = new Map<number, { x: number; y: number; type: string }>();
    let drawing: number | null = null;
    let pan: { id: number; x: number; y: number; ox: number; oy: number } | null = null;
    let pinch: { d: number; mx: number; my: number; v: View } | null = null;
    let drag: { id: number; vp: number } | null = null;
    let penSeen = false;
    let last: [number, number] | null = null;
    let lastT = 0;
    let smooth = 0.6;
    // a straight stroke: "guide" snaps to the perspective, "free" (Shift) keeps its first heading
    let straight: "guide" | "free" | null = null;
    let lock: [number, number] | null = null;

    const local = (e: PointerEvent): [number, number] => {
      const r = b.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const toSheet = (e: PointerEvent): [number, number] => {
      const [x, y] = local(e);
      const v = view.current;
      return [(x - v.ox) / v.s, (y - v.oy) / v.s];
    };
    // pen tilt in degrees; azimuthAngle where the browser has it, else worked out from tiltX/Y
    const tiltOf = (e: PointerEvent): [number, number] => {
      const pe = e as PointerEvent & { altitudeAngle?: number; azimuthAngle?: number };
      let alt = pe.altitudeAngle, az = pe.azimuthAngle;
      if (alt === undefined || az === undefined) {
        const tx = Math.tan((e.tiltX * Math.PI) / 180), ty = Math.tan((e.tiltY * Math.PI) / 180);
        const l = Math.hypot(tx, ty);
        alt = l ? Math.atan(1 / l) : Math.PI / 2;
        az = Math.atan2(ty, tx);
      }
      return [Math.round(((az * 180) / Math.PI + 360) % 360), Math.round((alt * 180) / Math.PI)];
    };
    const feed = (e: PointerEvent) => {
      const s = cur.current;
      if (!s || s.p.length >= 12000) return;
      let [x, y] = toSheet(e);
      const t = e.timeStamp || performance.now();
      if (straight && s.p.length >= 3) {
        const sx = s.p[0], sy = s.p[1];
        if (!lock) {
          // wait until the stroke has a heading before choosing its line
          if (Math.hypot(x - sx, y - sy) * view.current.s < 12) return;
          const l = Math.hypot(x - sx, y - sy);
          lock = straight === "guide" ? snapDirection(cfg.current.guides, sx, sy, x, y) : [(x - sx) / l, (y - sy) / l];
        }
        const d = Math.max(0, (x - sx) * lock[0] + (y - sy) * lock[1]);
        x = sx + lock[0] * d;
        y = sy + lock[1] * d;
      }
      if (last && Math.hypot(x - last[0], y - last[1]) < 1.5 / view.current.s) return;
      let pr: number;
      if (e.pointerType === "pen" && e.pressure > 0) pr = e.pressure;
      else {
        // no pen: faster movement reads as lighter pressure
        const v = last ? (Math.hypot(x - last[0], y - last[1]) * view.current.s) / Math.max(1, t - lastT) : 0;
        smooth += (Math.max(0.22, Math.min(1, 1 - v * 0.18)) - smooth) * 0.35;
        pr = smooth;
      }
      last = [x, y];
      lastT = t;
      s.p.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(pr * 99));
      if (s.tl) s.tl.push(...tiltOf(e));
    };
    const moveRing = (e: PointerEvent) => {
      const [x, y] = local(e);
      const k = cfg.current;
      const d = Math.max(6, k.size * TOOLS[k.tool].reach * view.current.s);
      const el = ring.current!;
      el.style.width = el.style.height = d + "px";
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    };
    const startPinch = () => {
      const [a, z] = [...pts.values()];
      const r = b.getBoundingClientRect();
      pinch = { d: Math.hypot(a.x - z.x, a.y - z.y) || 1, mx: (a.x + z.x) / 2 - r.left, my: (a.y + z.y) / 2 - r.top, v: { ...view.current } };
    };

    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        // the pointer is already gone
      }
      if (e.pointerType === "pen") penSeen = true;
      const touches = [...pts.values()].filter((p) => p.type === "touch").length;
      if (touches >= 2) {
        // a second finger turns the gesture into a pinch and drops the stroke it started
        cur.current = null;
        drawing = null;
        pan = null;
        drag = null;
        startPinch();
        redraw();
        return;
      }
      if (e.button === 1 || spaceDown.current || (e.pointerType === "touch" && penSeen)) {
        pan = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: view.current.ox, oy: view.current.oy };
        b.classList.add("is-panning");
        return;
      }
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (drawing !== null) return;
      const k = cfg.current;
      const [x, y] = toSheet(e);
      const vp = k.guides.mode ? handleAt(k.guides, x, y, view.current.s, e.pointerType === "mouse" ? 14 : 24) : -1;
      if (vp >= 0) {
        drag = { id: e.pointerId, vp };
        b.classList.add("is-panning");
        return;
      }
      if (e.altKey) {
        setColor(painter.current!.pick(x, y));
        return;
      }
      const s: Stroke = { tool: k.tool, c: k.color, w: k.size, p: [], l: k.active };
      if (k.opacity < 1) s.a = Math.round(k.opacity * 100) / 100;
      if (k.sym) s.m = k.sym;
      if (SEEDED.has(k.tool)) s.r = Math.floor(Math.random() * 1e9);
      if (k.tool === "fill") {
        if (x < 0 || y < 0 || x > SHEET.w || y > SHEET.h) return;
        s.w = 1;
        s.p.push(Math.round(x), Math.round(y), 99);
        commit(s);
        return;
      }
      if (e.pointerType === "pen") s.tl = [];
      straight = NO_SNAP.has(k.tool) ? null : k.guides.mode && k.guides.snap ? "guide" : e.shiftKey ? "free" : null;
      lock = null;
      cur.current = s;
      drawing = e.pointerId;
      last = null;
      smooth = 0.6;
      feed(e);
      e.preventDefault();
      redraw();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "touch") moveRing(e);
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      if (pinch && pts.size >= 2) {
        const [a, z] = [...pts.values()];
        const r = b.getBoundingClientRect();
        const d = Math.hypot(a.x - z.x, a.y - z.y), mx = (a.x + z.x) / 2 - r.left, my = (a.y + z.y) / 2 - r.top;
        const s = Math.max(0.1, Math.min(8, pinch.v.s * (d / pinch.d)));
        view.current = { s, ox: mx - (pinch.mx - pinch.v.ox) * (s / pinch.v.s), oy: my - (pinch.my - pinch.v.oy) * (s / pinch.v.s) };
        setZoom(Math.round(s * 100));
        redraw();
        return;
      }
      if (pan && e.pointerId === pan.id) {
        view.current = { ...view.current, ox: pan.ox + e.clientX - pan.x, oy: pan.oy + e.clientY - pan.y };
        redraw();
        return;
      }
      if (drag && e.pointerId === drag.id) {
        const [x, y] = toSheet(e);
        const i = drag.vp;
        setGuides((g) => ({ ...g, vp: g.vp.map((p, j) => (j === i ? [Math.round(x), Math.round(y)] : p)) }));
        return;
      }
      if (drawing === e.pointerId && cur.current) {
        const list = e.getCoalescedEvents?.() ?? [];
        (list.length ? list : [e]).forEach(feed);
        redraw();
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pinch && pts.size < 2) pinch = null;
      if ((pan && e.pointerId === pan.id) || (drag && e.pointerId === drag.id)) {
        pan = null;
        drag = null;
        b.classList.remove("is-panning");
      }
      if (drawing === e.pointerId) {
        drawing = null;
        const s = cur.current;
        cur.current = null;
        // a pen that reports no tilt (or is held upright the whole way) records none
        if (s?.tl && s.tl.every((v, i) => i % 2 === 0 || v >= 88)) delete s.tl;
        if (s && s.p.length && (s.tool !== "lasso" || s.p.length >= 9) && e.type !== "pointercancel") commit(s);
        redraw();
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const [x, y] = local(e as unknown as PointerEvent);
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), x, y);
      else {
        view.current = { ...view.current, ox: view.current.ox - e.deltaX, oy: view.current.oy - e.deltaY };
        redraw();
      }
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("wheel", wheel, { passive: false });
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("wheel", wheel);
    };
  }, [commit, redraw, zoomAt]);

  // drawing time: pen down, plus short pauses between strokes
  useEffect(() => {
    const t = setInterval(() => {
      if (cur.current || (lastUp.current && performance.now() - lastUp.current < 4000)) setMs((m) => m + 250);
    }, 250);
    return () => clearInterval(t);
  }, []);

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
      if (document.querySelector("dialog[open]") || (e.target as HTMLElement).matches?.("input, select, textarea")) return;
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redoOne();
        else undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") {
        e.preventDefault();
        spaceDown.current = true;
        box.current?.classList.add("can-pan");
        return;
      }
      const t = (Object.keys(TOOLS) as ToolId[]).find((id) => TOOLS[id].key === k);
      if (t) setTool(t);
      if (k === "[") setSize((s) => Math.max(1, s - (s > 20 ? 4 : 1)));
      if (k === "]") setSize((s) => Math.min(80, s + (s >= 20 ? 4 : 1)));
      if (k === "0") fit();
      if (k === "=" || k === "+") zoomCentre(1.25);
      if (k === "-") zoomCentre(0.8);
      if (k === "escape") nav("/", { viewTransition: true });
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        spaceDown.current = false;
        box.current?.classList.remove("can-pan");
      }
    };
    addEventListener("keydown", key);
    addEventListener("keyup", keyUp);
    return () => {
      removeEventListener("keydown", key);
      removeEventListener("keyup", keyUp);
    };
  });

  // ---------- layers ----------
  const strokesOn = (id: number) => strokes.filter((s) => (s.l ?? 0) === id).length;
  const patchLayer = (id: number, patch: Partial<LayerDef>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLayer = () => {
    if (layers.length >= MAX_LAYERS) return say(`Up to ${MAX_LAYERS} layers for now`);
    const id = Math.max(...layers.map((l) => l.id)) + 1;
    const at = layers.findIndex((l) => l.id === active) + 1;
    const used = new Set(layers.map((l) => l.name));
    let n = layers.length + 1;
    while (used.has(`Layer ${n}`)) n++;
    setLayers((ls) => [...ls.slice(0, at), { id, name: `Layer ${n}`, blend: "source-over", opacity: 1 }, ...ls.slice(at)]);
    setActive(id);
  };
  const moveLayer = (id: number, d: number) => {
    const i = layers.findIndex((l) => l.id === id), j = i + d;
    if (j < 0 || j >= layers.length) return;
    const next = [...layers];
    [next[i], next[j]] = [next[j], next[i]];
    setLayers(next);
  };
  const askDelete = (l: LayerDef) => {
    if (layers.length < 2) return say("A sheet needs at least one layer");
    if (baseLayers.has(l.id) && remix) return say("This layer holds the piece you are remixing");
    if (!strokesOn(l.id)) return deleteLayer(l.id);
    setDoomed(l);
    layerDlg.current!.showModal();
  };
  const deleteLayer = (id: number) => {
    const rest = layers.filter((l) => l.id !== id);
    setLayers(rest);
    if (active === id) setActive(rest[Math.max(0, rest.length - 1)].id);
    if (strokesOn(id)) {
      setStrokes((s) => s.filter((x) => (x.l ?? 0) !== id));
      setRedo((r) => r.filter((x) => (x.l ?? 0) !== id));
    }
  };

  // ---------- pin and export ----------
  const openPin = () => {
    if (!strokes.length) return say("The sheet is empty. Draw something first.");
    setTitle(sheetTitle);
    setEnter(promptMode && timeLeft > 0);
    pinDlg.current!.showModal();
  };
  const doPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = "mine-" + Date.now().toString(36);
    const name = title.trim() || "Untitled";
    pinPiece({
      id,
      title: name,
      by: "you",
      minutes: Math.max(0.1, ms / 60000),
      strokes: [...base, ...strokes],
      layers,
      paper,
      mine: true,
      stamps: {},
      prompt: promptMode && enter && timeLeft > 0 ? PROMPT.no : undefined,
      remixOf: remix?.id,
    });
    pinDlg.current!.close();
    // the sheet stays in your library, marked as pinned; the studio starts fresh next time
    setSheetTitle(name);
    await save({ title: name, pinned: id });
    lastSheet.set(null);
    nav("/gallery?sort=new", { viewTransition: true });
  };

  const [busy, setBusy] = useState<null | "png" | "video">(null);
  const [progress, setProgress] = useState(0);
  const [scale, setScale] = useState(1);
  const [clearBg, setClearBg] = useState(false);
  const stopVideo = useRef<AbortController | null>(null);
  const allStrokes = useMemo(() => (base.length ? [...base, ...strokes] : strokes), [base, strokes]);
  const all = () => allStrokes;
  const savePNG = async () => {
    setBusy("png");
    try {
      // a frame's pause first, so the button can show it is working before the heavy part
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      download(await pictureBlob(all(), layers, clearBg ? null : paper, scale), fileName(sheetTitle, "png"));
      say("PNG saved");
    } catch {
      say("The picture couldn't be made in this browser");
    }
    setBusy(null);
  };
  const saveVideo = async () => {
    const ac = new AbortController();
    stopVideo.current = ac;
    setBusy("video");
    setProgress(0);
    try {
      const { blob, ext } = await timelapse(all(), layers, paper, ms / 60000, { onProgress: setProgress, signal: ac.signal });
      download(blob, fileName(sheetTitle || "tilo-timelapse", ext));
      say("Timelapse saved");
    } catch (err) {
      if ((err as Error).name !== "AbortError") say((err as Error).message || "The timelapse couldn't be made");
    }
    stopVideo.current = null;
    setBusy(null);
  };
  const video = videoType();

  const activeLayer = layers.find((l) => l.id === active) ?? layers[0];
  const dot = Math.max(3, Math.min(44, size * 1.1));
  const subtitle = remix ? `Remix of “${remix.title}” by @${remix.by}` : promptMode ? `Subject No. ${PROMPT.no} · ${PROMPT.title} · 6 inks, 10:00 on the clock` : `${PAPERS[paper].name} · no clock`;

  return (
    <div className="studio">
      <div className="studio-top">
        <button className="icon-btn" onClick={() => nav("/", { viewTransition: true })} aria-label="Back to Tilo"><Icon name="back" /></button>
        <div className="studio-title">
          {sheetTitle || (promptMode ? PROMPT.title : "Blank sheet")}
          <small>{subtitle}</small>
        </div>
        <span className="sp" />
        {promptMode && <span className={`timer mono num${timeLeft < 60000 ? " is-warn" : ""}`}>{timeLeft > 0 ? fmtMin(timeLeft / 60000) : "Time's up"}</span>}
        <button className="icon-btn" onClick={undo} disabled={!strokes.length} aria-label="Undo" title="Undo · ⌘Z"><Icon name="undo" /></button>
        <button className="icon-btn" onClick={redoOne} disabled={!redo.length} aria-label="Redo" title="Redo · ⇧⌘Z"><Icon name="redo" /></button>
        <Link className="icon-btn hide-xs" to="/library" viewTransition aria-label="Your sheets" title="Your sheets"><Icon name="sheets" /></Link>
        <button className="icon-btn" onClick={() => { if (!strokes.length && !base.length) return say("Draw something first, then save it out"); exportDlg.current!.showModal(); }} aria-label="Export" title="Export a PNG or a timelapse"><Icon name="download" /></button>
        <button className="btn btn-line" onClick={() => { if (!strokes.length && !base.length) return say("Draw something first, then watch it back"); setReplayKey((k) => k + 1); replayDlg.current!.showModal(); }} aria-label="Replay your sheet"><Icon name="replay" /><span className="hide-s">Replay</span></button>
        <button className="btn btn-ink" onClick={openPin}><Icon name="pin" /><span className="hide-s">Pin to gallery</span><span className="show-s">Pin</span></button>
      </div>

      <div className="studio-tools" role="toolbar" aria-label="Brushes and tools">
        {GROUPS.map(([g, label]) => (
          <div key={g} className="tool-group" role="group" aria-label={label}>
            <span className="tool-group-name kicker" aria-hidden="true">{label}</span>
            {(Object.keys(TOOLS) as ToolId[]).filter((t) => TOOLS[t].group === g).map((t) => (
              <button key={t} className="tool" aria-pressed={tool === t} aria-label={`${TOOLS[t].label} (${TOOLS[t].key.toUpperCase()})`} title={`${TOOLS[t].label} · ${TOOLS[t].key.toUpperCase()}`} onClick={() => setTool(t)}>
                <Icon name={t} />
              </button>
            ))}
          </div>
        ))}
        <div className="tool-group">
          <button className="icon-btn" onClick={() => strokes.length && clearDlg.current!.showModal()} aria-label="Clear the sheet" title="Clear the sheet"><Icon name="trash" /></button>
        </div>
      </div>

      <div className="studio-sheet" ref={box} data-tool={tool}>
        {remix && <p className="remix-banner">Remixing “{remix.title}” by @{remix.by}. Their strokes are the base and can't be undone.</p>}
        <canvas ref={cv} className="studio-canvas" role="img" aria-label={`Your drawing sheet, ${strokes.length + base.length} strokes`} />
        <div className="ring" ref={ring} />
        <div className="view-ctl" role="group" aria-label="Zoom">
          <button className="icon-btn" onClick={() => zoomCentre(0.8)} aria-label="Zoom out" title="Zoom out · −"><Icon name="minus" size={18} /></button>
          <button className="view-pct mono num" onClick={fit} title="Fit the sheet · 0">{zoom}%</button>
          <button className="icon-btn" onClick={() => zoomCentre(1.25)} aria-label="Zoom in" title="Zoom in · +"><Icon name="plus" size={18} /></button>
          <button className="icon-btn" onClick={fit} aria-label="Fit the sheet to the screen" title="Fit · 0"><Icon name="fit" size={18} /></button>
        </div>
      </div>

      <aside className="studio-panel" aria-label="Sheet settings">
        <section className="sheet panel-card">
          <h3 className="kicker">Colour</h3>
          <div className="pal">
            {palette.map((c, i) => (
              <button key={c} className="chip-btn" aria-pressed={c === color} aria-label={`Colour ${promptMode ? PROMPT.names[i] : c}`} onClick={() => setColor(c)}>
                <span className="chip" style={{ ["--c" as string]: c }} />
              </button>
            ))}
          </div>
          {!remix && (
            <label className="check"><input type="checkbox" checked={promptMode} onChange={(e) => setPromptMode(e.target.checked)} /> Use the inks of Subject No. {PROMPT.no} only</label>
          )}
          {!promptMode && <div className="custom"><label>Mix your own <input type="color" value={color.length === 7 ? color : "#000000"} onChange={(e) => setColor(e.target.value.toUpperCase())} /></label><span className="hint">or hold Alt and click the sheet to pick one up</span></div>}
        </section>

        <section className="sheet panel-card">
          <h3 className="kicker">{TOOLS[tool].label}</h3>
          {tool !== "fill" && tool !== "lasso" && (
            <label className="slider">
              <span>Size</span>
              <input type="range" min={1} max={80} value={size} onChange={(e) => setSize(+e.target.value)} />
              <span className="mono num">{size}</span>
            </label>
          )}
          <label className="slider">
            <span>Opacity</span>
            <input type="range" min={5} max={100} step={5} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(+e.target.value / 100)} />
            <span className="mono num">{Math.round(opacity * 100)}</span>
          </label>
          <span className="dot" aria-hidden="true" hidden={tool === "fill" || tool === "lasso"}><i style={{ width: dot, height: dot, background: color, opacity }} /></span>
        </section>

        <section className="sheet panel-card">
          <div className="card-head">
            <h3 className="kicker">Layers</h3>
            <button className="icon-btn" onClick={addLayer} aria-label="Add a layer" title="Add a layer"><Icon name="plus" size={18} /></button>
          </div>
          <ol className="layers">
            {[...layers].reverse().map((l) => (
              <li key={l.id} className={l.id === active ? "is-active" : undefined}>
                <button className="icon-btn" onClick={() => patchLayer(l.id, { hidden: !l.hidden })} aria-label={`${l.hidden ? "Show" : "Hide"} ${l.name}`} aria-pressed={!l.hidden}><Icon name={l.hidden ? "eyeoff" : "eye"} size={18} /></button>
                <button className="layer-name" onClick={() => setActive(l.id)} aria-pressed={l.id === active}>
                  {l.name}
                  <small>{strokesOn(l.id) + (remix ? base.filter((s) => (s.l ?? 0) === l.id).length : 0)} strokes{l.blend !== "source-over" ? ` · ${BLENDS.find((b) => b[0] === l.blend)?.[1]}` : ""}{l.opacity < 1 ? ` · ${Math.round(l.opacity * 100)}%` : ""}</small>
                </button>
              </li>
            ))}
          </ol>
          <div className="layer-ctl">
            <label className="slider">
              <span>Opacity</span>
              <input type="range" min={0} max={100} step={5} value={Math.round(activeLayer.opacity * 100)} onChange={(e) => patchLayer(activeLayer.id, { opacity: +e.target.value / 100 })} />
              <span className="mono num">{Math.round(activeLayer.opacity * 100)}</span>
            </label>
            <label className="select">
              <span>Blend</span>
              <select value={activeLayer.blend} onChange={(e) => patchLayer(activeLayer.id, { blend: e.target.value as Blend })}>
                {BLENDS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            </label>
            <div className="row-btns">
              <button className="icon-btn" onClick={() => moveLayer(activeLayer.id, 1)} aria-label="Move the layer up" title="Move up"><Icon name="up" size={18} /></button>
              <button className="icon-btn" onClick={() => moveLayer(activeLayer.id, -1)} aria-label="Move the layer down" title="Move down"><Icon name="down" size={18} /></button>
              <button className="icon-btn" onClick={() => askDelete(activeLayer)} aria-label="Delete the layer" title="Delete the layer"><Icon name="trash" size={18} /></button>
            </div>
          </div>
        </section>

        <section className="sheet panel-card">
          <h3 className="kicker">Paper</h3>
          <div className="papers" role="group" aria-label="Paper">
            {PAPER_IDS.map((id) => (
              <button key={id} className="paper-btn" aria-pressed={paper === id} aria-label={PAPERS[id].name} title={PAPERS[id].name} onClick={() => setPaper(id)}>
                <span className={`paper-swatch p-${id}`} style={{ ["--pc" as string]: PAPERS[id].color }} />
              </button>
            ))}
          </div>
          <p className="hint">{PAPERS[paper].name}. Charcoal catches on its grain.</p>
        </section>

        <section className="sheet panel-card">
          <h3 className="kicker">Symmetry</h3>
          <div className="seg" role="group" aria-label="Symmetry">
            {SYMMETRY.map(([v, n]) => <button key={v || "off"} aria-pressed={sym === v} onClick={() => setSym(v)}>{n}</button>)}
          </div>
        </section>

        <section className="sheet panel-card">
          <h3 className="kicker">Perspective</h3>
          <div className="seg" role="group" aria-label="Perspective guides">
            {PERSPECTIVE.map(([v, n]) => <button key={v} aria-pressed={guides.mode === v} onClick={() => setGuides((g) => ({ ...g, mode: v }))}>{n}</button>)}
          </div>
          {guides.mode > 0 && <label className="check"><input type="checkbox" checked={guides.snap} onChange={(e) => setGuides((g) => ({ ...g, snap: e.target.checked }))} /> Snap strokes to the guides</label>}
          <p className="hint">{guides.mode ? "Drag the blue points to move them. Guides stay out of the picture." : "Hold Shift for a straight line."}</p>
        </section>

        <section className="sheet panel-card">
          <h3 className="kicker">This sheet</h3>
          <div className="field">
            <label htmlFor="sheet-title">Title</label>
            <input type="text" id="sheet-title" maxLength={60} placeholder="Untitled" autoComplete="off" value={sheetTitle} onChange={(e) => setSheetTitle(e.target.value)} />
          </div>
          <div className="stats">
            <div><b className="num">{(strokes.length + base.length).toLocaleString()}</b><span>strokes</span></div>
            <div><b className="num">{fmtMin(ms / 60000)}</b><span>drawing time</span></div>
          </div>
          <p className="hint">Saved on this device as you draw. <Link to="/library" viewTransition>All your sheets</Link></p>
        </section>

        <section className="sheet panel-card opt">
          <h3 className="kicker">Keys</h3>
          <p className="keys">
            {(Object.keys(TOOLS) as ToolId[]).map((t) => <span key={t}><kbd>{TOOLS[t].key.toUpperCase()}</kbd> {TOOLS[t].label.toLowerCase()} </span>)}
            <span><kbd>[</kbd> <kbd>]</kbd> size </span><span><kbd>⌘Z</kbd> undo </span><span><kbd>Shift</kbd> straight line </span><span><kbd>Space</kbd> drag to move </span><span><kbd>⌘</kbd>+scroll or pinch to zoom </span><span><kbd>0</kbd> fit </span><span><kbd>Alt</kbd>+click pick colour</span>
          </p>
        </section>
      </aside>

      <dialog ref={pinDlg} aria-labelledby="pin-h">
        <form className="small-sheet sheet" onSubmit={doPin}>
          <h2 id="pin-h">Pin to the gallery</h2>
          <p>Your piece goes up with its full recording. Until accounts open, it stays on this device.</p>
          <div className="field"><label htmlFor="pin-title">Title</label><input type="text" id="pin-title" maxLength={60} placeholder="Untitled" autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          {promptMode && (
            <label className="check"><input type="checkbox" checked={enter} disabled={timeLeft <= 0} onChange={(e) => setEnter(e.target.checked)} /> {timeLeft > 0 ? `Enter it for Subject No. ${PROMPT.no}` : "Over the 10:00 limit, so it can't be entered"}</label>
          )}
          <div className="row"><button type="button" className="btn btn-quiet" onClick={() => pinDlg.current!.close()}>Keep drawing</button><button type="submit" className="btn btn-ink">Pin it</button></div>
        </form>
      </dialog>

      <dialog ref={exportDlg} aria-labelledby="export-h" onCancel={(e) => busy === "video" && e.preventDefault()}>
        <div className="small-sheet sheet export">
          <h2 id="export-h">Save it out</h2>
          <section>
            <h3>Picture</h3>
            <div className="seg" role="group" aria-label="Picture size">
              {[1, 2].map((v) => <button key={v} aria-pressed={scale === v} onClick={() => setScale(v)}>{SHEET.w * v} × {SHEET.h * v}</button>)}
            </div>
            <label className="check"><input type="checkbox" checked={clearBg} onChange={(e) => setClearBg(e.target.checked)} /> Leave out the paper (transparent)</label>
            <button className="btn btn-ink" onClick={savePNG} disabled={!!busy}><Icon name="download" />{busy === "png" ? "Making the PNG…" : "Download PNG"}</button>
          </section>
          <section>
            <h3>Timelapse</h3>
            {video ? (
              <>
                <p>Your recording played back as {video[1] === "mp4" ? "an MP4" : "a WebM"} video, made here in the browser. It plays in real time, so keep this tab open.</p>
                {busy === "video" ? (
                  <div className="progress-row">
                    <progress max={1} value={progress} aria-label="Making the timelapse" />
                    <button className="btn btn-quiet" onClick={() => stopVideo.current?.abort()}>Stop</button>
                  </div>
                ) : (
                  <button className="btn btn-line" onClick={saveVideo} disabled={!!busy}><Icon name="replay" />Make the timelapse</button>
                )}
              </>
            ) : (
              <p>This browser can't record video. Chrome, Edge, Firefox and Safari 14.1 or newer can.</p>
            )}
          </section>
          <div className="row"><button className="btn btn-quiet" onClick={() => exportDlg.current!.close()} disabled={busy === "video"}>Done</button></div>
        </div>
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

      <dialog ref={layerDlg} aria-labelledby="layer-h">
        <div className="small-sheet sheet">
          <h2 id="layer-h">Delete {doomed?.name}?</h2>
          <p>Its {doomed ? strokesOn(doomed.id) : 0} strokes go with it, and they leave the recording too. Undo won't bring them back.</p>
          <div className="row">
            <button className="btn btn-quiet" onClick={() => layerDlg.current!.close()}>Keep it</button>
            <button className="btn btn-ink" onClick={() => { if (doomed) deleteLayer(doomed.id); layerDlg.current!.close(); }}>Delete the layer</button>
          </div>
        </div>
      </dialog>

      <dialog ref={replayDlg} className="replay-dlg" aria-label="Replay of your sheet" onClick={(e) => e.target === e.currentTarget && replayDlg.current!.close()}>
        <div className="replay-box sheet">
          <ReplayCanvas key={replayKey} strokes={allStrokes} layers={layers} paper={paper} mode="once" label="Your sheet, replaying" />
          <div className="row"><span className="kicker">{strokes.length + base.length} strokes · {fmtMin(ms / 60000)}</span><button className="btn btn-quiet" onClick={() => replayDlg.current!.close()}>Close</button></div>
        </div>
      </dialog>

      <div className="toast" role="status" data-show={toast ? "" : undefined}>{toast}</div>
    </div>
  );
}
