const PATHS: Record<string, string> = {
  pencil: "M4 20l1.2-4.6L15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z M13.8 6.8l3.4 3.4 M4 20l3-.8",
  ink: "M12 3l5 7-5 11-5-11z M12 10v4",
  marker: "M14.5 4.5l5 5-8 8H7v-4.5z M7 13l4 4 M4 20h7",
  wash: "M18 3c-4 2-7 5-8.5 8.5 M9.5 11.5c-3 0-5 2-5 4.5S3 20 3 20s4 .5 6.5-1.5c2-1.6 2-4.5 0-7z",
  eraser: "M8.5 20H20 M5 15.5l9.5-9.5a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19.5H8.5z M9 11.5l4.5 4.5",
  hand: "M8 12V6a1.5 1.5 0 0 1 3 0v5 M11 10V4.5a1.5 1.5 0 0 1 3 0V10 M14 10V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.5 0-4-1.2-5.5-3.5L4 13.5a1.5 1.5 0 0 1 2.4-1.7L8 13.5",
  undo: "M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3",
  trash: "M4 7h16 M10 11v6M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3",
  x: "M6 6l12 12M18 6L6 18",
  back: "M15 5l-7 7 7 7",
  next: "M9 5l7 7-7 7",
  replay: "M4 12a8 8 0 1 0 2.4-5.7 M4 4v4h4",
  pin: "M9 3h6l-1 6 3 3H7l3-3z M12 12v9",
  proof: "M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z M8.5 12l2.5 2.5 4.5-5",
  remix: "M4 7h4c4 0 4 10 8 10h4 M17 14l3 3-3 3 M4 17h4c1.5 0 2.4-1.3 3-3 M13 10c.6-1.7 1.5-3 3-3h4 M17 4l3 3-3 3",
  grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  frame: "M3 5h18v14H3z M7 9h10v6H7z",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  brushpen: "M5 19.5c2.5-.8 4-2.6 5-4.6l6.4-9.4 3 2.1-6.4 9.4c-1.6 1.7-4.4 2.4-8 2.5z M14.8 7.4l3 2.1",
  charcoal: "M5.5 17.5l9.3-11.2 3.5 2.9-9.3 11.2z M4 21c2-.7 3.5-1 5.2-1 M14.8 6.3l3.5 2.9",
  gouache: "M14 3l7 7-6.2 1.8-2.6-2.6z M12.4 9.4l-6.6 6.5a2.6 2.6 0 1 0 3.6 3.6l6.3-6.7",
  oil: "M9 3h6v6.5H9z M9 6.5h6 M10.2 9.5h3.6L13 21h-2z",
  spray: "M8 10h7v11H8z M10 10V7.5h3V10 M11.5 7.5V5.5 M17.5 4.5h.01 M19.5 6.5h.01 M17.5 8h.01 M20 3h.01",
  fill: "M4.5 11.5l7-7 7 7-7 7z M4.5 11.5h14 M20.5 16c0 1.4-1 2.8-1 2.8s-1-1.4-1-2.8a1 1 0 0 1 2 0z",
  // pixel tools: square cells, drawn as outlines like the rest
  pixel: "M3.5 15.5h5v5h-5z M8.5 10.5h5v5h-5z M13.5 5.5h5v5h-5z M18.5 3.5h2v2",
  pixelerase: "M4 4h16v16H4z M4 12h16 M12 4v16 M14.5 14.5l3 3 M17.5 14.5l-3 3",
  pixelfill: "M4.5 11.5l7-7 7 7-7 7z M4.5 11.5h14 M18 16h3v3h-3z",
  lasso: "M12 4c4.4 0 8 2.2 8 5s-3.6 5-8 5-8-2.2-8-5 3.6-5 8-5z M7.5 13.2c-1.2 1.9-.4 3.6 1.8 4.1 M9.3 17.3c.1 2-1 3.2-3.1 3.2",
  smudge: "M9 21v-7.5a2 2 0 0 1 4 0V21 M13 13.5V8a2 2 0 0 1 4 0v8.5c0 2.9-1.8 4.5-4 4.5 M4 8.5c2.5-2.3 5-2.3 7.5 0",
  eye: "M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z",
  eyeoff: "M3 3l18 18 M10.6 6.1A10 10 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3 3.6 M6.3 7.6C3.6 9.3 2 12 2 12s3.6 6 10 6a9.6 9.6 0 0 0 4.4-1 M9.9 10a2.5 2.5 0 0 0 3.5 3.6",
  plus: "M12 5v14 M5 12h14",
  minus: "M5 12h14",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  fit: "M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5",
  download: "M12 4v11 M7 10.5l5 5 5-5 M5 20h14",
  share: "M12 15V3.5 M7.5 8L12 3.5 16.5 8 M5 12v8h14v-8",
  film: "M4 5h16v14H4z M8 5v14 M16 5v14 M4 9.5h4 M4 14.5h4 M16 9.5h4 M16 14.5h4",
  sheets: "M7 3h10v14H7z M4 7v14h10 M10 7h4 M10 10h4",
  copy: "M9 9h11v11H9z M5 15H4V4h11v1",
  onion: "M3 9h11v11H3z M7 9V5h11v11h-4 M11 5V3h10v10h-3",
  select: "M4 7V4h3 M10 4h3 M4 10v3 M16 4h1 M4 16v1 M11 11l9 3.5-4 1.5-1.5 4z",
  merge: "M6 4l6 6 6-6 M12 10v7 M5 20h14",
  rename: "M4 20h4L19 9l-4-4L4 16z M13 7l4 4",
  rotl: "M4 12a8 8 0 1 0 2.4-5.7 M4 4v4h4",
  rotr: "M20 12a8 8 0 1 1-2.4-5.7 M20 4v4h-4",
  flip: "M12 3v18 M9 7l-5 10h5z M15 7l5 10h-5z",
};
const FILLED: Record<string, string> = {
  play: "M7 4.5v15l12-7.5z",
  pause: "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z",
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  if (FILLED[name])
    return (
      <svg className="i" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <path d={FILLED[name]} fill="currentColor" stroke="none" />
      </svg>
    );
  return (
    <svg className="i" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
