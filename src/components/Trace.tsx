import { useEffect, useRef, type Ref } from "react";
import { strokeWeight } from "../engine/replay";
import { pointsOf, type Stroke } from "../engine/stroke";

const light = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  return (n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 215;
};

/* The trace of a hand: every stroke of a piece laid end to end on the replay's timeline,
   drawn as its pressure over time in its own colour. A replay sets --pos (0-1) on it to
   move the playhead; `onSeek` makes it scrubbable with a pointer. */
export function Trace({ strokes, pos, onSeek, ref }: { strokes: Stroke[]; pos?: number; onSeek?: (pos: number) => void; ref?: Ref<HTMLDivElement> }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current!;
    const draw = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      const W = Math.max(1, Math.round(c.clientWidth * dpr)), H = Math.max(1, Math.round(c.clientHeight * dpr));
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, W, H);
      const total = strokes.reduce((t, s) => t + strokeWeight(s), 0) || 1;
      let t = 0;
      const mid = H / 2;
      const step = Math.max(2, Math.round(2.5 * dpr));
      for (const s of strokes) {
        const x0 = (t / total) * W;
        t += strokeWeight(s);
        const x1 = (t / total) * W;
        const n = pointsOf(s);
        const cols = Math.max(1, Math.round(x1 - x0));
        ctx.globalAlpha = s.tool === "wash" ? 0.4 : s.tool === "eraser" ? 0.25 : 0.95;
        ctx.fillStyle = s.tool === "eraser" || light(s.c) ? "#8f8d84" : s.c;
        // height mixes pressure with how fast the hand moved, so steady pressure still reads as a hand
        // drawn as hairlines with gaps, like a seismograph, rather than a solid band
        for (let j = 0; j < (cols > 3 ? cols - 1 : cols); j += step) {
          const k = Math.min(n - 1, Math.floor((j / cols) * n));
          const pr = n ? s.p[k * 3 + 2] / 99 : 0.5;
          const nx = Math.min(n - 1, k + 1);
          const d = n > 1 ? Math.hypot(s.p[nx * 3] - s.p[k * 3], s.p[nx * 3 + 1] - s.p[k * 3 + 1]) : 0;
          const h = Math.max(2 * dpr, (0.1 + 0.9 * (0.55 * pr + 0.45 * Math.min(1, d / 26))) * (H - 4 * dpr));
          ctx.fillRect(x0 + j, mid - h / 2, Math.max(1, dpr), h);
        }
      }
      ctx.globalAlpha = 1;
    };
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [strokes]);

  const seekAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek?.(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  };
  return (
    <div
      ref={ref}
      className={`trace${onSeek ? " is-seekable" : ""}`}
      style={pos === undefined ? undefined : { ["--pos" as string]: pos }}
      aria-hidden="true"
      onPointerDown={onSeek ? (e) => { e.currentTarget.setPointerCapture(e.pointerId); seekAt(e); } : undefined}
      onPointerMove={onSeek ? (e) => e.buttons && seekAt(e) : undefined}
    >
      <canvas ref={cv} />
    </div>
  );
}
