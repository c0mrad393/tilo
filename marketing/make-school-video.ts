/* The schools video: 9:16, 1080 x 1920, 30 fps, about 34 seconds, set to "Carefree" by Kevin
   MacLeod (incompetech.com, CC BY 4.0: the post has to credit it). The track isn't in the
   repository: put Carefree.mp3 in marketing/music/. Without it there is only the silent copy.
   The drawings are the demo school's, made in code by Claude in a child's hand (kid-art.ts) and
   replayed by the studio's own engine; the video says so where they show. The phone screens are
   marketing/shots/school-*.png (node marketing/shoot.mjs schools).
   Usage, from the repository root: npm run video:schools [-- frames DIR]
     no argument: marketing/out/tilo-schools.mp4 (and -silent) and the Reel cover;
     `frames DIR`: stills of it to check. */

import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BLUE, clamp, drawPlate, encode, FPS, ground, H, headline, HERE, highlighter, inOut, INK, kicker, life, logoAt, logoCanvas, logoRep,
  measureHead, PAPER, phone, PINK, plate, serif, SOFT, span, trace, W, withMusic, YELLOW, type Plate,
} from "./kit";
import { kidButterfly, kidCat, kidCity, kidCreature, kidHouse, kidSea } from "../src/data/kid-art";
import { Sketch } from "../src/engine/sketch";
import { drawnCount, type Piece, type ShapeId } from "../src/engine/stroke";

const MUSIC = join(process.cwd(), "marketing", "music", "Carefree.mp3");
const shot = async (n: string) => loadImage(join(HERE, "shots", `${n}.png`));
const phones = { pics: await shot("school-pics"), home: await shot("school-home") };

/** one of the demo school's drawings, as a piece the plates can replay */
function kid(id: string, title: string, gen: (S: Sketch) => void, seed: number, shape: ShapeId = "land"): Piece {
  const S = new Sketch(seed);
  gen(S);
  return { id, title, by: "demo", minutes: 20, strokes: S.strokes, shape, paper: shape.startsWith("px") ? "plain" : "smooth" } as Piece;
}
const house = plate(kid("house", "My house", kidHouse, 11), 900);
const cat = plate(kid("cat", "My pet", kidCat, 7), 900);
cat.rep.draw(1);
const show = [
  kid("sea", "Under the sea", kidSea, 5),
  kid("butterfly", "A mirror butterfly", kidButterfly, 3),
  kid("creature", "A creature", kidCreature, 21, "px32"),
  kid("city", "My city at night", kidCity, 9, "pxland"),
].map((p) => plate(p, p.shape === "px32" ? 330 : 435));

const T = { s2: 3.6, s3: 9.8, s4: 16.4, s5: 22.8, s6: 29.2, end: 33.6 };
/** what the demo drawings are, said wherever they show */
const MADE = "Demo drawings, made in code by Claude in a child's hand";

/** a rubber stamp landing: big and faint, then down with a little bounce */
function stamp(x: SKRSContext2D, text: string, cx: number, cy: number, rot: number, color: string, k: number) {
  if (k <= 0) return;
  const s = 1 + (1 - k) * 0.7;
  x.save();
  x.globalAlpha *= Math.min(1, k * 1.6);
  x.translate(cx, cy);
  x.rotate(rot);
  x.scale(s, s);
  x.font = "800 44px Archivo";
  (x as unknown as { fontVariationSettings: string }).fontVariationSettings = "'wdth' 68, 'wght' 800";
  (x as unknown as { letterSpacing: string }).letterSpacing = "3px";
  const label = text.toUpperCase(), w = x.measureText(label).width + 56, h = 84;
  x.fillStyle = "rgba(251,250,245,0.9)";
  x.fillRect(-w / 2, -h / 2, w, h);
  x.strokeStyle = color;
  x.lineWidth = 5;
  x.strokeRect(-w / 2, -h / 2, w, h);
  x.lineWidth = 2;
  x.strokeRect(-w / 2 + 9, -h / 2 + 9, w - 18, h - 18);
  x.fillStyle = color;
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(label, 0, 3);
  x.restore();
}
/** a finger tap on the phone's screen: a ring that grows and fades */
function tap(x: SKRSContext2D, cx: number, cy: number, k: number) {
  if (k <= 0 || k >= 1) return;
  x.save();
  x.globalAlpha *= 1 - k;
  x.strokeStyle = PINK;
  x.lineWidth = 8;
  x.beginPath();
  x.arc(cx, cy, 30 + k * 70, 0, Math.PI * 2);
  x.stroke();
  x.fillStyle = "rgba(238,58,140,0.25)";
  x.beginPath();
  x.arc(cx, cy, 34, 0, Math.PI * 2);
  x.fill();
  x.restore();
}

