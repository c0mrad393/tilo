import { useEffect, useRef } from "react";
import { Replayer, play, prefersReducedMotion } from "../engine/replay";
import type { Stroke } from "../engine/stroke";

/* A transparent canvas over a block of the page. `build` gets the block's size and a
   function that measures child elements, and returns pen strokes in CSS pixels. The marks
   are drawn once with the replay engine, then redrawn still on resize. */
export type Measure = (selector: string) => DOMRect | null;

export function Annotate({ build, delay = 500, ms = 1600 }: { build: (w: number, h: number, measure: Measure, ink: string) => Stroke[]; delay?: number; ms?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const buildRef = useRef(build);
  buildRef.current = build;
  useEffect(() => {
    const cv = ref.current!;
    const host = cv.parentElement!;
    let cancel = () => {};
    let timer = 0;
    let first = true;
    const render = () => {
      cancel();
      const r = host.getBoundingClientRect();
      lastW = r.width;
      lastH = r.height;
      const dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      const measure: Measure = (sel) => {
        const el = host.querySelector(sel);
        if (!el) return null;
        const e = el.getBoundingClientRect();
        return new DOMRect(e.left - r.left, e.top - r.top, e.width, e.height);
      };
      const ink = getComputedStyle(cv).color;
      const rep = new Replayer(cv, buildRef.current(r.width, r.height, measure, ink), null, r.width);
      if (first && !prefersReducedMotion()) {
        rep.draw(0);
        timer = window.setTimeout(() => (cancel = play(ms, (p) => rep.draw(p))), delay);
      } else rep.draw(1);
      first = false;
    };
    let ready = false;
    let lastW = 0;
    let lastH = 0;
    const ro = new ResizeObserver(() => {
      const r = host.getBoundingClientRect();
      if (!ready || (Math.abs(r.width - lastW) < 1 && Math.abs(r.height - lastH) < 1)) return;
      lastW = r.width;
      lastH = r.height;
      render();
    });
    document.fonts.ready.then(() => {
      ready = true;
      render();
      ro.observe(host);
    });
    return () => {
      cancel();
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [delay, ms]);
  return <canvas ref={ref} className="annotate" aria-hidden="true" />;
}
