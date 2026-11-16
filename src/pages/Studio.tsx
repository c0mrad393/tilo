import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLoaderData, useNavigate, type LoaderFunctionArgs, type ShouldRevalidateFunctionArgs } from "react-router";
import { Icon } from "../components/Icon";
import { ReplayCanvas } from "../components/ReplayCanvas";
import { openFeedback } from "../data/beta";
import { blankSheet, lastSheet, library, migrateDraft, type Guides, type Sheet } from "../data/library";
import { ACCOUNTS, useAccount } from "../data/account";
import { pinPiece } from "../data/local";
import { findPiece, getPiece, isPublished, publish } from "../data/pieces";
import { PROMPT, publishedSample } from "../data/prompt";
import { download, fileName, gifSizes, loopGif, pictureBlob, thumbnail, timelapse, videoType } from "../engine/export";
import { drawGuides, handleAt, snapDirection } from "../engine/guides";
import { cleanMs, frameAt, isAnimated, liveFrames, MAX_FRAMES, MS_DEFAULT, MS_MAX, MS_MIN, MS_STEP, nextFrameId, type Anim, type FrameDef } from "../engine/frames";
import { Painter } from "../engine/painter";
import { PAPER_IDS, PAPERS, PLAIN_PAPERS, type PaperId } from "../engine/paper";
import { cellAt, centreOf, gridOf, isPixelTool } from "../engine/pixel";
import { SYMMETRY } from "../engine/symmetry";
import { ColorPicker } from "../components/ColorPicker";
import { remember } from "../engine/colour";
import { anchor, matrix, toSheet as viewToSheet, type View } from "../engine/view";
import { apply as xfApply, boundsOf, invert as xfInvert, isIdentity, snapped, toArr, xfAround, type Xf } from "../engine/select";
import { BASE_LAYER, DRAW_SHAPES, fmtMin, isOp, isPixelShape, layersOf, PIXEL_SHAPES, SHAPES, TOOLS, type Blend, type LayerDef, type ShapeId, type SheetSize, type Stroke, type ToolGroup, type ToolId } from "../engine/stroke";

const NO_STROKES: Stroke[] = [];

/** The studio opened for a pupil (Tilo for schools): their work is kept on the server, not in
    the library, and "Publish" becomes "Hand in". `simple` gives the younger pupils fewer tools. */
export interface Seat {
  /** where the back arrow and Esc go */
  back: string;
  title: string;
  brief: string;
  due: string;
  /** the task's colours, when it fixes them */
  palette: string[] | null;
  simple: boolean;
  /** a note from the teacher that sent the work back */
  note: string;
  save(d: { title: string; strokes: Stroke[]; layers: LayerDef[]; paper: PaperId; minutes: number }): Promise<void>;
  handIn(): Promise<void>;
}
/* the younger pupils' tools, and their crayon box */
const KID_TOOLS = new Set<ToolId>(["pencil", "marker", "gouache", "spray", "fill", "eraser", "pixel", "pixelerase", "pixelfill"]);
const KID_NAMES: Partial<Record<ToolId, string>> = { pencil: "Pencil", marker: "Felt tip", gouache: "Paint", spray: "Spray", fill: "Fill", eraser: "Rubber", pixel: "Pen", pixelerase: "Rubber", pixelfill: "Fill" };
const CRAYONS = ["#232323", "#8E9196", "#FFFFFF", "#8A5530", "#D9A867", "#F3C7A0", "#E0392B", "#EF79AE", "#F2861E", "#F6CB2C", "#8CC63F", "#2E9B47", "#1F8A8A", "#5DB7EE", "#2C64D4", "#7A4BC4"];
const plural = (n: number, w: string) => `${n.toLocaleString()} ${w}${n === 1 ? "" : "s"}`;

/* colours you mixed or picked up, newest first, kept on this device */
const recentColours = {
  get: (): string[] => {
    try {
      const l = JSON.parse(localStorage.getItem("tilo.recent") || "[]");
      return Array.isArray(l) ? l.filter((c) => typeof c === "string").slice(0, 10) : [];
    } catch {
      return [];
    }
  },
  set: (l: string[]) => {
    try {
      localStorage.setItem("tilo.recent", JSON.stringify(l));
    } catch {
      // storage off: recent colours last until the page closes
    }
    return l;
  },
};
const FREE = ["#1B1E1D", "#5B5F66", "#2B37D4", "#3FA7D6", "#3E7C6B", "#8DBF5A", "#F2C14E", "#E26D3D", "#C9392F", "#A1386B", "#7A4E2D", "#FFFFFF"];
const GROUPS: [ToolGroup, string][] = [["draw", "Draw"], ["paint", "Paint"], ["shape", "Shape"], ["fix", "Fix"]];
const PIXEL_GROUPS: [ToolGroup, string][] = [["pixel", "Pixel"]];
/* Tilo's own palettes for pixel sheets; the mixer covers anything else */
const PIXEL_PALETTES: [string, string[]][] = [
  ["Sixteen", ["#1A1C2C", "#5D275D", "#B13E53", "#EF7D57", "#FFCD75", "#A7F070", "#38B764", "#257179", "#29366F", "#3B5DC9", "#41A6F6", "#73EFF7", "#F4F4F4", "#94B0C2", "#566C86", "#333C57"]],
  ["Dusk", ["#2B1B3D", "#4E2A5A", "#8A3B6B", "#C9566B", "#F08A6C", "#F7C48B", "#FBE7C6", "#5B6EA3"]],
  ["Four greys", ["#0F1210", "#4A524C", "#9AA39C", "#E4EBE5"]],
  ["Warm earth", ["#2A1D17", "#5C3A2A", "#8E5A3C", "#C1844F", "#E0B27A", "#F3DDB3", "#6E7F4B", "#A9B86C", "#3E5A63", "#D9573B", "#F2E9DC", "#1B1E1D"]],
];
const pixelColours = new Set(PIXEL_PALETTES.flatMap(([, c]) => c));
const BLENDS: [Blend, string][] = [["source-over", "Normal"], ["multiply", "Multiply"], ["screen", "Screen"], ["overlay", "Overlay"], ["soft-light", "Soft light"], ["darken", "Darken"], ["lighten", "Lighten"], ["color-burn", "Colour burn"]];
const SEEDED = new Set<ToolId>(["charcoal", "spray", "oil"]);
const NO_SNAP = new Set<ToolId>(["fill", "lasso", "smudge"]);
const PERSPECTIVE = [[0, "Off"], [1, "1 point"], [2, "2 point"]] as const;
const MAX_LAYERS = 8;
const SEL_INK = "#2D4BB3";

/* a selection being moved: its outline as stroke points, the box around it, and the transform so far */
interface Sel {
  p: number[];
  box: [number, number, number, number];
  layer: number;
  xf: Xf;
}
type Grab = "move" | "scale" | "turn";
/** Where a selection's handles are, in sheet units; `s` is the view scale, for screen-sized gaps. */
function handles(S: Sel, s: number) {
  const [x0, y0, x1, y1] = S.box;
  const corners = ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as const).map(([x, y]) => xfApply(S.xf, x, y));
  const top = xfApply(S.xf, (x0 + x1) / 2, y0), mid = xfApply(S.xf, (x0 + x1) / 2, (y0 + y1) / 2);
  const l = Math.hypot(top[0] - mid[0], top[1] - mid[1]);
  const dir = l > 1e-3 ? [(top[0] - mid[0]) / l, (top[1] - mid[1]) / l] : [Math.sin(S.xf.rot), -Math.cos(S.xf.rot)];
  const turn: [number, number] = [top[0] + (dir[0] * 30) / s, top[1] + (dir[1] * 30) / s];
  return { corners, top, turn };
}
function grabAt(S: Sel, x: number, y: number, s: number, slop: number): Grab | null {
  const h = handles(S, s), near = (p: [number, number]) => Math.hypot(p[0] - x, p[1] - y) * s < slop;
  if (near(h.turn)) return "turn";
  if (h.corners.some(near)) return "scale";
  const [u, v] = xfInvert(S.xf, x, y), [x0, y0, x1, y1] = S.box, m = slop / s / Math.max(0.05, Math.min(Math.abs(S.xf.sx), Math.abs(S.xf.sy)));
  return u >= x0 - m && u <= x1 + m && v >= y0 - m && v <= y1 + m ? "move" : null;
}


/* A pixel sheet's painter holds one pixel a cell (a 32 × 32 layer is 4 KB, not 6.5 MB), so a
   loop of many frames stays light; the view scales it up with the cells sharp. */
function makePainter(d: SheetSize & { grid?: number }, layers: LayerDef[], paper: PaperId | null) {
  if (!d.grid) return new Painter(d.w, d.h, 1, layers, paper);
  const g = gridOf(d.grid, d);
  return new Painter(g.cols, g.rows, g.cols / d.w, layers, paper);
}

/* onion skin: the frame before in a warm tint and the frame after in a cool one, faint,
   under the frame being drawn; on screen only */
const ONION: [number, string][] = [[-1, "#E2553D"], [1, "#2F7FD6"]];
let onionCanvas: HTMLCanvasElement | null = null;
function drawOnion(ctx: CanvasRenderingContext2D, p: Painter, a: Anim, frame: number) {
  const order = liveFrames(a);
  const i = order.findIndex((f) => f.id === frame);
  if (i < 0 || order.length < 2) return;
  const seen = new Set([frame]);
  for (const [d, tint] of ONION) {
    let j = i + d;
    // a round loop wraps, so the first frame sees the last
    if (j < 0 || j >= order.length) {
      if (a.bounce) continue;
      j = (j + order.length) % order.length;
    }
    if (seen.has(order[j].id)) continue;
    seen.add(order[j].id);
    const c = (onionCanvas ??= document.createElement("canvas"));
    c.width = p.width;
    c.height = p.height;
    const x = c.getContext("2d")!;
    p.render(x, undefined, "bare", order[j].id);
    x.globalCompositeOperation = "source-atop";
    x.globalAlpha = 0.6;
    x.fillStyle = tint;
    x.fillRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.drawImage(c, 0, 0);
    ctx.restore();
  }
}

/** What gets published or pinned: an animation as it is, or, with fewer than two frames
    left playing, a still, its other frames' layers kept out of sight as merged ones are. */
export function settle(layers: LayerDef[], anim: Anim | undefined): { layers: LayerDef[]; anim?: Anim } {
  if (anim && isAnimated({ anim })) return { layers, anim };
  if (!anim) return { layers };
  const keep = liveFrames(anim)[0]?.id ?? 0;
  return { layers: layers.map(({ f, ...l }) => ((f ?? 0) === keep ? l : { ...l, gone: true })) };
}

/** A frame's time: typed and kept on Enter or leaving the field, or stepped by 10 ms. */
function FrameTime({ ms, onSet }: { ms: number; onSet: (ms: number) => void }) {
  const [draft, setDraft] = useState(String(ms));
  useEffect(() => setDraft(String(ms)), [ms]);
  const keep = () => {
    const v = cleanMs(Number(draft));
    setDraft(String(v));
    if (v !== ms) onSet(v);
  };
  return (
    <span className="frame-time">
      <button className="icon-btn" onClick={() => onSet(cleanMs(ms - MS_STEP))} disabled={ms <= MS_MIN} aria-label="10 ms shorter"><Icon name="minus" size={16} /></button>
      <label>
        <span className="sr-only">This frame's time in milliseconds</span>
        <input type="number" className="mono num" min={MS_MIN} max={MS_MAX} step={MS_STEP} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={keep} onKeyDown={(e) => e.key === "Enter" && keep()} />
      </label>
      <span className="frame-unit">ms</span>
      <button className="icon-btn" onClick={() => onSet(cleanMs(ms + MS_STEP))} disabled={ms >= MS_MAX} aria-label="10 ms longer"><Icon name="plus" size={16} /></button>
    </span>
  );
}

