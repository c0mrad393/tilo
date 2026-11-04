import { useEffect, useRef, useState } from "react";
import { hexToHsv, hsvToHex, normHex, type Hsv } from "../engine/colour";

/* Mix your own: a saturation and brightness square, a hue strip and a hex field. It keeps its
   own hue while you work, so dragging into grey or black doesn't lose the colour you came from. */
export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [text, setText] = useState(value);
  const mine = useRef(value);
  const square = useRef<HTMLDivElement>(null);

  // a colour picked elsewhere (a chip, the sheet) moves the picker; our own changes don't
  useEffect(() => {
    if (value === mine.current) return;
    mine.current = value;
    setHsv(hexToHsv(value));
    setText(value);
  }, [value]);

  const set = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    mine.current = hex;
    setText(hex);
    onChange(hex);
  };
  const [h, s, v] = hsv;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));

  const fromPointer = (e: React.PointerEvent) => {
    const r = square.current!.getBoundingClientRect();
    set([h, clamp((e.clientX - r.left) / r.width), clamp(1 - (e.clientY - r.top) / r.height)]);
  };
  const keys = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const m = d[e.key];
    if (!m) return;
    e.preventDefault();
    set([h, clamp(s + m[0]), clamp(v + m[1])]);
  };
  const typed = () => {
    const hex = normHex(text);
    if (hex) {
      mine.current = hex;
      setHsv(hexToHsv(hex));
      onChange(hex);
    }
    setText(hex ?? value);
  };

  return (
    <div className="picker">
      <div
        ref={square}
        className="picker-sv"
        style={{ ["--hue" as string]: hsvToHex([h, 1, 1]) }}
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuetext={`saturation ${Math.round(s * 100)}%, brightness ${Math.round(v * 100)}%`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => e.buttons && fromPointer(e)}
        onKeyDown={keys}
      >
        <span className="picker-dot" style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: value }} />
      </div>
      <input className="picker-hue" type="range" min={0} max={359} value={Math.round(h)} aria-label="Hue" onChange={(e) => set([+e.target.value, s, v])} />
      <label className="picker-hex">
        <span className="chip" style={{ ["--c" as string]: value }} aria-hidden="true" />
        <span className="sr-only">Hex colour</span>
        <input
          className="mono"
          value={text}
          spellCheck={false}
          maxLength={7}
          onChange={(e) => setText(e.target.value)}
          onBlur={typed}
          onKeyDown={(e) => e.key === "Enter" && typed()}
        />
      </label>
    </div>
  );
}
