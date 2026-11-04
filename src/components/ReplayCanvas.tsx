import { useEffect, useRef } from "react";
import { Replayer, prefersReducedMotion } from "../engine/replay";
import type { PaperId } from "../engine/paper";
import { sizeOf, type LayerDef, type ShapeId, type Stroke } from "../engine/stroke";

export type ReplayMode = "static" | "loop" | "once" | "hover";

interface Props {
  strokes: Stroke[];
  layers?: LayerDef[];
  mode?: ReplayMode;
  /** The paper, or null to let the material underneath show through. */
  paper?: PaperId | null;
  /** Width of the drawing in sheet units (1600 for pieces, 2000 for the wall). */
  sheetWidth?: number;
  /** A piece's sheet shape; sets the drawing's size instead of `sheetWidth`. */
  shape?: ShapeId;
  /** The box's width over height; a sheet of another shape is centred in it. Defaults to the sheet's own. */
  aspect?: number;
  label: string;
  className?: string;
  onProgress?: (pos: number, stroke: number) => void;
}

/* A canvas that shows a recording. It sizes itself to its box, plays only while it is on
   screen, and falls back to the finished picture when the viewer prefers less motion. */
export function ReplayCanvas({ strokes, layers, mode = "static", paper = "smooth", sheetWidth = 1600, shape, aspect: box, label, className, onProgress }: Props) {
  const sheet = shape ? sizeOf({ shape }) : null;
  const aspect = box ?? (sheet ? sheet.w / sheet.h : 4 / 3);
  const ref = useRef<HTMLCanvasElement>(null);
  const progress = useRef(onProgress);
  progress.current = onProgress;

  useEffect(() => {
    const cv = ref.current!;
    let rep: Replayer | null = null;
    let raf = 0;
    let wait = 0;
    let pos = mode === "static" ? 1 : 0;
    let visible = false;
    let playing = false;
    const reduced = prefersReducedMotion();
    const dur = Math.min(16000, 4500 + strokes.length * 45);

    const size = () => {
      const w = cv.clientWidth;
      if (!w) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      const W = Math.round(w * dpr);
      if (rep && cv.width === W) return;
      cv.width = W;
      cv.height = Math.round(W / aspect);
      rep = sheet ? new Replayer(cv, strokes, paper, sheet.w, layers, sheet.h) : new Replayer(cv, strokes, paper, sheetWidth, layers);
      rep.draw(reduced || mode === "static" || mode === "hover" ? 1 : pos);
    };
    const frame = (last: number) => (now: number) => {
      if (!rep || !playing) return;
      pos = Math.min(1, pos + (now - last) / dur);
      const idx = rep.draw(pos);
      progress.current?.(pos, idx);
      if (pos < 1) raf = requestAnimationFrame(frame(now));
      else {
        playing = false;
        if (mode === "loop") wait = window.setTimeout(() => { pos = 0; start(); }, 1800);
      }
    };
    const start = () => {
      if (reduced || playing || !visible) return;
      playing = true;
      raf = requestAnimationFrame(frame(performance.now()));
    };
    const stop = () => {
      playing = false;
      cancelAnimationFrame(raf);
      clearTimeout(wait);
    };

    const ro = new ResizeObserver(size);
    ro.observe(cv);
    size();
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (!visible) stop();
      else if (mode === "loop" || (mode === "once" && pos < 1)) start();
    }, { threshold: 0.25 });
    io.observe(cv);

    const enter = () => {
      if (mode !== "hover" || reduced) return;
      stop();
      pos = 0;
      visible = true;
      start();
    };
    const leave = () => {
      if (mode !== "hover") return;
      stop();
      pos = 1;
      rep?.draw(1);
    };
    const host = cv.closest<HTMLElement>("[data-replay-host]") ?? cv;
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("focusin", enter);
    host.addEventListener("focusout", leave);
    // a canvas that mounts under the pointer (its recording arrived during the hover) starts at once
    if (mode === "hover" && host.matches(":hover, :focus-within")) enter();
    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("focusin", enter);
      host.removeEventListener("focusout", leave);
    };
  }, [strokes, layers, mode, paper, sheetWidth, shape, aspect]);

  return <canvas ref={ref} className={className} role="img" aria-label={label} style={{ display: "block", width: "100%", aspectRatio: String(aspect) }} />;
}