function frame(x: SKRSContext2D, t: number) {
  ground(x);

  // 1. the promise
  if (t < T.s2) {
    const a = life(t, -1, T.s2);
    x.globalAlpha = a;
    logoRep.draw(span(t, 0.1, 1.2, (p) => 1 - Math.pow(1 - p, 2)));
    x.drawImage(logoCanvas, 80, 210, 360, 180);
    x.globalAlpha = a * span(t, 0.3, 0.8);
    kicker(x, "Tilo for schools", 84, 520, PINK, "left", 34);
    const lx = 80, size = Math.min(200, (200 * 920) / measureHead(x, "THAT REMEMBERS", 200));
    const lines: [string, string, number][] = [["THE ART CLASS", INK, 720], ["THAT REMEMBERS", BLUE, 920], ["EVERY STROKE.", PINK, 1120]];
    lines.forEach(([text, color, y], i) => {
      const k = span(t, 0.5 + i * 0.32, 1.0 + i * 0.32);
      if (k <= 0) return;
      if (i === 2) {
        const hw = measureHead(x, text, size);
        highlighter(x, lx + size * 0.02, lx + hw * 0.96, y - size * 0.34, size * 0.74, span(t, 1.6, 2.3, inOut));
      }
      x.save();
      x.globalAlpha = a * k;
      x.translate(0, (1 - k) * 40);
      headline(x, text, lx, y, size, color);
      x.restore();
    });
    x.globalAlpha = a * span(t, 2.1, 2.6);
    serif(x, "A drawing room for a whole class: pupils aged 6 to 15, run by their teacher.", lx, 1290, 50, 880, SOFT, true);
    x.globalAlpha = 1;
  }

  // 2. signing in with pictures, then the pupil's own page
  if (t >= T.s2 && t < T.s3) {
    const a = life(t, T.s2, T.s3);
    x.globalAlpha = a;
    kicker(x, "No emails. No passwords.", 90, 250, PINK);
    headline(x, "THREE PICTURES", 90, 380, 136, INK);
    headline(x, "AND THEY'RE IN.", 90, 515, 136, INK);
    const k = span(t, T.s2 + 0.2, T.s2 + 1.0);
    const swap = span(t, T.s2 + 3.4, T.s2 + 4.1, inOut);
    const pw = 440, ph = pw * (2532 / 1170), cx = 540, cy = 1080;
    x.save();
    x.globalAlpha = a * (1 - swap);
    phone(x, phones.pics, cx + (1 - k) * 700, cy, pw, -0.03);
    // the third picture, the cat, tapped
    const s = pw / 1170;
    x.translate(cx, cy);
    x.rotate(-0.03);
    tap(x, -pw / 2 + 999 * s, -ph / 2 + 1704 * s, span(t, T.s2 + 2.4, T.s2 + 3.3, (p) => p));
    x.restore();
    x.save();
    x.globalAlpha = a * swap;
    phone(x, phones.home, cx, cy + (1 - swap) * 80, pw, 0.025);
    x.restore();
    x.globalAlpha = a * (1 - swap) * span(t, T.s2 + 1.0, T.s2 + 1.4);
    serif(x, "The class code from their card, their name, their pictures.", 540, 1680, 44, 940, INK, true, "center");
    x.globalAlpha = a * swap;
    serif(x, "Then their tasks, their drawings and their class.", 540, 1680, 44, 940, INK, true, "center");
    x.globalAlpha = 1;
  }

  // 3. drawing, and watching it back
  if (t >= T.s3 && t < T.s4) {
    const a = life(t, T.s3, T.s4);
    x.globalAlpha = a;
    kicker(x, "Big tools for small hands", 90, 300, PINK);
    headline(x, "THEY DRAW.", 90, 440, 140, INK);
    headline(x, "YOU WATCH IT BACK.", 90, 580, 140, BLUE);
    const pos = span(t, T.s3 + 0.4, T.s4 - 0.9, (p) => 1 - Math.pow(1 - p, 1.4));
    const idx = house.rep.draw(pos);
    drawPlate(x, house, 90, 690, 1, true, false);
    trace(x, 90, 690 + house.h + 50, house.w, pos);
    kicker(x, `Stroke ${Math.min(idx + 1, house.piece.strokes.length)} of ${drawnCount(house.piece.strokes)}`, 90, 690 + house.h + 130, INK, "left", 28);
    serif(x, "Every drawing is a recording. Press play and see how it was made, not only how it ended.", 90, 690 + house.h + 210, 44, 900, SOFT, true);
    kicker(x, MADE, 90, 1740, SOFT, "left", 22);
    x.globalAlpha = 1;
  }

  // 4. the teacher's review: stamps and a note
  if (t >= T.s4 && t < T.s5) {
    const a = life(t, T.s4, T.s5);
    x.globalAlpha = a;
    kicker(x, "Hand it in, get it back", 90, 300, PINK);
    headline(x, "STAMPS AND", 90, 440, 140, INK);
    headline(x, "A KIND NOTE.", 90, 580, 140, INK);
    const k = span(t, T.s4 + 0.2, T.s4 + 0.8);
    x.save();
    x.globalAlpha = a * k;
    x.translate(0, (1 - k) * 40);
    drawPlate(x, cat, 90, 690, 1, true, false);
    x.restore();
    const bounce = (p: number) => { p = clamp(p); return p < 0.7 ? out(p / 0.7) * 1.06 : 1.06 - 0.06 * ((p - 0.7) / 0.3); };
    stamp(x, "Bold colours", 700, 1250, -0.09, PINK, span(t, T.s4 + 1.4, T.s4 + 1.75, bounce));
    stamp(x, "Worked hard", 330, 1300, 0.06, BLUE, span(t, T.s4 + 2.1, T.s4 + 2.45, bounce));
    // the note, written on a card
    const n = span(t, T.s4 + 3.0, T.s4 + 3.6);
    if (n > 0) {
      x.save();
      x.globalAlpha = a * n;
      x.translate(0, (1 - n) * 30);
      x.shadowColor = "rgba(29,27,25,0.18)";
      x.shadowBlur = 24;
      x.shadowOffsetY = 10;
      x.fillStyle = PAPER;
      x.fillRect(90, 1420, 900, 190);
      x.shadowColor = "transparent";
      x.fillStyle = YELLOW;
      x.fillRect(90, 1420, 12, 190);
      kicker(x, "A note for Luka", 136, 1474, SOFT, "left", 24);
      serif(x, "“Those whiskers are great! Next time, try a background.”", 136, 1540, 42, 820, INK, true);
      x.restore();
    }
    x.globalAlpha = a * span(t, T.s4 + 0.6, T.s4 + 1.0);
    kicker(x, MADE, 90, 1680, SOFT, "left", 22);
    x.globalAlpha = 1;
  }

  // 5. the class show
  if (t >= T.s5 && t < T.s6) {
    const a = life(t, T.s5, T.s6);
    x.globalAlpha = a;
    kicker(x, "Only what the teacher chooses", 90, 300, PINK);
    headline(x, "A SHOW FOR", 90, 440, 140, INK);
    headline(x, "THE FAMILIES.", 90, 580, 140, INK);
    const cellW = 435, cellH = 326;
    show.forEach((pl, i) => {
      const k = span(t, T.s5 + 0.3 + i * 0.18, T.s5 + 0.8 + i * 0.18);
      if (k <= 0) return;
      pl.rep.draw(span(t, T.s5 + 0.4 + i * 0.18, T.s5 + 4.6 + i * 0.18, (p) => 1 - Math.pow(1 - p, 1.5)));
      const col = i % 2, row = Math.floor(i / 2);
      const px = 90 + col * (cellW + 30) + (cellW - pl.w) / 2, py = 690 + row * (cellH + 40) + (cellH - pl.h) / 2;
      x.save();
      x.globalAlpha = a * k;
      x.translate(0, (1 - k) * 30);
      drawPlate(x, pl, px, py, 1, false, false);
      x.restore();
    });
    x.globalAlpha = a * span(t, T.s5 + 1.6, T.s5 + 2.2);
    serif(x, "By private link, never listed. Every drawing goes through Tilo's image check first.", 90, 1480, 44, 900, SOFT, true);
    kicker(x, MADE, 90, 1640, SOFT, "left", 22);
    x.globalAlpha = 1;
  }

  // 6. where
  if (t >= T.s6) {
    const a = span(t, T.s6, T.s6 + 0.4);
    x.globalAlpha = a;
    logoRep.draw(span(t, T.s6, T.s6 + 1.1, (p) => 1 - Math.pow(1 - p, 2)));
    x.drawImage(logoCanvas, 540 - 300, 500, 600, 300);
    x.globalAlpha = a * span(t, T.s6 + 0.5, T.s6 + 1.0);
    kicker(x, "Tilo for schools", 540, 900, PINK, "center", 34);
    const k = span(t, T.s6 + 0.8, T.s6 + 1.4);
    x.globalAlpha = a * k;
    headline(x, "TILOART.COM/SCHOOLS", 540, 1060, 140, BLUE, "center", 920);
    serif(x, "Open to any school. See the demo school first, at tiloart.com/demo", 540, 1170, 46, 880, INK, true, "center");
    x.globalAlpha = a * span(t, T.s6 + 1.4, T.s6 + 2.0);
    kicker(x, "Ages 6 to 15 · no ads · no tracking", 540, 1360, INK, "center", 28);
    x.globalAlpha = 1;
  }
}
const out = (p: number) => 1 - Math.pow(1 - clamp(p), 3);