/* ---------- which sheet the studio opens ---------- */

let openSheet = "";

/** /studio resumes the sheet you were on; ?sheet=id opens one from the library; ?new, ?remix=id
    and ?prompt=no start a fresh one. A fresh sheet is only saved once something is drawn. */
export async function studioLoader({ request }: LoaderFunctionArgs): Promise<Sheet> {
  await migrateDraft();
  const q = new URL(request.url).searchParams;
  // a published piece is fetched here, so the studio below can find it without waiting
  const remix = q.get("remix") && (await getPiece(q.get("remix")!));
  if (remix) {
    const own = layersOf(remix);
    const top: LayerDef = { id: Math.max(...own.map((l) => l.id)) + 1, name: "Your layer", blend: "source-over", opacity: 1 };
    return blankSheet({ remixOf: remix.id, paper: remix.paper ?? "smooth", shape: remix.shape, layers: [...own, top], title: `After “${remix.title}”` });
  }
  if (q.get("prompt") === String(PROMPT.no)) return blankSheet({ subject: true });
  if (q.has("new") && q.get("kind") === "pixel") return blankSheet(pixelStart(q));
  const id = q.get("sheet") ?? (q.has("new") ? null : lastSheet.get());
  if (id) {
    try {
      const s = await library.get(id);
      if (s?.remixOf) await getPiece(s.remixOf);
      if (s) return { ...s, thumb: undefined }; // the studio makes its own picture
    } catch {
      // no IndexedDB here: start fresh, and the studio says it can't keep sheets
    }
  }
  return blankSheet();
}
/* swapping the address to ?sheet=<the open sheet> after its first save shouldn't reload it */
export const studioShouldRevalidate = ({ nextUrl }: ShouldRevalidateFunctionArgs) => nextUrl.searchParams.get("sheet") !== openSheet || !openSheet;

type PanelTab = "colour" | "brush" | "layers" | "sheet";
/* ?new&kind=pixel opens a fresh pixel sheet */
const pixelStart = (q: URLSearchParams) => (q.get("kind") === "pixel" ? { shape: "px32" as ShapeId, paper: "plain" as PaperId } : {});
const PANEL_TABS: [PanelTab, string][] = [["colour", "Colour"], ["brush", "Brush"], ["layers", "Layers"], ["sheet", "Sheet"]];

export function StudioRoute() {
  const sheet = useLoaderData() as Sheet;
  return <Studio key={sheet.id} sheet={sheet} />;
}

/* ---------- the studio ---------- */

/* Everything drawn goes through a Painter, one canvas per layer at sheet size; the screen
   shows it through a zoomable view. The sheet saves itself to the library as you work. */
