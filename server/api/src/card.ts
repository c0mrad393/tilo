import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eventOn } from "../../../src/data/event.ts";

/* The picture a link to a piece shows in chats and feeds (og:image, preview.ts), 1200 x 630:
   the piece on its sheet with the site's crop marks, its title, who made it and how, and
   tiloart.com. An AI piece says so on the plate and in the words. While an event is on
   (src/data/event.ts) the card wears its dusk. Drawn once per piece and look, then kept in
   FILES_DIR/cards. */

const ASSETS = join(import.meta.dirname, "..", "assets");
GlobalFonts.registerFromPath(join(ASSETS, "fonts", "archivo-latin-wdth-normal.woff2"), "Archivo");
GlobalFonts.registerFromPath(join(ASSETS, "fonts", "newsreader-latin-opsz-normal.woff2"), "Newsreader");
GlobalFonts.registerFromPath(join(ASSETS, "fonts", "newsreader-latin-opsz-italic.woff2"), "Newsreader Italic");

export const CARD_W = 1200, CARD_H = 630;
const GROUND = "#EEE8DA", PAPER = "#FBFAF5", INK = "#1D1B19", SOFT = "#5E574C", BLUE = "#2D4BB3", PINK = "#EE3A8C", YELLOW = "#FFD23F";
const DUSK = ["#24124A", "#4E2580", "#A2348E", "#F0507A", "#FF8A5C", "#FFC46A"];

export interface CardPiece {
  id: string;
  title: string;
  handle: string;
  strokes: number;
  minutes: number;
  ai: boolean;
  proof: boolean;
  subject: number | null;
}

