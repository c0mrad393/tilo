import { useEffect, useRef } from "react";
import { Replayer, play, prefersReducedMotion } from "../engine/replay";
import { Sketch } from "../engine/sketch";
import type { Stroke } from "../engine/stroke";

/* The wordmark is a recording, like everything else on Tilo: it writes itself on load. */
export function letters(color: string): Stroke[] {
  const S = new Sketch(42);
  S.poly([[70, 40], [68, 100], [70, 150], [84, 168], [106, 164]], "ink", color, 15, 0.6, 8);
  S.poly([[38, 88], [110, 82]], "ink", color, 13, 0.4, 8);
  S.poly([[150, 94], [149, 130], [152, 166]], "ink", color, 15, 0.4, 8);
  S.poly([[149, 52], [152, 55]], "marker", color, 10, 0, 4);
  S.poly([[198, 26], [196, 100], [198, 152], [211, 168], [230, 165]], "ink", color, 15, 0.6, 8);
  S.circle(292, 128, 40, "ink", color, 14, 1.2, 1.1, 1);
  S.poly([[26, 194], [150, 186], [300, 191], [384, 182]], "pencil", color, 9, 0.8, 10);
  return S.strokes;
}

export function Logo({ size = 104 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    let cancel = () => {};
    const draw = (animate: boolean) => {
      cancel();
      const dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round(size * dpr);
      cv.height = Math.round((size / 2) * dpr);
      const ink = getComputedStyle(cv).color || "#0F2E27";
      const rep = new Replayer(cv, letters(ink), null, 400);
      if (!animate || prefersReducedMotion()) rep.draw(1);
      else cancel = play(1300, (p) => rep.draw(1 - Math.pow(1 - p, 2)));
    };
    draw(true);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onTheme = () => draw(false);
    mq.addEventListener("change", onTheme);
    return () => {
      cancel();
      mq.removeEventListener("change", onTheme);
    };
  }, [size]);
  return <canvas ref={ref} className="logo-mark" style={{ width: size, height: size / 2 }} aria-hidden="true" />;
}
