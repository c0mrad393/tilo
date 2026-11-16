import { letters } from "../components/Logo";
import { eventOn } from "./event";
import { isAnimated } from "../engine/frames";
import { Replayer } from "../engine/replay";
import { drawnCount, fmtMin, layersOf, SHAPES, sizeOf, type Piece } from "../engine/stroke";

/* A piece's replay as a 9:16 video to post: the sheet drawing itself stroke by stroke, its
   title and who made it under it, and where to watch it. Drawn on a canvas in the browser and
   recorded as it plays (MediaRecorder), so nothing is sent anywhere and it takes as long as it
   runs, about fifteen seconds; an animation then plays its loop for about four more. MP4 where the browser can write it (Safari, Chrome), WebM
   elsewhere. An AI piece says it was drawn in code, by Claude; only a piece with the
   proof-of-hand badge says "by hand". */

export const VIDEO_W = 1080, VIDEO_H = 1920;
const FPS = 30;
const PAPER = "#FBFAF5", GROUND = "#EEE8DA", INK = "#1D1B19", SOFT = "#5E574C", PINK = "#EE3A8C", YELLOW = "#FFD23F";
const DUSK = ["#24124A", "#4E2580", "#A2348E", "#F0507A", "#FF8A5C", "#FFC46A"];
const SANS = "'Archivo Variable', 'Helvetica Neue', Arial, sans-serif";
const SERIF = "'Newsreader Variable', Georgia, serif";

export type VideoPiece = Piece & { proof?: boolean };

/** whether this browser can record a canvas at all */
export const canRecord = () => typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";