export function Studio({ sheet, seat }: { sheet: Sheet; seat?: Seat }) {
  const nav = useNavigate();
  const remix = sheet.remixOf ? findPiece(sheet.remixOf) : undefined;
  // signed in with a handle, "Pin" becomes "Publish": the piece goes to the shared gallery
  const { profile } = useAccount();
  const publishing = ACCOUNTS && !!profile && !seat;
  const kid = !!seat?.simple;
  const usable = (t: ToolId) => !kid || KID_TOOLS.has(t);
  const [sending, setSending] = useState<"" | "busy" | string>("");
  const [remixable, setRemixable] = useState(true);
  const [promptMode, setPromptMode] = useState(!!sheet.subject);
  const [tool, setTool] = useState<ToolId>(isPixelShape(sheet.shape) ? "pixel" : kid ? "marker" : "ink");
  const [color, setColor] = useState(seat?.palette?.[0] ?? (promptMode ? PROMPT.palette[0] : isPixelShape(sheet.shape) ? PIXEL_PALETTES[0][1][0] : kid ? CRAYONS[6] : FREE[0]));
  const [recent, setRecent] = useState<string[]>(recentColours.get);
  const [mixing, setMixing] = useState(false);
  // on a narrow screen the settings fold into tabs under the sheet; none open leaves the sheet the room
  const [tab, setTab] = useState<PanelTab | null>(null);
  const [size, setSize] = useState(kid ? 16 : 8);
  // a pixel brush is 1 to 4 cells across
  const [pxSize, setPxSize] = useState(1);
  const [pxPal, setPxPal] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [opacity, setOpacity] = useState(1);
  const [steady, setSteady] = useState(0);
  const [sym, setSym] = useState("");
  const [layers, setLayers] = useState<LayerDef[]>(() => (sheet.layers.length ? sheet.layers : [BASE_LAYER]));
  const [active, setActive] = useState(() => layers[layers.length - 1].id);
  // frames (3.2): a pixel sheet starts as one frame, and `anim` comes with the second
  const [anim, setAnim] = useState<Anim | undefined>(sheet.anim);
  const [frame, setFrame] = useState(() => (sheet.anim ? (layers[layers.length - 1].f ?? 0) : 0));
  const [onion, setOnion] = useState(true);
  const [playing, setPlaying] = useState(false);
  // the frame on screen while the loop plays, in a ref for the drawing code and in state for the strip
  const playAt = useRef<number | null>(null);
  const [playFrame, setPlayFrame] = useState<number | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>(sheet.strokes);
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [ms, setMs] = useState(sheet.ms);
  const [paper, setPaper] = useState<PaperId>(sheet.paper);
  const [shape, setShape] = useState<ShapeId>(sheet.shape ?? "land");
  const dims = SHAPES[shape];
  const pixel = !!dims.grid;
  const dimsRef = useRef(dims);
  dimsRef.current = dims;
  const [guides, setGuides] = useState<Guides>(sheet.guides);
  const [sheetTitle, setSheetTitle] = useState(sheet.title);
  const [zoom, setZoom] = useState(100);
  const [turn, setTurn] = useState({ deg: 0, flip: false });
  const [toast, setToast] = useState("");
  const base = remix?.strokes ?? NO_STROKES;
  const baseLayers = useRef(new Set(base.map((s) => s.l ?? 0))).current;

  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const painter = useRef<Painter | null>(null);
  const applied = useRef<Stroke[] | null>(null); // the stroke list the painter currently holds
  const cur = useRef<Stroke | null>(null);
  const sel = useRef<Sel | null>(null);
  const lassoPath = useRef<number[] | null>(null);
  const [selOn, setSelOn] = useState(false);
  const view = useRef<View>({ s: 0.5, r: 0, f: 1, ox: 0, oy: 0 });
  const lastUp = useRef(0);
  const cfg = useRef({ tool, color, size, opacity, sym, active, guides, steady, pxSize, pixel, showGrid });
  cfg.current = { tool, color, size, opacity, sym, active, guides, steady, pxSize, pixel, showGrid };
  const framing = useRef({ anim, frame, onion });
  framing.current = { anim, frame, onion };
  // the cell under the pointer on a pixel sheet, outlined so you can see where a click lands
  const hover = useRef<[number, number] | null>(null);
  const pinDlg = useRef<HTMLDialogElement>(null);
  const clearDlg = useRef<HTMLDialogElement>(null);
  const layerDlg = useRef<HTMLDialogElement>(null);
  const replayDlg = useRef<HTMLDialogElement>(null);
  const exportDlg = useRef<HTMLDialogElement>(null);
  const [doomed, setDoomed] = useState<LayerDef | null>(null);
  const [naming, setNaming] = useState<number | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const [title, setTitle] = useState("");
  const [enter, setEnter] = useState(true);

  const palette = seat?.palette ?? (promptMode ? PROMPT.palette : pixel ? PIXEL_PALETTES[pxPal][1] : kid ? CRAYONS : FREE);
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
    const { s } = view.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(...matrix(view.current, dpr));
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 22 * dpr;
    ctx.shadowOffsetY = 8 * dpr;
    const d = dimsRef.current;
    ctx.fillStyle = PAPERS[p.paper ?? "smooth"].color;
    ctx.fillRect(0, 0, d.w, d.h);
    ctx.restore();
    const S = sel.current;
    const k = cfg.current;
    // cells stay sharp however far in you zoom
    ctx.imageSmoothingEnabled = !k.pixel;
    const fr = framing.current;
    p.frame = fr.anim ? (playAt.current ?? fr.frame) : undefined;
    // a pixel sheet's painter is one pixel a cell; the paper is already down, so it draws bare
    ctx.save();
    ctx.scale(1 / p.k, 1 / p.k);
    if (fr.anim && fr.onion && playAt.current === null) drawOnion(ctx, p, fr.anim, fr.frame);
    p.render(ctx, cur.current ? { stroke: cur.current } : S ? { stroke: { tool: "move", c: "", w: 0, p: S.p, l: S.layer, x: toArr(S.xf) } } : undefined, k.pixel ? "bare" : "full");
    ctx.restore();
    const m = cfg.current.sym;
    if (m) {
      // symmetry guides, a hairline at any zoom
      ctx.save();
      ctx.strokeStyle = "rgba(238,58,140,0.6)";
      ctx.lineWidth = 1 / s;
      ctx.setLineDash([6 / s, 6 / s]);
      ctx.beginPath();
      const cx = d.w / 2, cy = d.h / 2;
      if (m.includes("v")) ctx.moveTo(cx, 0), ctx.lineTo(cx, d.h);
      if (m.includes("h")) ctx.moveTo(0, cy), ctx.lineTo(d.w, cy);
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
    if (!k.pixel) drawGuides(ctx, k.guides, s, d);
    if (k.pixel && d.grid) {
      const g = gridOf(d.grid, d);
      // the grid, once cells are big enough on screen to tell apart; never part of the picture
      if (k.showGrid && g.cell * s >= 6) {
        ctx.save();
        ctx.strokeStyle = p.paper === "plaindark" ? "rgba(255,255,255,0.14)" : "rgba(29,27,25,0.14)";
        const v = view.current;
        // a straight view draws the lines on whole device pixels, so they all look the same
        const X = v.r ? (x: number) => x : (x: number) => Math.round((v.ox + v.s * v.f * x) * dpr) + 0.5;
        const Y = v.r ? (y: number) => y : (y: number) => Math.round((v.oy + v.s * y) * dpr) + 0.5;
        if (v.r) ctx.lineWidth = 1 / s;
        else {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.lineWidth = 1;
        }
        ctx.beginPath();
        for (let c = 1; c < g.cols; c++) ctx.moveTo(X(c * g.cell), Y(0)), ctx.lineTo(X(c * g.cell), Y(d.h));
        for (let r = 1; r < g.rows; r++) ctx.moveTo(X(0), Y(r * g.cell)), ctx.lineTo(X(d.w), Y(r * g.cell));
        ctx.stroke();
        ctx.restore();
      }
      const h = hover.current;
      if (h && !cur.current) {
        const b = k.tool === "pixelfill" ? 1 : k.pxSize, off = (b - 1) >> 1;
        const x = (h[0] - off) * g.cell, y = (h[1] - off) * g.cell;
        ctx.save();
        ctx.lineWidth = 2 / s;
        ctx.strokeStyle = "rgba(29,27,25,0.7)";
        ctx.strokeRect(x, y, b * g.cell, b * g.cell);
        ctx.lineWidth = 1 / s;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.strokeRect(x, y, b * g.cell, b * g.cell);
        ctx.restore();
      }
    }
    // the lasso being drawn, then the selection with its handles
    const lp = lassoPath.current;
    if (lp || S) {
      ctx.save();
      ctx.lineWidth = 1.5 / s;
      ctx.strokeStyle = SEL_INK;
      ctx.setLineDash([6 / s, 5 / s]);
      ctx.beginPath();
      if (lp) for (let i = 0; i < lp.length; i += 2) ctx[i ? "lineTo" : "moveTo"](lp[i], lp[i + 1]);
      else if (S) {
        for (let i = 0; i < S.p.length; i += 3) ctx[i ? "lineTo" : "moveTo"](...xfApply(S.xf, S.p[i], S.p[i + 1]));
        ctx.closePath();
      }
      ctx.stroke();
      if (S) {
        const h = handles(S, s);
        ctx.setLineDash([]);
        ctx.beginPath();
        h.corners.forEach((c, i) => ctx[i ? "lineTo" : "moveTo"](...c));
        ctx.closePath();
        ctx.moveTo(...h.top);
        ctx.lineTo(...h.turn);
        ctx.stroke();
        ctx.fillStyle = "#FBFAF5";
        const r = 6 / s;
        for (const [x, y] of h.corners) {
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
          ctx.strokeRect(x - r, y - r, r * 2, r * 2);
        }
        ctx.beginPath();
        ctx.arc(h.turn[0], h.turn[1], 7 / s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }, []);
  const redraw = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(render);
  }, [render]);

  // the view fit() made; while nobody has moved it, a new screen size fits the sheet again
  const fitted = useRef<View | null>(null);
  const fit = useCallback(() => {
    const b = box.current!;
    const pad = innerWidth < 860 ? 12 : 32;
    const d = dimsRef.current;
    const s = Math.max(0.05, Math.min((b.clientWidth - pad * 2) / d.w, (b.clientHeight - pad * 2) / d.h));
    // fitting also straightens and unflips the view
    view.current = fitted.current = { s, r: 0, f: 1, ox: (b.clientWidth - d.w * s) / 2, oy: (b.clientHeight - d.h * s) / 2 };
    setZoom(Math.round(s * 100));
    setTurn({ deg: 0, flip: false });
    redraw();
  }, [redraw]);
  /** Changes the view while the sheet point under screen point (cx, cy) stays put. */
  const reView = useCallback((change: (v: View) => Partial<View>, cx: number, cy: number) => {
    const v = view.current;
    const next = { ...v, ...change(v) };
    next.s = Math.max(0.1, Math.min(8, next.s));
    view.current = anchor(next, viewToSheet(v, cx, cy), cx, cy);
    setZoom(Math.round(next.s * 100));
    setTurn({ deg: Math.round((((next.r * 180) / Math.PI) % 360 + 540) % 360 - 180), flip: next.f < 0 });
    redraw();
  }, [redraw]);
  const zoomAt = useCallback((f: number, cx: number, cy: number) => reView((v) => ({ s: v.s * f }), cx, cy), [reView]);
  const centre = (): [number, number] => [box.current!.clientWidth / 2, box.current!.clientHeight / 2];
  const zoomCentre = (f: number) => zoomAt(f, ...centre());
  const rotateBy = (deg: number) => reView((v) => ({ r: v.r + (deg * Math.PI) / 180 }), ...centre());
  const flipView = () => reView((v) => ({ f: v.f > 0 ? -1 : 1 }), ...centre());

  // ---------- the painter follows the stroke list, the layer stack and the paper ----------
  if (!painter.current) painter.current = makePainter(dims, layers, paper);
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
    const fresh = makePainter(dims, p.layers, p.paper);
    if (p.width === fresh.width && p.height === fresh.height && p.k === fresh.k) return;
    // a new shape is only offered on an empty sheet, so a fresh painter loses nothing
    painter.current = fresh;
    rebuild();
    fit();
  }, [dims, rebuild, fit]);
  useEffect(() => {
    const p = painter.current!;
    if (p.paper === paper) return;
    // charcoal catches on the paper's tooth, so a new paper redraws the strokes too
    p.paper = paper;
    rebuild();
  }, [paper, rebuild]);
  // the strip's small pictures, drawn after the painter has caught up with any change
  const thumbs = useRef(new Map<number, HTMLCanvasElement>());
  useEffect(() => {
    const p = painter.current!;
    for (const [id, c] of thumbs.current) {
      if (c.width !== p.width || c.height !== p.height) {
        c.width = p.width;
        c.height = p.height;
      }
      const x = c.getContext("2d")!;
      x.clearRect(0, 0, c.width, c.height);
      p.render(x, undefined, "full", id);
    }
  }, [strokes, layers, paper, anim, dims]);
  useEffect(redraw, [anim, frame, onion, redraw]);
  useEffect(() => {
    if (!palette.includes(color) && promptMode) setColor(palette[0]);
  }, [palette, color, promptMode]);
  useEffect(redraw, [sym, guides, showGrid, redraw]);
  // a pixel sheet has only the pixel tools, and symmetry that lands on the grid
  useEffect(() => {
    if (pixel !== isPixelTool(tool)) setTool(pixel ? "pixel" : "ink");
    if (pixel && sym[0] === "r") setSym("");
    if (pixel && !PLAIN_PAPERS.includes(paper)) setPaper("plain");
    // the drawing sheet's first ink isn't in any pixel palette
    if (pixel && color === FREE[0]) setColor(PIXEL_PALETTES[0][1][0]);
  }, [pixel, tool, sym, paper, color]);

  const commit = useCallback((s: Stroke) => {
    s.t = Date.now();
    if (!isOp(s) && s.tool !== "eraser" && s.tool !== "smudge" && s.tool !== "pixelerase" && !FREE.includes(s.c) && !PROMPT.palette.includes(s.c) && !pixelColours.has(s.c) && !CRAYONS.includes(s.c)) setRecent((r) => recentColours.set(remember(r, s.c)));
    painter.current!.apply(s);
    const next = [...(applied.current ?? []), s];
    applied.current = next;
    setStrokes(next);
    setRedo([]);
    lastUp.current = performance.now();
    redraw();
  }, [redraw]);

  // ---------- the selection ----------
  const applySel = useCallback(() => {
    const S = sel.current;
    if (!S) return;
    sel.current = null;
    setSelOn(false);
    if (!isIdentity(S.xf)) commit({ tool: "move", c: "", w: 0, p: S.p, l: S.layer, x: toArr(snapped(S.xf)) });
    redraw();
  }, [commit, redraw]);
  const cancelSel = useCallback(() => {
    sel.current = null;
    setSelOn(false);
    redraw();
  }, [redraw]);
  const flipSel = () => {
    if (!sel.current) return;
    sel.current.xf = { ...sel.current.xf, sx: -sel.current.xf.sx };
    redraw();
  };
  // a selection belongs to one layer and one tool; leaving either puts it down where it is
  useEffect(() => {
    if (sel.current && (tool !== "select" || sel.current.layer !== active)) applySel();
  }, [tool, active, applySel]);

  // ---------- saving to the library ----------
  const [saving, setSaving] = useState<"" | "busy" | "done" | "failed">("");
  const saved = useRef(sheet.count > 0 || sheet.updated !== sheet.created);
  const lastSave = useRef(0);
  const saveFailed = useRef(false);
  // fields set once and kept on every later save (pinning)
  const kept = useRef<Partial<Sheet>>({});
  const handedIn = useRef(false);
  // what the last save wrote, so an unchanged sheet isn't written again (and its date kept)
  const sig = [strokes, layers, ms, paper, shape, guides, sheetTitle, promptMode, anim];
  const savedSig = useRef<unknown[]>(sig);
  const snapshot = useRef<() => { snap: Sheet; sig: unknown[] }>(null!);
  snapshot.current = () => ({ snap: { ...sheet, title: sheetTitle, ms, strokes, layers, paper, shape, guides, subject: promptMode, anim, updated: Date.now(), ...kept.current }, sig });
  const save = useCallback(async (extra: Partial<Sheet> = {}) => {
    Object.assign(kept.current, extra);
    const { snap, sig } = snapshot.current();
    if (!saved.current && !snap.strokes.length) return;
    // a drawing being handed in, or handed in, is not saved over
    if (handedIn.current) return;
    if (!Object.keys(extra).length && sig.every((v, i) => v === savedSig.current[i])) return;
    savedSig.current = sig;
    lastSave.current = Date.now();
    let thumb: Blob | undefined;
    try {
      // an animation's picture in Your sheets is its first frame
      thumb = seat ? undefined : await thumbnail(painter.current!, 400, snap.anim ? liveFrames(snap.anim)[0]?.id : undefined);
    } catch {
      thumb = undefined;
    }
    if (seat) {
      setSaving("busy");
      try {
        await seat.save({ title: snap.title, strokes: snap.strokes, layers: snap.layers, paper: snap.paper, minutes: snap.ms / 60000 });
        saved.current = true;
        setSaving("done");
      } catch {
        // tried again with the next change, or when the page is left
        savedSig.current = [];
        setSaving("failed");
      }
      return;
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
  }, [nav, seat]);
  useEffect(() => {
    if (seat) return;
    openSheet = saved.current ? sheet.id : "";
    if (saved.current && !sheet.pinned) lastSheet.set(sheet.id);
  }, [sheet, seat]);
  useEffect(() => {
    if (!saved.current && !strokes.length) return;
    // quiet while you draw, but never more than ten seconds behind
    const t = window.setTimeout(save, Date.now() - lastSave.current > 10000 ? 0 : 900);
    return () => clearTimeout(t);
  }, [strokes, layers, ms, paper, shape, guides, sheetTitle, promptMode, anim, save]);
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
    let w = 0, h = 0;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      c.width = Math.round(b.clientWidth * dpr);
      c.height = Math.round(b.clientHeight * dpr);
      const dw = b.clientWidth - w, dh = b.clientHeight - h;
      w = b.clientWidth;
      h = b.clientHeight;
      // the first time, or while the view is as fit() left it (a tablet turned, a panel opened):
      // fit again. Once someone has zoomed or moved it, keep the middle of the screen in place.
      if (first || view.current === fitted.current) {
        first = false;
        fit();
      } else {
        view.current = { ...view.current, ox: view.current.ox + dw / 2, oy: view.current.oy + dh / 2 };
        redraw();
      }
    });
    ro.observe(b);
    return () => ro.disconnect();
  }, [fit, redraw]);

  // ---------- pointers: draw with one, pan with space or the middle button, pinch with two ----------
  const spaceDown = useRef(false);
  // drawing stops the loop playing
  const halt = useRef(() => {});
  halt.current = () => {
    if (playing) setPlaying(false);
  };
  useEffect(() => {
    const c = cv.current!, b = box.current!;
    const pts = new Map<number, { x: number; y: number; type: string }>();
    let drawing: number | null = null;
    let pan: { id: number; x: number; y: number; ox: number; oy: number } | null = null;
    let pinch: { d: number; a: number; pt: [number, number]; v: View } | null = null;
    let drag: { id: number; vp: number } | null = null;
    let penSeen = false;
    let last: [number, number] | null = null;
    let lastT = 0;
    let smooth = 0.6;
    // a straight stroke: "guide" snaps to the perspective, "free" (Shift) keeps its first heading
    let straight: "guide" | "free" | null = null;
    let lock: [number, number] | null = null;
    // the stabilizer: the brush trails the pointer on a string and only moves when it pulls tight
    let brush: [number, number] | null = null;
    let rawLast: [number, number] | null = null;
    let lastPr = 0.6;
    let lastTilt: [number, number] = [0, 90];
    // the select tool: drawing a lasso around something, or dragging the selection by a handle
    let lasso: { id: number; pts: number[] } | null = null;
    let grab: { id: number; kind: Grab; from: [number, number]; xf: Xf } | null = null;

    const local = (e: PointerEvent): [number, number] => {
      const r = b.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const toSheet = (e: PointerEvent): [number, number] => viewToSheet(view.current, ...local(e));
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
    // a pixel stroke keeps one point per new cell, its centre; Shift draws a line from where it started
    const pixelFeed = (e: PointerEvent, s: Stroke) => {
      const d = dimsRef.current, [x, y] = toSheet(e);
      if (x < 0 || y < 0 || x >= d.w || y >= d.h) return;
      const [cx, cy] = centreOf(gridOf(s.g!, d), ...cellAt(gridOf(s.g!, d), x, y));
      if (straight) {
        if (s.p.length >= 6) s.p.length = 3;
        if (s.p.length === 3 && s.p[0] === cx && s.p[1] === cy) return;
      } else if (s.p.length && s.p[s.p.length - 3] === cx && s.p[s.p.length - 2] === cy) return;
      s.p.push(cx, cy, 50);
    };
    const feed = (e: PointerEvent) => {
      const s = cur.current;
      if (!s || s.p.length >= 12000) return;
      if (isPixelTool(s.tool)) return pixelFeed(e, s);
      let [x, y] = toSheet(e);
      const t = e.timeStamp || performance.now();
      rawLast = [x, y];
      const string = (cfg.current.steady / 100) * 40 / view.current.s; // up to 40 screen pixels
      if (!straight && string > 0) {
        if (!brush) brush = [x, y];
        const d = Math.hypot(x - brush[0], y - brush[1]);
        if (s.p.length && d <= string) return;
        if (d > string) brush = [brush[0] + ((x - brush[0]) * (d - string)) / d, brush[1] + ((y - brush[1]) * (d - string)) / d];
        [x, y] = brush;
      }
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
      lastPr = pr;
      s.p.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(pr * 99));
      if (s.tl) s.tl.push(...(lastTilt = tiltOf(e)));
    };
    // a steadied stroke ends where the pen lifted, not a string's length behind it
    const catchUp = (s: Stroke) => {
      if (!brush || !rawLast || straight) return;
      const [bx, by] = brush, [rx, ry] = rawLast;
      const steps = Math.min(12, Math.ceil(Math.hypot(rx - bx, ry - by) / (4 / view.current.s)));
      for (let i = 1; i <= steps && s.p.length < 12000; i++) {
        const k = i / steps;
        s.p.push(Math.round((bx + (rx - bx) * k) * 10) / 10, Math.round((by + (ry - by) * k) * 10) / 10, Math.round(lastPr * (1 - 0.5 * k) * 99));
        if (s.tl) s.tl.push(...lastTilt);
      }
    };
    const moveRing = (e: PointerEvent) => {
      const [x, y] = local(e);
      const k = cfg.current;
      if (k.pixel) {
        const d = dimsRef.current, [sx, sy] = toSheet(e);
        const at = sx < 0 || sy < 0 || sx >= d.w || sy >= d.h ? null : cellAt(gridOf(d.grid!, d), sx, sy);
        const was = hover.current;
        if (at?.[0] !== was?.[0] || at?.[1] !== was?.[1]) {
          hover.current = at;
          redraw();
        }
        return;
      }
      const d = Math.max(6, k.size * TOOLS[k.tool].reach * view.current.s);
      const el = ring.current!;
      el.style.width = el.style.height = d + "px";
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    };
    // two fingers: spread to zoom, twist to turn, move to pan, all around the point between them
    const twoFingers = () => {
      const [a, z] = [...pts.values()];
      const r = b.getBoundingClientRect();
      return { d: Math.hypot(a.x - z.x, a.y - z.y) || 1, a: Math.atan2(z.y - a.y, z.x - a.x), mx: (a.x + z.x) / 2 - r.left, my: (a.y + z.y) / 2 - r.top };
    };
    const startPinch = () => {
      const g = twoFingers();
      pinch = { d: g.d, a: g.a, pt: viewToSheet(view.current, g.mx, g.my), v: { ...view.current } };
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
        lasso = grab = null;
        lassoPath.current = null;
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
      halt.current();
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
      if (k.tool === "select") {
        const S = sel.current;
        const kind = S && grabAt(S, x, y, view.current.s, e.pointerType === "mouse" ? 10 : 20);
        if (S && kind) grab = { id: e.pointerId, kind, from: [x, y], xf: { ...S.xf } };
        else {
          // outside the selection: put it down and start a new one
          if (S) applySel();
          lasso = { id: e.pointerId, pts: [x, y] };
          lassoPath.current = lasso.pts;
        }
        e.preventDefault();
        redraw();
        return;
      }
      const s: Stroke = { tool: k.tool, c: k.color, w: k.size, p: [], l: k.active };
      if (isPixelTool(k.tool)) {
        const d = dimsRef.current, g = gridOf(d.grid ?? 32, d);
        s.g = g.cols;
        s.w = (k.tool === "pixelfill" ? 1 : k.pxSize) * g.cell;
        if (k.sym) s.m = k.sym;
        if (k.tool === "pixelfill") {
          if (x < 0 || y < 0 || x >= d.w || y >= d.h) return;
          s.p.push(...centreOf(g, ...cellAt(g, x, y)), 50);
          commit(s);
          return;
        }
        straight = e.shiftKey ? "free" : null;
        brush = null;
        rawLast = null;
        cur.current = s;
        drawing = e.pointerId;
        feed(e);
        e.preventDefault();
        redraw();
        return;
      }
      if (k.opacity < 1) s.a = Math.round(k.opacity * 100) / 100;
      if (k.sym) s.m = k.sym;
      if (SEEDED.has(k.tool)) s.r = Math.floor(Math.random() * 1e9);
      if (k.tool === "fill") {
        if (x < 0 || y < 0 || x > dimsRef.current.w || y > dimsRef.current.h) return;
        s.w = 1;
        s.p.push(Math.round(x), Math.round(y), 99);
        commit(s);
        return;
      }
      if (e.pointerType === "pen") s.tl = [];
      straight = NO_SNAP.has(k.tool) ? null : k.guides.mode && k.guides.snap ? "guide" : e.shiftKey ? "free" : null;
      lock = null;
      brush = null;
      rawLast = null;
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
        const g = twoFingers();
        const s = Math.max(0.1, Math.min(8, pinch.v.s * (g.d / pinch.d)));
        let r = pinch.v.r + g.a - pinch.a;
        // a twist under 6 degrees stays straight, so zooming doesn't tilt the sheet by accident
        if (Math.abs(r) < (6 * Math.PI) / 180 && Math.abs(pinch.v.r) < 1e-6) r = 0;
        view.current = anchor({ ...pinch.v, s, r }, pinch.pt, g.mx, g.my);
        setZoom(Math.round(s * 100));
        setTurn({ deg: Math.round((((r * 180) / Math.PI) % 360 + 540) % 360 - 180), flip: pinch.v.f < 0 });
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
      if (lasso && e.pointerId === lasso.id) {
        const [x, y] = toSheet(e), p = lasso.pts;
        if (p.length < 1200 && Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) * view.current.s > 3) p.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
        redraw();
        return;
      }
      if (grab && e.pointerId === grab.id && sel.current) {
        const [x, y] = toSheet(e), t = grab.xf, [fx, fy] = grab.from;
        const px = t.cx + t.dx, py = t.cy + t.dy; // the pivot where it is now
        if (grab.kind === "move") sel.current.xf = { ...t, dx: t.dx + x - fx, dy: t.dy + y - fy };
        else if (grab.kind === "scale") {
          const f = Math.max(0.02, Math.hypot(x - px, y - py) / Math.max(1e-3, Math.hypot(fx - px, fy - py)));
          sel.current.xf = { ...t, sx: t.sx * f, sy: t.sy * f };
        } else {
          let r = t.rot + Math.atan2(y - py, x - px) - Math.atan2(fy - py, fx - px);
          if (e.shiftKey) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12); // Shift turns in 15° steps
          sel.current.xf = { ...t, rot: r };
        }
        redraw();
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
      if (lasso && e.pointerId === lasso.id) {
        const pts = lasso.pts;
        lasso = null;
        lassoPath.current = null;
        const box = boundsOf(pts);
        if (e.type !== "pointercancel" && pts.length >= 6 && box[2] - box[0] > 4 && box[3] - box[1] > 4) {
          const p: number[] = [];
          for (let i = 0; i < pts.length; i += 2) p.push(pts[i], pts[i + 1], 0);
          sel.current = { p, box, layer: cfg.current.active, xf: xfAround((box[0] + box[2]) / 2, (box[1] + box[3]) / 2) };
          setSelOn(true);
        }
        redraw();
      }
      if (grab && e.pointerId === grab.id) grab = null;
      if (drawing === e.pointerId) {
        drawing = null;
        const s = cur.current;
        cur.current = null;
        // a pen that reports no tilt (or is held upright the whole way) records none
        if (s && e.type !== "pointercancel") catchUp(s);
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
    const leave = () => {
      if (!hover.current) return;
      hover.current = null;
      redraw();
    };
    c.addEventListener("pointerleave", leave);
    return () => {
      c.removeEventListener("pointerleave", leave);
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("wheel", wheel);
    };
  }, [commit, redraw, zoomAt, applySel]);

  // drawing time: pen down, plus short pauses between strokes
  useEffect(() => {
    const t = setInterval(() => {
      if (cur.current || (lastUp.current && performance.now() - lastUp.current < 4000)) setMs((m) => m + 250);
    }, 250);
    return () => clearInterval(t);
  }, []);

  // undoing a layer copy takes its layer away and redo brings the same one back
  const copies = useRef(new WeakMap<Stroke, LayerDef>());
  // undoing a frame copy takes the whole copied frame away; redo puts it back where it was
  const frameCopies = useRef(new WeakMap<Stroke, { frame: FrameDef; at: number; layers: LayerDef[] }>());
  const frameOfId = (id: number | undefined) => layers.find((l) => l.id === (id ?? 0))?.f ?? 0;
  const isFrameCopy = (x: Stroke, to?: number, from?: number) =>
    x.tool === "dup" && x.src !== undefined && frameOfId(x.l) !== frameOfId(x.src) && (to === undefined || (frameOfId(x.l) === to && frameOfId(x.src) === from));
  /** undo and redo show the frame they change */
  const showFrameOf = (s: Stroke) => {
    if (!anim) return;
    const f = frameOfId(s.l);
    if (f === frame || !anim.frames.some((x) => x.id === f && !x.gone)) return;
    setPlaying(false);
    setFrame(f);
    if (layers.some((l) => l.id === (s.l ?? 0) && !l.gone)) setActive(s.l ?? 0);
  };
  const undo = () => {
    if (sel.current) return cancelSel();
    if (!strokes.length) return;
    const s = strokes[strokes.length - 1];
    if (anim && isFrameCopy(s)) {
      const to = frameOfId(s.l), from = frameOfId(s.src);
      let n = 0;
      while (n < strokes.length && isFrameCopy(strokes[strokes.length - 1 - n], to, from)) n++;
      const ids = new Set(layers.filter((l) => (l.f ?? 0) === to).map((l) => l.id));
      const rest = strokes.slice(0, strokes.length - n);
      // only a frame that holds nothing but the copy goes; otherwise its layers are undone one by one below
      if (!rest.some((x) => ids.has(x.l ?? 0) || (x.src !== undefined && ids.has(x.src)))) {
        const group = strokes.slice(strokes.length - n);
        frameCopies.current.set(group[0], { frame: anim.frames.find((f) => f.id === to)!, at: anim.frames.findIndex((f) => f.id === to), layers: layers.filter((l) => ids.has(l.id)) });
        setLayers((ls) => ls.filter((l) => !ids.has(l.id)));
        setAnim({ ...anim, frames: anim.frames.filter((f) => f.id !== to) });
        if (frame === to) {
          setFrame(from);
          setActive(s.src!);
        }
        setRedo((r) => [...r, ...[...group].reverse()]);
        setStrokes((list) => list.slice(0, -n));
        return;
      }
    }
    showFrameOf(s);
    if (s.tool === "dup") {
      const def = layers.find((l) => l.id === s.l);
      if (def) copies.current.set(s, def);
      setLayers((ls) => ls.filter((l) => l.id !== s.l));
      if (active === s.l && s.src !== undefined) setActive(s.src);
    }
    if (s.tool === "merge" && s.src !== undefined) {
      patchLayer(s.src, { gone: false });
      setActive(s.src);
    }
    setRedo((r) => [...r, s]);
    setStrokes((list) => list.slice(0, -1));
  };
  const redoOne = () => {
    if (!redo.length) return;
    const s = redo[redo.length - 1];
    const fc = frameCopies.current.get(s);
    if (fc && anim) {
      const ids = new Set(fc.layers.map((l) => l.id));
      let n = 0;
      while (n < redo.length && redo[redo.length - 1 - n].tool === "dup" && ids.has(redo[redo.length - 1 - n].l ?? -1)) n++;
      const group = redo.slice(redo.length - n).reverse();
      const next = [...layers, ...fc.layers];
      painter.current!.setLayers(next);
      setLayers(next);
      const frames = [...anim.frames];
      frames.splice(Math.min(fc.at, frames.length), 0, fc.frame);
      setAnim({ ...anim, frames });
      setPlaying(false);
      setFrame(fc.frame.id);
      setActive(group[group.length - 1].l!);
      setStrokes((list) => [...list, ...group]);
      setRedo((r) => r.slice(0, -n));
      return;
    }
    showFrameOf(s);
    if (s.tool === "dup" && s.l !== undefined) {
      const def = copies.current.get(s) ?? { id: s.l, name: "Layer copy", blend: "source-over", opacity: 1 };
      setLayers((ls) => {
        const at = ls.findIndex((l) => l.id === s.src) + 1 || ls.length;
        return [...ls.slice(0, at), def, ...ls.slice(at)];
      });
      setActive(s.l);
    }
    if (s.tool === "merge" && s.src !== undefined) {
      patchLayer(s.src, { gone: true });
      setActive(s.l ?? 0);
    }
    setStrokes((list) => [...list, s]);
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
      const t = (Object.keys(TOOLS) as ToolId[]).find((id) => TOOLS[id].key === k && isPixelTool(id) === pixel && usable(id));
      if (t) setTool(t);
      if (k === "[") (pixel ? setPxSize((s) => Math.max(1, s - 1)) : setSize((s) => Math.max(1, s - (s > 20 ? 4 : 1))));
      if (k === "]") (pixel ? setPxSize((s) => Math.min(4, s + 1)) : setSize((s) => Math.min(80, s + (s >= 20 ? 4 : 1))));
      if (k === "0") fit();
      if (k === "r") rotateBy(e.shiftKey ? -15 : 15);
      if (k === "h") flipView();
      if (k === "=" || k === "+") zoomCentre(1.25);
      if (k === "-") zoomCentre(0.8);
      if (k === "enter" && sel.current) applySel();
      if (pixel && !seat) {
        if (k === "," || k === ".") stepFrame(k === "," ? -1 : 1);
        if (k === "n") newFrame(false);
        if (k === "d") newFrame(true);
        if (k === "k") togglePlay();
        if (k === "o" && anim) setOnion((o) => !o);
      }
      if (k === "escape") {
        if (sel.current) cancelSel();
        else nav(seat?.back ?? "/", { viewTransition: true });
      }
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
  // with frames, the Layers panel holds the chosen frame's layers
  const inFrame = (l: LayerDef) => !anim || (l.f ?? 0) === frame;
  // a merged layer stays in the list for the recording's sake, out of sight
  const shown = layers.filter((l) => !l.gone && inFrame(l));
  const strokesOn = (id: number) => strokes.filter((s) => (s.l ?? 0) === id && !isOp(s)).length;
  const patchLayer = (id: number, patch: Partial<LayerDef>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLayer = () => {
    if (shown.length >= MAX_LAYERS) return say(`Up to ${MAX_LAYERS} layers for now`);
    const id = Math.max(...layers.map((l) => l.id)) + 1;
    const at = layers.findIndex((l) => l.id === active) + 1;
    const used = new Set(layers.map((l) => l.name));
    let n = shown.length + 1;
    while (used.has(`Layer ${n}`)) n++;
    setLayers((ls) => [...ls.slice(0, at), { id, name: `Layer ${n}`, blend: "source-over", opacity: 1, ...(anim ? { f: frame } : {}) }, ...ls.slice(at)]);
    setActive(id);
  };
  const moveLayer = (id: number, d: number) => {
    const i = layers.findIndex((l) => l.id === id);
    let j = i + d;
    while (layers[j] && (layers[j].gone || !inFrame(layers[j]))) j += d;
    if (j < 0 || j >= layers.length) return;
    const next = [...layers];
    [next[i], next[j]] = [next[j], next[i]];
    setLayers(next);
  };
  const askDelete = (l: LayerDef) => {
    if (shown.length < 2) return say("A sheet needs at least one layer");
    if (baseLayers.has(l.id) && remix) return say("This layer holds the piece you are remixing");
    if (!strokes.some((s) => (s.l ?? 0) === l.id)) return deleteLayer(l.id);
    setDoomed(l);
    layerDlg.current!.showModal();
  };
  const deleteLayer = (id: number) => {
    applySel();
    // a layer another one was copied from keeps its strokes, out of sight, so the copy still replays
    const needed = strokes.some((s) => s.src === id);
    const rest = needed ? layers.map((l) => (l.id === id ? { ...l, gone: true } : l)) : layers.filter((l) => l.id !== id);
    setLayers(rest);
    const left = rest.filter((l) => !l.gone && inFrame(l));
    if (active === id) setActive(left[left.length - 1].id);
    if (!needed && strokes.some((s) => (s.l ?? 0) === id)) {
      setStrokes((s) => s.filter((x) => (x.l ?? 0) !== id));
      setRedo((r) => r.filter((x) => (x.l ?? 0) !== id));
    }
  };
  const duplicateLayer = () => {
    if (shown.length >= MAX_LAYERS) return say(`Up to ${MAX_LAYERS} layers for now`);
    applySel();
    const from = activeLayer;
    const id = Math.max(...layers.map((l) => l.id)) + 1;
    const used = new Set(layers.map((l) => l.name));
    let name = `${from.name} copy`;
    for (let n = 2; used.has(name); n++) name = `${from.name} copy ${n}`;
    const at = layers.findIndex((l) => l.id === from.id) + 1;
    const next = [...layers.slice(0, at), { ...from, id, name: name.slice(0, 40), hidden: undefined }, ...layers.slice(at)];
    // the painter needs the new layer before the copy lands on it
    painter.current!.setLayers(next);
    setLayers(next);
    setActive(id);
    commit({ tool: "dup", c: "", w: 0, p: [], l: id, src: from.id });
  };
  const mergeDown = () => {
    const i = layers.findIndex((l) => l.id === activeLayer.id);
    const below = layers.slice(0, i).reverse().find((l) => !l.gone && inFrame(l));
    if (!below) return say("There's no layer below to merge into");
    if (activeLayer.hidden) return say("Show the layer before you merge it");
    if (remix && baseLayers.has(activeLayer.id)) return say("This layer holds the piece you are remixing");
    applySel();
    commit({ tool: "merge", c: "", w: 0, p: [], l: below.id, src: activeLayer.id });
    patchLayer(activeLayer.id, { gone: true });
    setActive(below.id);
    say(`Merged into ${below.name}`);
  };

  // ---------- frames ----------
  const frameList: FrameDef[] = anim ? liveFrames(anim) : [{ id: 0, ms: MS_DEFAULT }];
  const frameNo = Math.max(0, frameList.findIndex((f) => f.id === frame));
  const curFrame = frameList[frameNo] ?? frameList[0];
  const frameDlg = useRef<HTMLDialogElement>(null);
  const goFrame = (id: number) => {
    setPlaying(false);
    applySel();
    if (id === frame) return;
    const here = layers.filter((l) => !l.gone && (l.f ?? 0) === id);
    // the same layer in the other frame, by name, or its top one
    const same = here.find((l) => l.name === activeLayer.name) ?? here[here.length - 1];
    setFrame(id);
    if (same) setActive(same.id);
  };
  const stepFrame = (d: number) => {
    if (frameList.length < 2) return;
    goFrame(frameList[(frameNo + d + frameList.length) % frameList.length].id);
  };
  /** A new frame after this one: empty with the same layers, or a copy, recorded as layer copies. */
  const newFrame = (copy: boolean) => {
    if (frameList.length >= MAX_FRAMES) return say(`Up to ${MAX_FRAMES} frames for now`);
    setPlaying(false);
    applySel();
    const a: Anim = anim ?? { frames: [{ id: 0, ms: MS_DEFAULT }] };
    const id = nextFrameId(a);
    const src = layers.filter((l) => !l.gone && (l.f ?? 0) === frame);
    let nid = Math.max(...layers.map((l) => l.id)) + 1;
    const made: LayerDef[] = src.map((l) => ({ ...l, id: nid++, f: id, ...(copy ? {} : { hidden: undefined }) }));
    const next = [...layers, ...made];
    const at = a.frames.findIndex((f) => f.id === frame) + 1;
    setAnim({ ...a, frames: [...a.frames.slice(0, at), { id, ms: curFrame.ms }, ...a.frames.slice(at)] });
    // the painter needs the new layers before the copies land on them
    painter.current!.setLayers(next);
    setLayers(next);
    setFrame(id);
    setActive((made[src.findIndex((l) => l.id === activeLayer.id)] ?? made[made.length - 1]).id);
    if (copy) made.forEach((m, i) => commit({ tool: "dup", c: "", w: 0, p: [], l: m.id, src: src[i].id }));
    say(copy ? `Frame ${frameNo + 2} is a copy of frame ${frameNo + 1}` : `Frame ${frameNo + 2} added`);
  };
  const askDeleteFrame = () => {
    if (frameList.length < 2) return say("A sheet needs at least one frame");
    const ids = new Set(layers.filter((l) => (l.f ?? 0) === frame).map((l) => l.id));
    if (remix && [...ids].some((id) => baseLayers.has(id))) return say("This frame holds the piece you are remixing");
    if (!strokes.some((s) => ids.has(s.l ?? 0))) return deleteFrame();
    frameDlg.current!.showModal();
  };
  const deleteFrame = () => {
    if (!anim) return;
    setPlaying(false);
    applySel();
    const ids = new Set(layers.filter((l) => (l.f ?? 0) === frame).map((l) => l.id));
    // a frame another one was copied from keeps its strokes, out of the loop, so the copy still replays
    const needed = strokes.some((s) => s.src !== undefined && ids.has(s.src) && !ids.has(s.l ?? 0));
    const frames = needed ? anim.frames.map((f) => (f.id === frame ? { ...f, gone: true as const } : f)) : anim.frames.filter((f) => f.id !== frame);
    const ls = needed ? layers : layers.filter((l) => !ids.has(l.id));
    if (!needed) {
      setStrokes((list) => list.filter((x) => !ids.has(x.l ?? 0)));
      setRedo((r) => r.filter((x) => !ids.has(x.l ?? 0) && !(x.src !== undefined && ids.has(x.src))));
    }
    const left = frames.filter((f) => !f.gone);
    const to = left[Math.min(Math.max(0, frameNo - 1), left.length - 1)].id;
    const top = ls.filter((l) => !l.gone && (l.f ?? 0) === to);
    setLayers(ls);
    setAnim({ ...anim, frames });
    setFrame(to);
    setActive(top[top.length - 1].id);
    say(`Frame ${frameNo + 1} deleted`);
  };
  const moveFrame = (d: -1 | 1) =>
    setAnim((a) => {
      if (!a) return a;
      const fs = [...a.frames];
      const i = fs.findIndex((f) => f.id === frame);
      let j = i + d;
      while (fs[j]?.gone) j += d;
      if (j < 0 || j >= fs.length) return a;
      [fs[i], fs[j]] = [fs[j], fs[i]];
      return { ...a, frames: fs };
    });
  const setFrameMs = (v: number, all = false) => {
    if (!anim) return;
    const m = cleanMs(v);
    setAnim((a) => a && { ...a, frames: a.frames.map((f) => (all || f.id === frame ? { ...f, ms: m } : f)) });
  };
  const togglePlay = () => {
    if (frameList.length < 2) return;
    applySel();
    setPlaying((p) => !p);
  };
  // the loop, played on the sheet at its frames' times
  useEffect(() => {
    if (!playing || !anim) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const f = frameAt(anim, now - t0);
      if (f && f.id !== playAt.current) {
        playAt.current = f.id;
        setPlayFrame(f.id);
        redraw();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      playAt.current = null;
      setPlayFrame(null);
      redraw();
    };
  }, [playing, anim, redraw]);

  // ---------- hand in (pupils) ----------
  const handDlg = useRef<HTMLDialogElement>(null);
  const [handing, setHanding] = useState("");
  const openHand = () => {
    applySel();
    if (!strokes.length) return say("The sheet is empty. Draw something first.");
    setTitle(sheetTitle);
    setHanding("");
    handDlg.current!.showModal();
  };
  const doHand = async (e: React.FormEvent) => {
    e.preventDefault();
    setHanding("busy");
    handedIn.current = true;
    try {
      const name = title.trim() || seat!.title;
      setSheetTitle(name);
      await seat!.save({ title: name, strokes, layers, paper, minutes: ms / 60000 });
      savedSig.current = [strokes, layers, ms, paper, shape, guides, name, promptMode, anim];
      await seat!.handIn();
      handDlg.current!.close();
      nav(seat!.back, { viewTransition: true });
    } catch (err) {
      handedIn.current = false;
      setHanding(err instanceof Error ? err.message : "Handing in didn't work. Try again.");
    }
  };

  // ---------- pin and export ----------
  const openPin = () => {
    applySel();
    if (!strokes.length) return say("The sheet is empty. Draw something first.");
    setTitle(sheetTitle);
    setEnter(promptMode && timeLeft > 0);
    setSending("");
    pinDlg.current!.showModal();
  };
  const doPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = title.trim() || "Untitled";
    const subject = promptMode && enter && timeLeft > 0 ? PROMPT.no : undefined;
    // an animation goes up with its frames; with one frame left playing it goes up as a still
    const out = settle(layers, anim);
    if (publishing) {
      setSending("busy");
      try {
        const all = [...base, ...strokes];
        const id = await publish({
          title: name, strokes: all, layers: out.layers, anim: out.anim, paper, shape, minutes: Math.max(0.1, ms / 60000), subject, remixable,
          // a sample is credited as the copy the server publishes as @tilo
          remixOf: isPublished(remix) ? remix.id : remix?.sample ? publishedSample(remix.id) : undefined,
        });
        setSending("");
        pinDlg.current!.close();
        setSheetTitle(name);
        await save({ title: name, pinned: id });
        lastSheet.set(null);
        nav(`/piece/${id}`, { viewTransition: true });
      } catch (err) {
        setSending(err instanceof Error ? err.message : "Publishing didn't work. Try again.");
      }
      return;
    }
    const id = "mine-" + Date.now().toString(36);
    pinPiece({
      id,
      title: name,
      by: "you",
      minutes: Math.max(0.1, ms / 60000),
      strokes: [...base, ...strokes],
      layers: out.layers,
      anim: out.anim,
      paper,
      shape: shape === "land" ? undefined : shape,
      mine: true,
      stamps: {},
      prompt: subject,
      remixOf: remix?.id,
    });
    pinDlg.current!.close();
    // the sheet stays in your library, marked as pinned; the studio starts fresh next time
    setSheetTitle(name);
    await save({ title: name, pinned: id });
    lastSheet.set(null);
    nav("/gallery?sort=new", { viewTransition: true });
  };

  const [busy, setBusy] = useState<null | "png" | "gif" | "video">(null);
  const [progress, setProgress] = useState(0);
  const [scale, setScale] = useState(1);
  // a pixel sheet also saves at its true size, one pixel a cell
  const exportScales = dims.grid ? [dims.grid / dims.w, 1, 2] : [1, 2];
  const [clearBg, setClearBg] = useState(false);
  const stopVideo = useRef<AbortController | null>(null);
  const allStrokes = useMemo(() => (base.length ? [...base, ...strokes] : strokes), [base, strokes]);
  const all = () => allStrokes;
  const savePNG = async () => {
    setBusy("png");
    try {
      // a frame's pause first, so the button can show it is working before the heavy part
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      // a sheet with frames saves the frame on the sheet
      const out = settle(layers, anim);
      download(await pictureBlob(all(), out.layers, clearBg ? null : paper, scale, dims, out.anim ? frame : undefined), fileName(sheetTitle, "png"));
      say(out.anim ? `PNG of frame ${frameNo + 1} saved` : "PNG saved");
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
      const out = settle(layers, anim);
      const { blob, ext } = await timelapse(all(), out.layers, paper, ms / 60000, { onProgress: setProgress, signal: ac.signal, sheet: dims, anim: out.anim, grid: dims.grid });
      download(blob, fileName(sheetTitle || "tilo-timelapse", ext));
      say("Timelapse saved");
    } catch (err) {
      if ((err as Error).name !== "AbortError") say((err as Error).message || "The timelapse couldn't be made");
    }
    stopVideo.current = null;
    setBusy(null);
  };
  const video = videoType();
  const moving = pixel && !!anim && isAnimated({ anim });
  const gifCells = dims.grid ? gifSizes(dims.grid, dims) : [1];
  const [gifCell, setGifCell] = useState(1);
  const saveGIF = async () => {
    if (!anim || !dims.grid) return;
    setBusy("gif");
    try {
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      const cell = gifCells.includes(gifCell) ? gifCell : 1;
      download(loopGif(all(), layers, clearBg ? null : paper, anim, dims.grid, dims, cell), fileName(sheetTitle || "tilo-loop", "gif"));
      say("GIF saved");
    } catch {
      say("The GIF couldn't be made in this browser");
    }
    setBusy(null);
  };

  const activeLayer = shown.find((l) => l.id === active) ?? shown[shown.length - 1] ?? layers[0];
  const drawn = allStrokes.filter((s) => !isOp(s)).length;
  const shapeLocked = strokes.length > 0 || !!remix;
  const dot = Math.max(3, Math.min(44, size * 1.1));
  const subtitle = seat ? [seat.due, saving === "busy" ? "Saving…" : saving === "failed" ? "Not saved yet, trying again" : saving === "done" ? "Saved to your class" : ""].filter(Boolean).join(" · ") : remix ? `Remix of “${remix.title}” by @${remix.by}` : promptMode ? `Subject No. ${PROMPT.no} · ${PROMPT.title} · 6 inks, 10:00 on the clock` : `${PAPERS[paper].name} · no clock`;

  return (
    <main className={`studio${seat ? " is-seat" : ""}${kid ? " is-kid" : ""}${pixel && !seat ? " has-frames" : ""}`} id="main">
      <div className="studio-top">
        <button className="icon-btn" onClick={() => nav(seat?.back ?? "/", { viewTransition: true })} aria-label={seat ? "Back to your class" : "Back to Tilo"}><Icon name="back" /></button>
        <h1 className="studio-title">
          {sheetTitle || seat?.title || (promptMode ? PROMPT.title : "Blank sheet")}
          <small>{subtitle}</small>
        </h1>
        <span className="sp" />
        {promptMode && <span className={`timer mono num${timeLeft < 60000 ? " is-warn" : ""}`}>{timeLeft > 0 ? fmtMin(timeLeft / 60000) : "Time's up"}</span>}
        <button className="icon-btn" onClick={undo} disabled={!strokes.length} aria-label="Undo" title="Undo · ⌘Z"><Icon name="undo" /></button>
        <button className="icon-btn" onClick={redoOne} disabled={!redo.length} aria-label="Redo" title="Redo · ⇧⌘Z"><Icon name="redo" /></button>
        {!seat && <Link className="icon-btn hide-xs" to="/library" viewTransition aria-label="Your sheets" title="Your sheets"><Icon name="sheets" /></Link>}
        {!kid && <button className="icon-btn" onClick={() => { applySel(); if (!strokes.length && !base.length) return say("Draw something first, then save it out"); exportDlg.current!.showModal(); }} aria-label="Export" title="Export a PNG or a timelapse"><Icon name="download" /></button>}
        <button className="btn btn-line" onClick={() => { applySel(); if (!strokes.length && !base.length) return say("Draw something first, then watch it back"); setReplayKey((k) => k + 1); replayDlg.current!.showModal(); }} aria-label="Replay your sheet"><Icon name="replay" /><span className="hide-s">Replay</span></button>
        {seat ? (
          <button className="btn btn-ink" onClick={openHand}><Icon name="next" />Hand in</button>
        ) : (
          <button className="btn btn-ink" onClick={openPin}><Icon name="pin" /><span className="hide-s">{publishing ? "Publish" : "Pin to gallery"}</span><span className="show-s">{publishing ? "Publish" : "Pin"}</span></button>
        )}
      </div>

      <div className="studio-tools" role="toolbar" aria-label="Brushes and tools">
        {(kid ? [["kid", "Tools"] as [ToolGroup | "kid", string]] : pixel ? PIXEL_GROUPS : GROUPS).map(([g, label]) => (
          <div key={g} className="tool-group" role="group" aria-label={label}>
            <span className="tool-group-name kicker" aria-hidden="true">{label}</span>
            {(Object.keys(TOOLS) as ToolId[]).filter((t) => (g === "kid" ? isPixelTool(t) === pixel : TOOLS[t].group === g) && usable(t)).map((t) => (
              <button key={t} className="tool" aria-pressed={tool === t} aria-label={`${TOOLS[t].label} (${TOOLS[t].key.toUpperCase()})`} title={`${TOOLS[t].label} · ${TOOLS[t].key.toUpperCase()}`} onClick={() => setTool(t)}>
                <Icon name={t} />
                {kid && <span className="tool-name" aria-hidden="true">{KID_NAMES[t] ?? TOOLS[t].label}</span>}
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
        <canvas ref={cv} className="studio-canvas" role="img" aria-label={`Your drawing sheet, ${plural(drawn, "stroke")}`} />
        {selOn && (
          <div className="sel-bar" role="group" aria-label="Selection">
            <button className="btn btn-quiet" onClick={flipSel}><Icon name="flip" size={16} />Flip</button>
            <button className="btn btn-quiet" onClick={cancelSel}>Cancel</button>
            <button className="btn btn-ink" onClick={applySel}>Apply</button>
          </div>
        )}
        <div className="ring" ref={ring} />
        <div className="view-ctl" role="group" aria-label="Zoom">
          <button className="icon-btn" onClick={() => zoomCentre(0.8)} aria-label="Zoom out" title="Zoom out · −"><Icon name="minus" size={18} /></button>
          <button className="view-pct mono num" onClick={fit} title="Fit the sheet · 0">{zoom}%</button>
          <button className="icon-btn" onClick={() => zoomCentre(1.25)} aria-label="Zoom in" title="Zoom in · +"><Icon name="plus" size={18} /></button>
          <button className="icon-btn" onClick={fit} aria-label="Fit the sheet to the screen" title="Fit, straighten and unflip · 0"><Icon name="fit" size={18} /></button>
          <span className="view-sep view-turn" aria-hidden="true" />
          <button className="icon-btn view-turn" onClick={() => rotateBy(-15)} aria-label="Turn the view left" title="Turn left · ⇧R"><Icon name="rotl" size={18} /></button>
          {turn.deg !== 0 && <button className="view-pct mono num" onClick={() => rotateBy(-turn.deg)} title="Straighten">{turn.deg}°</button>}
          <button className="icon-btn view-turn" onClick={() => rotateBy(15)} aria-label="Turn the view right" title="Turn right · R"><Icon name="rotr" size={18} /></button>
          <button className="icon-btn view-turn" onClick={flipView} aria-pressed={turn.flip} aria-label="Mirror the view" title="Mirror the view, to check proportions · H"><Icon name="flip" size={18} /></button>
        </div>
      </div>

      {/* frames are for members' own sheets; schools get them later */}
      {pixel && !seat && (
        <section className="frame-strip" aria-label="Frames">
          {frameList.length < 2 ? (
            <>
              <h2 className="kicker">Frames</h2>
              <p className="frame-hint">One frame is a still. Add a second and it moves.</p>
              <button className="btn btn-line" onClick={() => newFrame(true)} title="Copy this frame · D"><Icon name="copy" size={16} />Copy as frame 2</button>
              <button className="btn btn-quiet" onClick={() => newFrame(false)} title="An empty frame · N"><Icon name="plus" size={16} />Empty frame</button>
            </>
          ) : (
            <>
              <button className="icon-btn frame-play" onClick={togglePlay} aria-pressed={playing} aria-label={playing ? "Stop the loop" : "Play the loop"} title={`${playing ? "Stop" : "Play"} the loop · K`}><Icon name={playing ? "pause" : "play"} /></button>
              <ol className="frames">
                {frameList.map((f, i) => (
                  <li key={f.id}>
                    <button
                      className="frame"
                      aria-pressed={f.id === frame}
                      data-playing={playFrame === f.id ? "" : undefined}
                      onClick={() => goFrame(f.id)}
                      aria-label={`Frame ${i + 1}, ${f.ms} ms`}
                      title={`Frame ${i + 1} · , and . step`}
                    >
                      <canvas
                        ref={(c) => {
                          if (c) thumbs.current.set(f.id, c);
                          else thumbs.current.delete(f.id);
                        }}
                        aria-hidden="true"
                      />
                      <span className="frame-no mono num">{i + 1}</span>
                      <span className="frame-ms mono num">{f.ms}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="frame-ctl">
                <div className="row-btns" role="group" aria-label={`Frame ${frameNo + 1}`}>
                  <button className="icon-btn" onClick={() => newFrame(false)} aria-label="Add an empty frame after this one" title="Empty frame · N"><Icon name="plus" size={18} /></button>
                  <button className="icon-btn" onClick={() => newFrame(true)} aria-label="Copy this frame" title="Copy frame · D"><Icon name="copy" size={18} /></button>
                  <button className="icon-btn" onClick={() => moveFrame(-1)} disabled={frameNo === 0} aria-label="Move the frame earlier" title="Move earlier"><Icon name="back" size={18} /></button>
                  <button className="icon-btn" onClick={() => moveFrame(1)} disabled={frameNo === frameList.length - 1} aria-label="Move the frame later" title="Move later"><Icon name="next" size={18} /></button>
                  <button className="icon-btn" onClick={askDeleteFrame} aria-label="Delete the frame" title="Delete the frame"><Icon name="trash" size={18} /></button>
                </div>
                <button className="icon-btn" onClick={() => setOnion((o) => !o)} aria-pressed={onion} aria-label="Onion skin: the frames before and after, faint" title="Onion skin · O"><Icon name="onion" size={18} /></button>
                <FrameTime ms={curFrame.ms} onSet={(v) => setFrameMs(v)} />
                <button className="btn btn-quiet frame-all" onClick={() => setFrameMs(curFrame.ms, true)} title="Give every frame this time">All</button>
                <label className="frame-loop">
                  <span className="sr-only">Loop</span>
                  <select value={anim?.bounce ? "bounce" : "round"} onChange={(e) => setAnim((a) => a && { ...a, bounce: e.target.value === "bounce" ? true : undefined })}>
                    <option value="round">Loop</option>
                    <option value="bounce">Back and forth</option>
                  </select>
                </label>
              </div>
            </>
          )}
        </section>
      )}

      <aside className="studio-panel" aria-label="Sheet settings" data-tab={tab ?? "none"}>
        <div className="panel-tabs" role="group" aria-label="Settings">
          {PANEL_TABS.filter(([k]) => !kid || k !== "layers").map(([k, label]) => (
            <button key={k} className="panel-tab" aria-pressed={tab === k} aria-controls={`panel-${k}`} onClick={() => setTab((t) => (t === k ? null : k))}>
              {k === "colour" && <span className="chip" style={{ ["--c" as string]: color }} aria-hidden="true" />}
              {k === "brush" ? TOOLS[tool].label : label}
              {k === "brush" && tool !== "fill" && tool !== "lasso" && tool !== "select" && tool !== "pixelfill" && <span className="mono num panel-tab-n">{pixel ? pxSize : size}</span>}
            </button>
          ))}
        </div>
        <div className="panel-cards">
        {seat && (seat.brief || seat.note) && (
          <section className="sheet panel-card seat-brief" data-tab="colour">
            <h2 className="kicker">{seat.title}</h2>
            {seat.brief && <p>{seat.brief}</p>}
            {seat.note && <p className="seat-note"><b>Your teacher says:</b> {seat.note}</p>}
          </section>
        )}

        <section className="sheet panel-card" data-tab="colour" id="panel-colour">
          <h2 className="kicker">Colour</h2>
          {pixel && !promptMode && !seat?.palette && (
            <label className="select">
              <span>Palette</span>
              <select value={pxPal} onChange={(e) => setPxPal(+e.target.value)}>
                {PIXEL_PALETTES.map(([n, c], i) => <option key={n} value={i}>{n} · {c.length}</option>)}
              </select>
            </label>
          )}
          <div className="pal">
            {palette.map((c, i) => (
              <button key={c} className="chip-btn" aria-pressed={c === color} aria-label={`Colour ${promptMode ? PROMPT.names[i] : c}`} onClick={() => setColor(c)}>
                <span className="chip" style={{ ["--c" as string]: c }} />
              </button>
            ))}
          </div>
          {seat?.palette && <p className="hint">Your teacher picked these colours for this task.</p>}
          {!remix && !seat && (
            <label className="check"><input type="checkbox" checked={promptMode} onChange={(e) => setPromptMode(e.target.checked)} /> Use the inks of Subject No. {PROMPT.no} only</label>
          )}
          {!promptMode && !seat?.palette && (
            <>
              {recent.length > 0 && (
                <div className="pal recent" role="group" aria-label="Recent colours">
                  {recent.map((c) => (
                    <button key={c} className="chip-btn" aria-pressed={c === color} aria-label={`Recent colour ${c}`} onClick={() => setColor(c)}>
                      <span className="chip" style={{ ["--c" as string]: c }} />
                    </button>
                  ))}
                </div>
              )}
              <button className="mix-btn" aria-expanded={mixing} onClick={() => setMixing((m) => !m)}>
                <span className="chip" style={{ ["--c" as string]: color }} aria-hidden="true" />
                Mix your own
                <Icon name={mixing ? "up" : "down"} size={16} />
              </button>
              {mixing && <ColorPicker value={color} onChange={setColor} />}
              {!kid && <p className="hint hint-keys">Hold Alt and click the sheet to pick a colour up.</p>}
            </>
          )}
        </section>

        <section className="sheet panel-card" data-tab="brush" id="panel-brush">
          <h2 className="kicker">{TOOLS[tool].label}</h2>
          {pixel ? (
            <>
              {tool !== "pixelfill" && (
                <label className="slider">
                  <span>Size</span>
                  <input type="range" min={1} max={4} value={pxSize} onChange={(e) => setPxSize(+e.target.value)} />
                  <span className="mono num">{pxSize}</span>
                </label>
              )}
              <p className="hint">
                {tool === "pixelfill"
                  ? kid
                    ? "Fills the cells around the one you tap that share its colour."
                    : "Fills the cells around the one you click that share its colour, reading every visible layer."
                  : `${pxSize === 1 ? "One cell" : `${pxSize} × ${pxSize} cells`} at a time.${kid ? "" : " Hold Shift for a straight line from where you start."}`}
              </p>
            </>
          ) : tool === "select" ? (
            <p className="hint">Draw around part of {activeLayer.name}. Drag inside it to move it, a corner to scale it, the round handle to turn it (Shift for 15° steps). Enter puts it down, Esc puts it back.</p>
          ) : (
            <>
              {tool !== "fill" && tool !== "lasso" && (
                <label className="slider">
                  <span>Size</span>
                  <input type="range" min={1} max={80} value={size} onChange={(e) => setSize(+e.target.value)} />
                  <span className="mono num">{size}</span>
                </label>
              )}
              {!kid && <label className="slider">
                <span>Opacity</span>
                <input type="range" min={5} max={100} step={5} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(+e.target.value / 100)} />
                <span className="mono num">{Math.round(opacity * 100)}</span>
              </label>}
              {tool !== "fill" && !kid && (
                <label className="slider" title="The brush trails the pointer on a string, which smooths out shaky lines">
                  <span>Steady</span>
                  <input type="range" min={0} max={100} step={5} value={steady} onChange={(e) => setSteady(+e.target.value)} />
                  <span className="mono num">{steady}</span>
                </label>
              )}
              <span className="dot" aria-hidden="true" hidden={tool === "fill" || tool === "lasso"}><i style={{ width: dot, height: dot, background: color, opacity }} /></span>
            </>
          )}
        </section>

        {!kid && <section className="sheet panel-card" data-tab="layers" id="panel-layers">
          <div className="card-head">
            <h2 className="kicker">Layers</h2>
            <button className="icon-btn" onClick={addLayer} aria-label="Add a layer" title="Add a layer"><Icon name="plus" size={18} /></button>
          </div>
          <ol className="layers">
            {[...shown].reverse().map((l) => (
              <li key={l.id} className={l.id === active ? "is-active" : undefined}>
                <button className="icon-btn" onClick={() => patchLayer(l.id, { hidden: !l.hidden })} aria-label={`${l.hidden ? "Show" : "Hide"} ${l.name}`} aria-pressed={!l.hidden}><Icon name={l.hidden ? "eyeoff" : "eye"} size={18} /></button>
                {naming === l.id ? (
                  <input
                    className="layer-rename"
                    defaultValue={l.name}
                    maxLength={40}
                    autoFocus
                    aria-label="Layer name"
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name) patchLayer(l.id, { name });
                      setNaming(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setNaming(null);
                      e.stopPropagation();
                    }}
                  />
                ) : (
                  <button className="layer-name" onClick={() => setActive(l.id)} onDoubleClick={() => setNaming(l.id)} aria-pressed={l.id === active} title="Double-click to rename">
                    {l.name}
                    <small>{plural(strokesOn(l.id) + (remix ? base.filter((s) => (s.l ?? 0) === l.id).length : 0), "stroke")}{l.blend !== "source-over" ? ` · ${BLENDS.find((b) => b[0] === l.blend)?.[1]}` : ""}{l.opacity < 1 ? ` · ${Math.round(l.opacity * 100)}%` : ""}</small>
                  </button>
                )}
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
              <button className="icon-btn" onClick={() => setNaming(activeLayer.id)} aria-label="Rename the layer" title="Rename"><Icon name="rename" size={18} /></button>
              <button className="icon-btn" onClick={duplicateLayer} aria-label="Duplicate the layer" title="Duplicate"><Icon name="copy" size={18} /></button>
              <button className="icon-btn" onClick={mergeDown} aria-label="Merge the layer into the one below" title="Merge down"><Icon name="merge" size={18} /></button>
              <button className="icon-btn" onClick={() => moveLayer(activeLayer.id, 1)} aria-label="Move the layer up" title="Move up"><Icon name="up" size={18} /></button>
              <button className="icon-btn" onClick={() => moveLayer(activeLayer.id, -1)} aria-label="Move the layer down" title="Move down"><Icon name="down" size={18} /></button>
              <button className="icon-btn" onClick={() => askDelete(activeLayer)} aria-label="Delete the layer" title="Delete the layer"><Icon name="trash" size={18} /></button>
            </div>
          </div>
        </section>}

        <section className="sheet panel-card" data-tab="sheet" id="panel-sheet">
          <h2 className="kicker">Paper</h2>
          <div className="papers" role="group" aria-label="Paper">
            {(pixel ? PLAIN_PAPERS : PAPER_IDS).map((id) => (
              <button key={id} className="paper-btn" aria-pressed={paper === id} aria-label={PAPERS[id].name} title={PAPERS[id].name} onClick={() => setPaper(id)}>
                <span className={`paper-swatch p-${id}`} style={{ ["--pc" as string]: PAPERS[id].color }} />
              </button>
            ))}
          </div>
          <p className="hint">{PAPERS[paper].name}. {PAPERS[paper].depth ? "Charcoal catches on its grain." : "No grain at all."}</p>
          {pixel && <label className="check"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Show the grid when zoomed in</label>}
        </section>

        <section className="sheet panel-card" data-tab="sheet">
          <h2 className="kicker">Symmetry</h2>
          <div className="seg" role="group" aria-label="Symmetry">
            {SYMMETRY.filter(([v]) => !pixel || v[0] !== "r").map(([v, n]) => <button key={v || "off"} aria-pressed={sym === v} onClick={() => setSym(v)}>{n}</button>)}
          </div>
        </section>

        {!pixel && !kid && <section className="sheet panel-card" data-tab="sheet">
          <h2 className="kicker">Perspective</h2>
          <div className="seg" role="group" aria-label="Perspective guides">
            {PERSPECTIVE.map(([v, n]) => <button key={v} aria-pressed={guides.mode === v} onClick={() => setGuides((g) => ({ ...g, mode: v }))}>{n}</button>)}
          </div>
          {guides.mode > 0 && <label className="check"><input type="checkbox" checked={guides.snap} onChange={(e) => setGuides((g) => ({ ...g, snap: e.target.checked }))} /> Snap strokes to the guides</label>}
          <p className="hint">{guides.mode ? "Drag the blue points to move them. Guides stay out of the picture." : kid ? "" : "Hold Shift for a straight line."}</p>
        </section>}

        <section className="sheet panel-card" data-tab="sheet">
          <h2 className="kicker">This sheet</h2>
          <div className="field">
            <label htmlFor="sheet-title">Title</label>
            <input type="text" id="sheet-title" maxLength={60} placeholder="Untitled" autoComplete="off" value={sheetTitle} onChange={(e) => setSheetTitle(e.target.value)} />
          </div>
          {!seat && <><div className="seg" role="group" aria-label="Kind of sheet">
            <button aria-pressed={!pixel} disabled={shapeLocked && pixel} onClick={() => setShape("land")}>Drawing</button>
            <button aria-pressed={pixel} disabled={shapeLocked && !pixel} onClick={() => setShape("px32")}>Pixel art</button>
          </div>
          <div className="seg" role="group" aria-label={pixel ? "Grid" : "Sheet shape"}>
            {(pixel ? PIXEL_SHAPES : DRAW_SHAPES).map((id) => (
              <button key={id} aria-pressed={shape === id} disabled={shapeLocked && shape !== id} onClick={() => setShape(id)}>{SHAPES[id].name}</button>
            ))}
          </div>
          <p className="hint">{shapeLocked ? "The shape is set once the drawing starts." : pixel ? `${dims.grid} cells across. Choose before you draw.` : `${dims.w} × ${dims.h}. Choose before you draw.`}</p></>}
          <div className="stats">
            <div><b className="num">{drawn.toLocaleString()}</b><span>strokes</span></div>
            <div><b className="num">{fmtMin(ms / 60000)}</b><span>drawing time</span></div>
          </div>
          {seat ? (
            <p className="hint">Saved to your class as you draw, so you can carry on from any computer.</p>
          ) : (
            <p className="hint">Saved on this device as you draw. <Link to="/library" viewTransition>All your sheets</Link> · <button type="button" className="link-btn" onClick={openFeedback}>Send feedback</button></p>
          )}
        </section>

        {!kid && <section className="sheet panel-card opt">
          <h2 className="kicker">Keys</h2>
          <p className="keys">
            {(Object.keys(TOOLS) as ToolId[]).filter((t) => isPixelTool(t) === pixel).map((t) => <span key={t}><kbd>{TOOLS[t].key.toUpperCase()}</kbd> {TOOLS[t].label.toLowerCase()} </span>)}
            <span><kbd>[</kbd> <kbd>]</kbd> size </span><span><kbd>⌘Z</kbd> undo </span><span><kbd>Shift</kbd> straight line </span><span><kbd>Space</kbd> drag to move </span><span><kbd>⌘</kbd>+scroll or pinch to zoom </span><span><kbd>0</kbd> fit </span><span><kbd>R</kbd> <kbd>⇧R</kbd> turn </span><span><kbd>H</kbd> mirror view </span><span><kbd>Alt</kbd>+click pick colour </span>{pixel ? (!seat && <span><kbd>,</kbd> <kbd>.</kbd> frame before and after </span>) : <span><kbd>Enter</kbd> <kbd>Esc</kbd> put a selection down or back</span>}
            {pixel && !seat && <><span><kbd>N</kbd> new frame </span><span><kbd>D</kbd> copy frame </span><span><kbd>K</kbd> play </span><span><kbd>O</kbd> onion skin</span></>}
          </p>
        </section>}
        </div>
      </aside>

      {seat && (
        <dialog ref={handDlg} aria-labelledby="hand-h">
          <form className="small-sheet sheet" onSubmit={doHand}>
            <h2 id="hand-h">Hand it in?</h2>
            <p>Your teacher gets it with its whole recording, so they can watch how you drew it. After this you can't change it, unless they send it back to you.</p>
            <div className="field"><label htmlFor="hand-title">Give it a title</label><input type="text" id="hand-title" maxLength={60} placeholder={seat.title} autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            {handing && handing !== "busy" && <p className="field-note is-error" role="alert">{handing}</p>}
            <div className="row"><button type="button" className="btn btn-quiet" onClick={() => handDlg.current!.close()}>Keep drawing</button><button type="submit" className="btn btn-ink" disabled={handing === "busy"}>{handing === "busy" ? "Handing in…" : "Hand it in"}</button></div>
          </form>
        </dialog>
      )}

      <dialog ref={pinDlg} aria-labelledby="pin-h">
        <form className="small-sheet sheet" onSubmit={doPin}>
          <h2 id="pin-h">{publishing ? "Publish to the gallery" : "Pin to the gallery"}</h2>
          <p>
            {publishing
              ? `Your piece goes up as @${profile!.handle}, with its full recording, so anyone can replay it from the first stroke. Tilo checks every piece before it goes into the gallery.`
              : ACCOUNTS
                ? <>Your piece is pinned with its full recording, on this device only. <Link to="/account">Sign in</Link> to publish it for everyone.</>
                : "Your piece goes up with its full recording. Until accounts open, it stays on this device."}
          </p>
          <div className="field"><label htmlFor="pin-title">Title</label><input type="text" id="pin-title" maxLength={60} placeholder="Untitled" autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          {promptMode && (
            <label className="check"><input type="checkbox" checked={enter} disabled={timeLeft <= 0} onChange={(e) => setEnter(e.target.checked)} /> {timeLeft > 0 ? `Enter it for Subject No. ${PROMPT.no}` : "Over the 10:00 limit, so it can't be entered"}</label>
          )}
          {publishing && <label className="check"><input type="checkbox" checked={remixable} onChange={(e) => setRemixable(e.target.checked)} /> Others may remix it</label>}
          {sending && sending !== "busy" && <p className="field-note is-error" role="alert">{sending}</p>}
          <div className="row"><button type="button" className="btn btn-quiet" onClick={() => pinDlg.current!.close()}>Keep drawing</button><button type="submit" className="btn btn-ink" disabled={sending === "busy"}>{publishing ? (sending === "busy" ? "Publishing…" : "Publish it") : "Pin it"}</button></div>
        </form>
      </dialog>

      <dialog ref={exportDlg} aria-labelledby="export-h" onCancel={(e) => busy === "video" && e.preventDefault()}>
        <div className="small-sheet sheet export">
          <h2 id="export-h">Save it out</h2>
          <section>
            <h3>Picture</h3>
            <div className="seg" role="group" aria-label="Picture size" style={{ ["--n" as string]: exportScales.length }}>
              {exportScales.map((v) => <button key={v} aria-pressed={scale === v} onClick={() => setScale(v)}>{Math.round(dims.w * v)} × {Math.round(dims.h * v)}</button>)}
            </div>
            {pixel && <p>{scale < 1 ? "One pixel a cell, the picture's true size." : "Every cell sharp, as on the sheet."}{anim && isAnimated({ anim }) ? ` This is frame ${frameNo + 1}.` : ""}</p>}
            <label className="check"><input type="checkbox" checked={clearBg} onChange={(e) => setClearBg(e.target.checked)} /> Leave out the paper (transparent)</label>
            <button className="btn btn-ink" onClick={savePNG} disabled={!!busy}><Icon name="download" />{busy === "png" ? "Making the PNG…" : "Download PNG"}</button>
          </section>
          {moving && dims.grid && (
            <section>
              <h3>Animated GIF</h3>
              <div className="seg" role="group" aria-label="GIF size" style={{ ["--n" as string]: gifCells.length }}>
                {gifCells.map((v) => {
                  const g = gridOf(dims.grid!, dims);
                  return <button key={v} aria-pressed={(gifCells.includes(gifCell) ? gifCell : 1) === v} onClick={() => setGifCell(v)}>{g.cols * v} × {g.rows * v}</button>;
                })}
              </div>
              <p>The loop{anim?.bounce && liveFrames(anim).length > 2 ? ", forward and back," : ""} with each frame's time, playing for ever. {gifCell > 1 && gifCells.includes(gifCell) ? "Every cell sharp." : "One pixel a cell."} Made here in the browser{clearBg ? ", with no paper" : ""}.</p>
              <button className="btn btn-line" onClick={saveGIF} disabled={!!busy}><Icon name="download" />{busy === "gif" ? "Making the GIF…" : "Download GIF"}</button>
            </section>
          )}
          <section>
            <h3>Timelapse</h3>
            {video ? (
              <>
                <p>Your recording played back as {video[1] === "mp4" ? "an MP4" : "a WebM"} video, made here in the browser{moving ? ", then the loop" : ""}. It plays in real time, so keep this tab open.</p>
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
          <p>Everything on it goes, and its strokes leave the recording too. Undo won't bring them back.</p>
          <div className="row">
            <button className="btn btn-quiet" onClick={() => layerDlg.current!.close()}>Keep it</button>
            <button className="btn btn-ink" onClick={() => { if (doomed) deleteLayer(doomed.id); layerDlg.current!.close(); }}>Delete the layer</button>
          </div>
        </div>
      </dialog>

      <dialog ref={frameDlg} aria-labelledby="frame-h">
        <div className="small-sheet sheet">
          <h2 id="frame-h">Delete frame {frameNo + 1}?</h2>
          <p>Everything drawn on it goes, and its strokes leave the recording too, unless another frame was copied from it. Undo won't bring it back.</p>
          <div className="row">
            <button className="btn btn-quiet" onClick={() => frameDlg.current!.close()}>Keep it</button>
            <button className="btn btn-ink" onClick={() => { deleteFrame(); frameDlg.current!.close(); }}>Delete the frame</button>
          </div>
        </div>
      </dialog>

      <dialog ref={replayDlg} className="replay-dlg" aria-label="Replay of your sheet" onClick={(e) => e.target === e.currentTarget && replayDlg.current!.close()}>
        <div className="replay-box sheet" style={{ ["--aspect" as string]: dims.w / dims.h }}>
          <ReplayCanvas key={replayKey} strokes={allStrokes} layers={layers} anim={anim} paper={paper} shape={shape} mode="once" label="Your sheet, replaying" />
          <div className="row"><span className="kicker">{plural(drawn, "stroke")} · {fmtMin(ms / 60000)}</span><button className="btn btn-quiet" onClick={() => replayDlg.current!.close()}>Close</button></div>
        </div>
      </dialog>

      <div className="toast" role="status" data-show={toast ? "" : undefined}>{toast}</div>
    </main>
  );
}