const marks: Record<string, Image> = {};
const mark = async (k: "ink" | "paper") => (marks[k] ??= await loadImage(join(ASSETS, `wordmark-${k}.png`)));
const clock = (min: number) => {
  const s = Math.round(min * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function head(x: SKRSContext2D, size: number) {
  x.font = `800 ${size}px Archivo`;
  (x as unknown as { fontVariationSettings: string }).fontVariationSettings = "'wdth' 68, 'wght' 800";
}
function spaced(x: SKRSContext2D, text: string, px: number, y: number, size: number, color: string) {
  x.save();
  x.font = `700 ${size}px Archivo`;
  (x as unknown as { letterSpacing: string }).letterSpacing = `${size * 0.12}px`;
  x.fillStyle = color;
  x.fillText(text.toUpperCase(), px, y);
  x.restore();
}
function lines(x: SKRSContext2D, text: string, maxW: number, max: number) {
  const out: string[] = [];
  for (const w of text.split(/\s+/)) {
    const t = out.length ? `${out[out.length - 1]} ${w}` : w;
    if (out.length && x.measureText(t).width <= maxW) out[out.length - 1] = t;
    else out.push(w);
  }
  if (out.length > max) {
    out.length = max;
    out[max - 1] = `${out[max - 1].replace(/\s*\S*$/, "")}…`;
  }
  return out;
}

async function draw(p: CardPiece, picture: Buffer | null) {
  const dusk = eventOn();
  const c = createCanvas(CARD_W, CARD_H), x = c.getContext("2d");
  const ink = dusk ? PAPER : INK, soft = dusk ? "rgba(251,250,245,0.85)" : SOFT;
  if (dusk) {
    // the light low on the left, behind the piece; night on the right, behind the words
    const g = x.createLinearGradient(0, CARD_H, CARD_W, 0);
    ["#FFC46A", "#FF8A5C", "#F0507A", "#A2348E", "#4E2580", "#24124A"].forEach((s, i, a) => g.addColorStop(i / (a.length - 1), s));
    x.fillStyle = g;
    x.fillRect(0, 0, CARD_W, CARD_H);
    x.save();
    x.beginPath();
    x.rect(0, 0, 680, CARD_H);
    x.clip();
    const s = x.createLinearGradient(0, 330, 0, CARD_H);
    s.addColorStop(0, "rgba(255,240,160,0.6)");
    s.addColorStop(1, "rgba(255,79,154,0.6)");
    x.fillStyle = s;
    x.beginPath();
    x.arc(346, CARD_H, 320, Math.PI, 0);
    x.fill();
    x.fillStyle = "#F0507A";
    for (let i = 0; i < 5; i++) x.fillRect(0, 470 + i * 30, 680, 3 + i * 3);
    x.restore();
  } else {
    x.fillStyle = GROUND;
    x.fillRect(0, 0, CARD_W, CARD_H);
  }

  // the piece on its sheet, fitted into the left
  const box = { x: 46, y: 46, w: 600, h: 538 };
  let pw = box.w, ph = box.h;
  const img = picture ? await loadImage(picture).catch(() => null) : null;
  if (img) {
    const k = Math.min(box.w / img.width, box.h / img.height);
    pw = Math.round(img.width * k);
    ph = Math.round(img.height * k);
  }
  const px = box.x + (box.w - pw) / 2, py = box.y + (box.h - ph) / 2;
  x.save();
  x.shadowColor = "rgba(29,27,25,0.35)";
  x.shadowBlur = 30;
  x.shadowOffsetY = 12;
  x.fillStyle = PAPER;
  x.fillRect(px, py, pw, ph);
  x.restore();
  if (img) x.drawImage(img, px, py, pw, ph);
  x.strokeStyle = dusk ? "rgba(251,250,245,0.7)" : "rgba(29,27,25,0.55)";
  x.lineWidth = 2;
  for (const [cx, cy, sx, sy] of [[px, py, -1, -1], [px + pw, py, 1, -1], [px, py + ph, -1, 1], [px + pw, py + ph, 1, 1]]) {
    x.beginPath();
    x.moveTo(cx + sx * 10, cy);
    x.lineTo(cx + sx * 30, cy);
    x.moveTo(cx, cy + sy * 10);
    x.lineTo(cx, cy + sy * 30);
    x.stroke();
  }
  if (p.ai) {
    x.save();
    x.font = "700 20px Archivo";
    (x as unknown as { letterSpacing: string }).letterSpacing = "2px";
    const w = x.measureText("AI-MADE").width + 22;
    x.fillStyle = INK;
    x.fillRect(px + pw - w - 12, py + 12, w, 32);
    x.fillStyle = GROUND;
    x.fillText("AI-MADE", px + pw - w - 1, py + 35);
    x.restore();
  }

  // the words, on the right
  const L = 700, R = 1150, maxW = R - L;
  x.drawImage(await mark(dusk ? "paper" : "ink"), L - 14, 34, 190, 95);
  spaced(x, p.subject ? `Subject No. ${p.subject}` : dusk ? "Release week on Tilo" : "On Tilo", L, 178, 20, dusk ? YELLOW : PINK);
  head(x, 64);
  x.fillStyle = ink;
  const t = lines(x, p.title.toUpperCase(), maxW, 3);
  t.forEach((l, i) => x.fillText(l, L, 240 + i * 60));
  let y = 240 + (t.length - 1) * 60 + 48;
  x.fillStyle = soft;
  x.font = "32px 'Newsreader Italic'";
  x.fillText(`by @${p.handle}`, L, y, maxW);
  y += 40;
  x.font = "24px Newsreader";
  const how = p.ai
    ? `Drawn in code by Claude, an AI: ${p.strokes.toLocaleString("en")} strokes.`
    : `${p.proof ? "Drawn by hand" : "Recorded"}, ${p.strokes.toLocaleString("en")} strokes in ${clock(p.minutes)}.`;
  for (const l of lines(x, how, maxW, 2)) {
    x.fillText(l, L, y, maxW);
    y += 31;
  }
  spaced(x, "Watch it drawn, stroke by stroke", L, 540, 18, soft);
  head(x, 56);
  x.fillStyle = dusk ? YELLOW : BLUE;
  x.fillText("TILOART.COM", L, 594);
  return c.encode("jpeg", 88);
}

/** The card for a live piece, from the cache or drawn now. */
export async function card(filesDir: string, p: CardPiece & { picture: string }) {
  const dir = join(filesDir, "cards");
  const file = join(dir, `${p.id}${eventOn() ? "-dusk" : ""}.jpg`);
  const kept = await readFile(file).catch(() => null);
  if (kept) return kept;
  const picture = await readFile(join(filesDir, "img", `${p.id}.${p.picture}`)).catch(() => null);
  const jpg = await draw(p, picture);
  await mkdir(dir, { recursive: true });
  await writeFile(file, jpg).catch(() => {});
  return jpg;
}