/** the Reel cover: the promise in the middle, where the grid's 3:4 crop keeps it */
function cover() {
  const c = createCanvas(W, H), x = c.getContext("2d");
  ground(x);
  logoAt(x, INK, 540, 470, 420);
  kicker(x, "Tilo for schools", 80, 720, PINK, "left", 36);
  const size = Math.min(210, (210 * 920) / measureHead(x, "THAT REMEMBERS", 210));
  const hw = measureHead(x, "EVERY STROKE.", size);
  headline(x, "THE ART CLASS", 80, 900, size, INK);
  headline(x, "THAT REMEMBERS", 80, 1100, size, BLUE);
  highlighter(x, 80 + size * 0.02, 80 + hw * 0.96, 1300 - size * 0.34, size * 0.74, 1);
  headline(x, "EVERY STROKE.", 80, 1300, size, PINK);
  serif(x, "A drawing room for a whole class, ages 6 to 15.", 80, 1440, 50, 900, SOFT, true);
  return c;
}

const [mode, dir] = process.argv.slice(2);
const outDir = join(HERE, "out");
mkdirSync(outDir, { recursive: true });

if (mode === "frames") {
  mkdirSync(dir, { recursive: true });
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d");
  // the replays only run forward, so the stills go in time order
  for (const t of [1.0, 3.3, 5.0, 6.4, 8.6, 11.0, 14.0, 17.5, 19.0, 21.5, 24.0, 27.5, 30.2, 33.0]) {
    frame(ctx, t);
    writeFileSync(join(dir, `t${t.toFixed(1).padStart(4, "0")}.png`), await canvas.encode("png"));
  }
  writeFileSync(join(dir, "cover.png"), await cover().encode("png"));
  console.log("stills in", dir);
} else {
  writeFileSync(join(outDir, "schools-cover.png"), await cover().encode("png"));
  const silent = join(outDir, "tilo-schools-silent.mp4");
  await encode(silent, Math.round(T.end * FPS), frame);
  console.log("wrote", silent);
  if (existsSync(MUSIC)) {
    // from the top of the track: its opening bars make a natural start
    await withMusic(MUSIC, silent, join(outDir, "tilo-schools.mp4"), 0, T.end);
    console.log("wrote", join(outDir, "tilo-schools.mp4"));
  } else console.log(`no ${MUSIC}: silent copy only`);
}
