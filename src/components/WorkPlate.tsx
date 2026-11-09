import { useEffect, useRef, useState } from "react";
import { PAPERS } from "../engine/paper";
import { sizeOf, type Stroke } from "../engine/stroke";
import type { Work } from "../data/school";
import { ReplayCanvas, type ReplayMode } from "./ReplayCanvas";

/* A pupil's drawing on its plate. The recording is fetched when the plate comes near the
   screen, so a class of thirty doesn't fetch every drawing before the first shows. */
export function WorkPlate({ work, load, mode = "static", label, aspect }: { work: Pick<Work, "id" | "shape" | "paper" | "layers" | "strokes">; load: () => Promise<Stroke[]>; mode?: ReplayMode; label: string; aspect?: number }) {
  const box = useRef<HTMLSpanElement>(null);
  const [strokes, setStrokes] = useState<Stroke[] | null>(null);
  const [failed, setFailed] = useState(false);
  const loader = useRef(load);
  loader.current = load;
  const sheet = sizeOf(work);

  useEffect(() => {
    let live = true;
    setStrokes(null);
    const io = new IntersectionObserver(
      (e) => {
        if (!e.some((x) => x.isIntersecting)) return;
        io.disconnect();
        loader.current().then(
          (s) => live && setStrokes(s),
          () => live && setFailed(true),
        );
      },
      { rootMargin: "300px" },
    );
    io.observe(box.current!);
    return () => {
      live = false;
      io.disconnect();
    };
  }, [work.id, work.strokes]);

  const ratio = aspect ?? sheet.w / sheet.h;
  return (
    <span ref={box} className="plate work-plate" style={{ aspectRatio: ratio, background: PAPERS[work.paper]?.color }}>
      {strokes ? (
        strokes.length ? (
          <ReplayCanvas strokes={strokes} layers={work.layers} paper={work.paper} shape={work.shape} aspect={ratio} mode={mode} label={label} />
        ) : (
          <span className="work-empty serif">Nothing drawn yet</span>
        )
      ) : failed ? (
        <span className="work-empty serif">The drawing didn't load</span>
      ) : null}
    </span>
  );
}
