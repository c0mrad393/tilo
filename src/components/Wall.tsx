import { useEffect, useRef, useState } from "react";
import { capture } from "../engine/capture";
import { drawStroke, TOOLS, type Stroke, type ToolId } from "../engine/stroke";
import { WALL, WALL_COLORS, WALL_SEED } from "../data/wall";
import { wallMarks } from "../data/local";
import { Icon } from "./Icon";

type WallTool = Extract<ToolId, "pencil" | "ink" | "marker"> | "hand";
const SIZES: [number, number][] = [[3, 4], [6, 8], [14, 14]];
const K = 1.5; // offscreen resolution per wall unit

/* The shared wall. In Stage 0 it runs on this device only: example doodles plus your marks. */
export function Wall() {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<WallTool>("ink");
  const [color, setColor] = useState(WALL_COLORS[0]);
  const [size, setSize] = useState(6);
  const [count, setCount] = useState(0);
  const cfg = useRef({ tool, color, size });
  cfg.current = { tool, color, size };
  const ringSize = useRef(() => {});

  useEffect(() => {
    const wbox = box.current!, wc = cv.current!;
    const mine = wallMarks.load();
    const strokes: Stroke[] = [...WALL_SEED, ...mine];
    const off = document.createElement("canvas");
    off.width = WALL.w * K;
    off.height = WALL.h * K;
    const octx = off.getContext("2d")!;
    strokes.forEach((s) => drawStroke(octx, s, K));
    setCount(strokes.length);
    const view = { s: 1, ox: 0, oy: 0 };
    let cur: Stroke | null = null;

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
      const d = Math.max(6, sz * (t === "hand" ? 1 : TOOLS[t].reach) * view.s);
      ring.current!.style.width = ring.current!.style.height = d + "px";
    };
    const toWall = (e: PointerEvent): [number, number] => {
      const r = wbox.getBoundingClientRect();
      return [view.ox + (e.clientX - r.left) / view.s, view.oy + (e.clientY - r.top) / view.s];
    };
    let pan: { x: number; y: number; ox: number; oy: number; id: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (cfg.current.tool !== "hand") return;
      pan = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy, id: e.pointerId };
      wbox.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const r = wbox.getBoundingClientRect();
      ring.current!.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px) translate(-50%, -50%)`;
      if (pan && e.pointerId === pan.id) {
        view.ox = Math.max(0, Math.min(WALL.w - r.width / view.s, pan.ox - (e.clientX - pan.x) / view.s));
        view.oy = Math.max(0, Math.min(WALL.h - r.height / view.s, pan.oy - (e.clientY - pan.y) / view.s));
        paint();
      }
    };
    const onUp = () => (pan = null);
    wbox.addEventListener("pointerdown", onDown);
    wbox.addEventListener("pointermove", onMove);
    wbox.addEventListener("pointerup", onUp);
    const stopCapture = capture(wbox, {
      toLocal: toWall,
      start: () => {
        const c = cfg.current;
        if (c.tool === "hand") return false;
        cur = { tool: c.tool, c: c.color, w: c.size, p: [] };
      },
      point: (x, y, pr) => {
        if (!cur || cur.p.length >= 1800) return;
        cur.p.push(Math.round(x), Math.round(y), pr);
        paint();
      },
      end: () => {
        const s = cur;
        cur = null;
        if (s && s.p.length) {
          s.t = Date.now();
          strokes.push(s);
          mine.push(s);
          drawStroke(octx, s, K);
          wallMarks.save(mine);
          setCount(strokes.length);
        }
        paint();
      },
    });
    const ro = new ResizeObserver(fit);
    ro.observe(wbox);
    return () => {
      ro.disconnect();
      stopCapture();
      wbox.removeEventListener("pointerdown", onDown);
      wbox.removeEventListener("pointermove", onMove);
      wbox.removeEventListener("pointerup", onUp);
    };
  }, []);

  useEffect(() => ringSize.current(), [tool, size]);

  return (
    <div className="wall-shell">
      <div className="wall-frame plate reg">
        <div className={`wall${tool === "hand" ? " panning" : ""}`} ref={box}>
          <canvas ref={cv} role="img" aria-label="The wall: a large sheet of paper with marks from many people" />
          <p className="wall-note serif">This sheet belongs to everyone. <b>Leave a mark.</b></p>
          <div className="ring" ref={ring} />
        </div>
      </div>
      <div className="tray" role="toolbar" aria-label="Wall tools">
        <div className="tray-grp">
          {(["pencil", "ink", "marker", "hand"] as WallTool[]).map((t) => (
            <button key={t} className="tool" aria-pressed={tool === t} aria-label={t === "hand" ? "Move around the wall" : TOOLS[t].label} title={t === "hand" ? "Move around" : TOOLS[t].label} onClick={() => setTool(t)}>
              <Icon name={t} />
            </button>
          ))}
        </div>
        <div className="tray-grp">
          {WALL_COLORS.map((c) => (
            <button key={c} className="chip-btn" aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => { setColor(c); if (tool === "hand") setTool("ink"); }}>
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
        <div className="tray-status kicker">
          <span className="live is-off">Preview wall</span>
          <span>{count.toLocaleString()} marks</span>
        </div>
      </div>
      <p className="wall-msg serif">For now your marks stay on this device; the shared wall opens in Stage 4. The doodles already here are examples.</p>
    </div>
  );
}
