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
