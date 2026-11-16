import { useEffect, useRef, useState } from "react";
import { isAnimated } from "../engine/frames";
import { Replayer } from "../engine/replay";
import { SHAPES, sizeOf, type Stroke } from "../engine/stroke";
import { feedMs, type Slot } from "../data/feed";
import { feedRecordings, type Published } from "../data/pieces";
import { Icon } from "./Icon";
import { Trace } from "./Trace";

/** where each piece's replay was (0-1), so coming back to it goes on from there */
const at = new Map<string, number>();
/** the long side of a feed painter, at most: the plate's size on screen, not the sheet's */
const LONG_SIDE = 1600;
/** the event the page sends to seek the piece on screen; its detail is how far (-1 to 1) */
export const SEEK = "tilo-press-seek";

interface Props {
  piece: Published;
  /** what the feed's plan gives this piece; a spacer isn't drawn at all */
  slot: Exclude<Slot, "spacer">;
  /** play now: the piece on screen, not paused, the tab in view */
  run: boolean;
  speed: number;
  /** Play or Pause pressed (the page knows whether this starts or pauses it) */
  onToggle: () => void;
  onSpeed: () => void;
  /** "Next", once a replay has ended */
  onNext?: () => void;
}

/* One piece of the feed: its picture until a painter is wanted, then a replay at the plate's
   size. A piece made ready shows where its replay is; the one playing draws itself, then
   holds the picture (or plays its loop, for an animation). Let go, it gives the painter's
   memory back and shows its picture again. */
export function FeedPlayer({ piece, slot, run, speed, onToggle, onSpeed, onNext }: Props) {
  const cv = useRef<HTMLCanvasElement>(null);
  const rep = useRef<Replayer | null>(null);
  const moving = isAnimated(piece);
  const [strokes, setStrokes] = useState<Stroke[] | null>(null);
  const [ready, setReady] = useState(false);
  const [pos, setPos] = useState(at.get(piece.id) ?? 0);
  const [ended, setEnded] = useState(() => (at.get(piece.id) ?? 0) >= 1 && !moving);
  const [round, setRound] = useState(0);
  const wanted = slot === "play" || slot === "ready";
  const sheet = sizeOf(piece);

  // the recording, only while a painter is wanted; the feed's cache keeps the last eight
  useEffect(() => {
    if (!wanted) return void setStrokes(null);
    let on = true;
    feedRecordings.get(piece.id).then((s) => on && setStrokes(s), () => {});
    return () => {
      on = false;
    };
  }, [wanted, piece.id]);

  // coming back to a finished piece starts it over
  useEffect(() => {
    if (slot !== "play" || (at.get(piece.id) ?? 0) < 1) return;
    at.set(piece.id, 0);
    setPos(0);
    setEnded(false);
    rep.current?.draw(0);
  }, [slot, piece.id]);

  // the painter, at the plate's size; let go when it isn't wanted
  useEffect(() => {
    const c = cv.current!;
    if (!wanted || !strokes) return;
    let r: Replayer | null = null;
    const build = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      let W = c.clientWidth * dpr, H = c.clientHeight * dpr;
      if (!W || !H) return;
      const k = Math.min(1, LONG_SIDE / Math.max(W, H));
      W = Math.round(W * k);
      H = Math.round(H * k);
      if (r && c.width === W && c.height === H) return;
      r?.release();
      c.width = W;
      c.height = H;
      r = rep.current = new Replayer(c, strokes, piece.paper ?? "smooth", sheet.w, piece.layers, sheet.h, { anim: piece.anim, grid: SHAPES[piece.shape ?? "land"]?.grid });
      const p = at.get(piece.id) ?? 0;
      if (p >= 1 && r.animated) r.loop(0);
      else r.draw(p);
      setReady(true);
    };
    const ro = new ResizeObserver(build);
    ro.observe(c);
    build();
    return () => {
      ro.disconnect();
      r?.release();
      rep.current = null;
      c.width = c.height = 0;
      setReady(false);
    };
  }, [wanted, strokes, piece]);

  // playing: the strokes over 6 to 15 s, then an animation's loop for as long as it is on screen
  useEffect(() => {
    const r = rep.current;
    if (!run || !ready || !r || ended) return;
    const dur = feedMs(r.strokeCount);
    let raf = 0, last = performance.now(), loopFrom = last;
    const tick = (now: number) => {
      let p = at.get(piece.id) ?? 0;
      if (p < 1) {
        p = Math.min(1, p + ((now - last) / dur) * speed);
        at.set(piece.id, p);
        r.draw(p);
        setPos(p);
        if (p >= 1) {
          if (!r.animated) return void setEnded(true);
          loopFrom = now;
        }
      } else r.loop(now - loopFrom);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, ready, ended, speed, round, piece.id]);

  const seek = (v: number) => {
    at.set(piece.id, v);
    rep.current?.draw(v);
    setPos(v);
    setEnded(false);
    setRound((n) => n + 1);
  };
  // ← and → seek the piece on screen (the page sends them)
  useEffect(() => {
    if (slot !== "play") return;
    const by = (e: Event) => {
      const d = (e as CustomEvent<number>).detail;
      if (rep.current) seek(Math.max(0, Math.min(1, (at.get(piece.id) ?? 0) + d)));
    };
    addEventListener(SEEK, by);
    return () => removeEventListener(SEEK, by);
  }, [slot, piece.id]);

  const press = () => {
    if (!ended) return onToggle();
    // a finished replay plays again
    seek(0);
    if (!run) onToggle();
  };

  const playing = run && ready && !ended;
  const label = playing ? "Pause replay" : ended ? "Play the replay again" : "Play replay";
  return (
    <div className="press-player" data-ready={ready || undefined} style={{ ["--aspect" as string]: sheet.w / sheet.h }}>
      <div className="press-plate plate reg" data-pixel={piece.shape?.startsWith("px") || undefined}>
        <img src={piece.picture} alt="" loading="lazy" decoding="async" />
        <canvas ref={cv} width={0} height={0} role="img" aria-label={`${piece.title}, replay at ${Math.round(pos * 100)} percent`} />
        <button className="press-hit" onClick={press} aria-label={label} tabIndex={-1} />
        {(ended || (moving && pos >= 1)) && onNext && (
          <button className="press-next" onClick={onNext}>
            Next <Icon name="down" />
          </button>
        )}
      </div>
      <div className="press-controls">
        <button className="play" onClick={press} aria-label={label}>
          <Icon name={playing ? "pause" : ended ? "replay" : "play"} />
        </button>
        {strokes ? <Trace strokes={strokes} pos={pos} onSeek={seek} /> : <div className="trace press-trace-wait" aria-hidden />}
        <button className="speed mono" onClick={onSpeed} aria-label={`Replay speed ${speed} times`}>
          {speed}×
        </button>
      </div>
    </div>
  );
}
