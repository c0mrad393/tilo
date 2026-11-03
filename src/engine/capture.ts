/* Pointer capture for drawing surfaces. Turns pointer events into points with a pressure
   value: real pen pressure when there is one, otherwise a speed-based estimate. */
export interface CaptureHandlers {
  toLocal: (e: PointerEvent) => [number, number];
  start: (e: PointerEvent) => boolean | void;
  point: (x: number, y: number, pressure: number) => void;
  end: () => void;
  minDist?: number;
}

export function capture(el: HTMLElement, h: CaptureHandlers) {
  const minDist = h.minDist ?? 2;
  let active: number | null = null;
  let last: [number, number] | null = null;
  let lastT = 0;
  let smooth = 0.6;

  const feed = (e: PointerEvent) => {
    const [x, y] = h.toLocal(e);
    const t = e.timeStamp || performance.now();
    if (last && Math.hypot(x - last[0], y - last[1]) < minDist) return;
    let pr: number;
    if (e.pointerType === "pen" && e.pressure > 0) pr = e.pressure;
    else {
      const v = last ? Math.hypot(x - last[0], y - last[1]) / Math.max(1, t - lastT) : 0;
      const target = Math.max(0.22, Math.min(1, 1 - v * 0.18));
      smooth += (target - smooth) * 0.35;
      pr = smooth;
    }
    last = [x, y];
    lastT = t;
    h.point(x, y, Math.round(pr * 99));
  };
  const down = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (active !== null) return;
    if (h.start(e) === false) return;
    active = e.pointerId;
    last = null;
    smooth = 0.6;
    el.setPointerCapture(e.pointerId);
    feed(e);
    e.preventDefault();
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== active) return;
    const list = e.getCoalescedEvents?.() ?? [];
    (list.length ? list : [e]).forEach(feed);
  };
  const stop = (e: PointerEvent) => {
    if (e.pointerId !== active) return;
    active = null;
    h.end();
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", stop);
  el.addEventListener("pointercancel", stop);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", stop);
    el.removeEventListener("pointercancel", stop);
  };
}