function pickType() {
  for (const t of ["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"])
    if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

/** the line under the title: who, and how it was made */
export function madeLine(p: VideoPiece) {
  const n = `${drawnCount(p.strokes).toLocaleString("en")} strokes`;
  return p.ai ? `@${p.by} · drawn in code by Claude, an AI · ${n}` : `@${p.by} · ${fmtMin(p.minutes)} min · ${n}`;
}
export function madeClaim(p: VideoPiece) {
  return p.ai ? "Drawn in code by Claude, an AI" : p.proof ? "Drawn by hand, stroke by stroke" : "Recorded stroke by stroke";
}

function wrap(x: CanvasRenderingContext2D, text: string, maxW: number, max = 2) {
  const lines: string[] = [];
  for (const w of text.split(" ")) {
    const t = lines.length ? `${lines[lines.length - 1]} ${w}` : w;
    if (lines.length && x.measureText(t).width <= maxW) lines[lines.length - 1] = t;
    else lines.push(w);
  }
  if (lines.length > max) {
    lines.length = max;
    lines[max - 1] = lines[max - 1].replace(/\s*\S*$/, "…");
  }
  return lines;
}

/** Records the piece's replay. `onProgress` gets 0-1 as it goes; `signal` stops it. */
export async function recordReplay(p: VideoPiece, onProgress: (k: number) => void, signal?: AbortSignal): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
  await Promise.all([document.fonts.load(`800 100px ${SANS}`), document.fonts.load(`400 40px ${SERIF}`), document.fonts.load(`italic 400 40px ${SERIF}`)]).catch(() => {});
  const dusk = eventOn();
  const ink = dusk ? PAPER : INK, soft = dusk ? "rgba(251,250,245,0.82)" : SOFT, accent = dusk ? "#FF4F9A" : PINK;

  const cv = document.createElement("canvas");
  cv.width = VIDEO_W;
  cv.height = VIDEO_H;
  const x = cv.getContext("2d")!;

  // the sheet, fitted into the frame's middle
  const sheet = sizeOf(p);
  const k = Math.min(940 / sheet.w, 1020 / sheet.h);
  const pw = Math.round(sheet.w * k), ph = Math.round(sheet.h * k);
  const px = (VIDEO_W - pw) / 2, py = 330 + (1020 - ph) / 2;
  const plate = document.createElement("canvas");
  plate.width = pw;
  plate.height = ph;
  const rep = new Replayer(plate, p.strokes, p.paper ?? "smooth", sheet.w, layersOf(p).map((l) => ({ ...l })), sheet.h, { anim: p.anim, grid: SHAPES[p.shape ?? "land"]?.grid });
  const moving = isAnimated(p);

  // the wordmark, written once
  const logo = document.createElement("canvas");
  logo.width = 400;
  logo.height = 200;
  new Replayer(logo, letters(ink), null, 400).draw(1);

  const bg = document.createElement("canvas");
  bg.width = VIDEO_W;
  bg.height = VIDEO_H;
  {
    const b = bg.getContext("2d")!;
    if (dusk) {
      const g = b.createLinearGradient(0, 0, 0, VIDEO_H);
      DUSK.forEach((c, i) => g.addColorStop(i / (DUSK.length - 1), c));
      b.fillStyle = g;
      b.fillRect(0, 0, VIDEO_W, VIDEO_H);
      // a low striped sun behind the words
      b.save();
      b.beginPath();
      b.rect(0, 0, VIDEO_W, 1880);
      b.clip();
      const s = b.createLinearGradient(0, 1460, 0, 1880);
      s.addColorStop(0, "rgba(255,240,160,0.55)");
      s.addColorStop(1, "rgba(255,79,154,0.55)");
      b.fillStyle = s;
      b.beginPath();
      b.arc(540, 1880, 420, Math.PI, 0);
      b.fill();
      b.fillStyle = "#F0507A";
      for (let i = 0; i < 6; i++) b.fillRect(0, 1680 + i * 34, VIDEO_W, 4 + i * 3);
      b.restore();
    } else {
      b.fillStyle = GROUND;
      b.fillRect(0, 0, VIDEO_W, VIDEO_H);
    }
  }

  const title = p.title || "Untitled";
  const kicker = p.prompt ? `Subject No. ${p.prompt}` : dusk ? "Release week on Tilo" : "A replay from Tilo";
  const total = drawnCount(p.strokes);
  // an animation's loop plays on after the last stroke, through the end
  const LOOP = moving ? Math.max(4, Math.min(8, (rep.loopMs * 2) / 1000)) : 0;
  const INTRO = 0.7, RUN = Math.min(14, Math.max(8, 6 + total * 0.004)), OUTRO = 3.2, END = INTRO + RUN + LOOP + OUTRO;

  const frame = (t: number) => {
    const pos = Math.min(1, Math.max(0, (t - INTRO) / RUN));
    x.drawImage(bg, 0, 0);
    x.drawImage(logo, 540 - 130, 60, 260, 130);
    x.fillStyle = dusk ? YELLOW : accent;
    x.font = `700 30px ${SANS}`;
    x.textAlign = "center";
    (x as unknown as { letterSpacing: string }).letterSpacing = "3.6px";
    x.fillText(kicker.toUpperCase(), 540, 268);
    (x as unknown as { letterSpacing: string }).letterSpacing = "0px";

    // the plate: a paper sheet with a soft shadow and the site's crop marks
    x.save();
    x.shadowColor = "rgba(29,27,25,0.35)";
    x.shadowBlur = 40;
    x.shadowOffsetY = 18;
    x.fillStyle = PAPER;
    x.fillRect(px, py, pw, ph);
    x.restore();
    if (moving && t > INTRO + RUN) rep.loop((t - INTRO - RUN) * 1000);
    else rep.draw(pos);
    x.drawImage(plate, px, py);
    x.strokeStyle = dusk ? "rgba(251,250,245,0.7)" : "rgba(29,27,25,0.55)";
    x.lineWidth = 2;
    for (const [cx, cy, sx, sy] of [[px, py, -1, -1], [px + pw, py, 1, -1], [px, py + ph, -1, 1], [px + pw, py + ph, 1, 1]]) {
      x.beginPath();
      x.moveTo(cx + sx * 16, cy);
      x.lineTo(cx + sx * 44, cy);
      x.moveTo(cx, cy + sy * 16);
      x.lineTo(cx, cy + sy * 44);
      x.stroke();
    }
    if (p.ai) {
      x.font = `700 26px ${SANS}`;
      (x as unknown as { letterSpacing: string }).letterSpacing = "2.6px";
      const w = x.measureText("AI-MADE").width + 30;
      x.fillStyle = INK;
      x.fillRect(px + pw - w - 16, py + 16, w, 42);
      x.fillStyle = GROUND;
      x.textAlign = "left";
      x.fillText("AI-MADE", px + pw - w - 1, py + 47);
      (x as unknown as { letterSpacing: string }).letterSpacing = "0px";
    }

    // the trace: how far the replay has got
    const ty = 1390;
    x.fillStyle = dusk ? "rgba(251,250,245,0.22)" : "rgba(29,27,25,0.12)";
    x.fillRect(100, ty, 880, 10);
    x.fillStyle = ink;
    x.fillRect(100, ty, 880 * pos, 10);
    x.fillStyle = accent;
    x.fillRect(100 + 880 * pos - 3, ty - 8, 6, 26);

    // the title and who made it
    x.textAlign = "center";
    x.fillStyle = ink;
    x.font = `800 condensed 92px ${SANS}`;
    const lines = wrap(x, title.toUpperCase(), 900);
    lines.forEach((l, i) => x.fillText(l, 540, 1500 + i * 90));
    const below = 1500 + (lines.length - 1) * 90;
    x.fillStyle = soft;
    x.font = `italic 400 38px ${SERIF}`;
    x.fillText(madeLine(p), 540, below + 64, 960);

    // the end: where to watch it
    const out = Math.min(1, Math.max(0, (t - INTRO - RUN - LOOP) / 0.5));
    x.globalAlpha = 0.55 + 0.45 * out;
    x.fillStyle = dusk ? YELLOW : SOFT;
    x.font = `700 28px ${SANS}`;
    (x as unknown as { letterSpacing: string }).letterSpacing = "3.4px";
    x.fillText(madeClaim(p).toUpperCase(), 540, 1760);
    (x as unknown as { letterSpacing: string }).letterSpacing = "0px";
    x.fillStyle = dusk ? PAPER : "#2D4BB3";
    x.font = `800 condensed ${Math.round(78 + 8 * out)}px ${SANS}`;
    x.fillText("TILOART.COM", 540, 1852);
    x.globalAlpha = 1;
  };

  frame(0);
  const stream = cv.captureStream(FPS);
  const type = pickType();
  const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((res) => (rec.onstop = () => res()));
  rec.start(500);

  // drawn on a timer, not on animation frames, so it keeps going if the tab loses focus a moment
  const t0 = performance.now();
  await new Promise<void>((res, rej) => {
    const step = () => {
      if (signal?.aborted) return rej(new DOMException("Stopped", "AbortError"));
      const t = (performance.now() - t0) / 1000;
      frame(Math.min(t, END));
      onProgress(Math.min(1, t / END));
      if (t >= END) return res();
      setTimeout(step, 1000 / FPS);
    };
    step();
  }).finally(() => {
    if (rec.state !== "inactive") rec.stop();
    stream.getTracks().forEach((s) => s.stop());
  });
  await done;
  const mime = rec.mimeType || type || "video/webm";
  return { blob: new Blob(chunks, { type: mime.split(";")[0] }), ext: mime.includes("mp4") ? "mp4" : "webm" };
}
