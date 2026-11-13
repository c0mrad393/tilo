/* The tour: Tilo in 36 seconds, for people who saw a video and haven't been to the site.
   9:16, 1080 x 1920, 30 fps, set to "Origami" by Scott Buckley (scottbuckley.com.au, CC BY 4.0:
   the post has to credit it). The track isn't in the repository: put Origami.mp3 in
   marketing/music/. Its groove comes in at 0:22.75 and turns a phrase every 11.25 s; the scenes
   change on the half-phrases (BEAT0, HALF).
   The phones hold the real site, signed out, as a visitor sees it (node marketing/shoot.mjs
   tour, which also writes where each button and canvas sits); the replay on the piece page is
   that sample's own recording, played where the page plays it. It ends on what anyone can do
   at once: draw in the studio, no account needed. Publishing needs an account, and while
   sign-up needs an invite the end card says so (OPEN).
   Usage, from the repository root: npm run video:tour [-- frames DIR]
     no argument: marketing/out/tilo-tour.mp4 (and -silent) and tour-cover.png;
     `frames DIR`: stills of it to check. */

import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BLUE, clamp, encode, FPS, ground, H, headline, HERE, highlighter, inOut, INK, kicker, life, logoAt, logoCanvas, logoRep,
  measureHead, PAPER, PINK, serif, SOFT, span, W, withMusic,
} from "./kit";
import { samples } from "../src/data/samples";
import { Replayer } from "../src/engine/replay";
import { layersOf, sizeOf } from "../src/engine/stroke";

/** sign-up needs no invite: the end card then asks people to make an account */
const OPEN = false;

const MUSIC = join(process.cwd(), "marketing", "music", "Origami.mp3");
const TRACK_GROOVE = 22.75, BEAT0 = 0.2, HALF = 5.625;
const at = (n: number) => BEAT0 + n * HALF;
const T = { s2: at(1), s3: at(2), s4: at(3), s5: at(4), s6: at(5), hit: at(6), end: at(6) + 2.6 };

const SHOTS = join(HERE, "shots");
const shot = (n: string) => loadImage(join(SHOTS, `${n}.png`));
const img = { home: await shot("tour-home"), studio: await shot("tour-studio"), pixel: await shot("tour-pixel"), piece: await shot("tour-piece"), gallery: await shot("tour-gallery") };
type Box = [number, number, number, number];
const boxes = JSON.parse(readFileSync(join(SHOTS, "tour-boxes.json"), "utf8")) as Record<string, { canvases: Box[]; els: [string, ...Box][] }>;
/** where a button sits on a page, in CSS pixels, by the start of its name */
const el = (page: string, name: string): Box => {
  const e = boxes[page].els.find(([t]) => t.startsWith(name));
  if (!e) throw new Error(`no "${name}" on ${page}`);
  return e.slice(1) as Box;
};

/* ---------- a phone holding a page, scrolled; draw on it in the page's own CSS pixels ---------- */
const PHONE_W = 500, PHONE_H = PHONE_W * (2532 / 1170), CSS = PHONE_W / 390;
function phone(x: SKRSContext2D, page: Image, cx: number, cy: number, rot: number, scroll: number, over?: (x: SKRSContext2D) => void) {
  const w = PHONE_W, h = PHONE_H, r = w * 0.12, b = w * 0.035;
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.shadowColor = "rgba(29,27,25,0.35)";
  x.shadowBlur = 60;
  x.shadowOffsetY = 30;
  x.fillStyle = "#141312";
  x.beginPath();
  x.roundRect(-w / 2 - b, -h / 2 - b, w + b * 2, h + b * 2, r + b);
  x.fill();
  x.shadowColor = "transparent";
  x.save();
  x.beginPath();
  x.roundRect(-w / 2, -h / 2, w, h, r);
  x.clip();
  // 3 image pixels to a CSS pixel; a phone screen is 844 CSS pixels tall
  x.drawImage(page, 0, scroll * 3, 1170, 2532, -w / 2, -h / 2, w, h);
  if (over) {
    x.translate(-w / 2, -h / 2 - scroll * CSS);
    x.scale(CSS, CSS);
    over(x);
  }
  x.restore();
  x.fillStyle = "#141312";
  x.beginPath();
  x.roundRect(-w * 0.15, -h / 2 + w * 0.035, w * 0.3, w * 0.085, w * 0.045);
  x.fill();
  x.restore();
}
/** a finger tap: a ring that grows and fades, in CSS pixels */
function tap(x: SKRSContext2D, [bx, by, bw, bh]: Box, k: number) {
  if (k <= 0 || k >= 1) return;
  const cx = bx + bw / 2, cy = by + bh / 2;
  x.save();
  x.globalAlpha *= 1 - k;
  x.strokeStyle = PINK;
  x.lineWidth = 4;
  x.beginPath();
  x.arc(cx, cy, 12 + k * 34, 0, Math.PI * 2);
  x.stroke();
  x.fillStyle = "rgba(238,58,140,0.3)";
  x.beginPath();
  x.arc(cx, cy, 14, 0, Math.PI * 2);
  x.fill();
  x.restore();
}
/** a pink outline round a button, in CSS pixels */
function ring(x: SKRSContext2D, [bx, by, bw, bh]: Box, a: number) {
  if (a <= 0) return;
  x.save();
  x.globalAlpha *= a;
  x.strokeStyle = PINK;
  x.lineWidth = 3;
  x.beginPath();
  x.roundRect(bx - 2, by - 2, bw + 4, bh + 4, 8);
  x.stroke();
  x.restore();
}

/* ---------- the replay on the piece page: the sample's own recording, on the page's plate ---------- */
const OLD = samples().find((p) => p.id === "oldtown")!;
const plateBox = boxes["tour-piece"].canvases[0];
const replayCanvas = createCanvas(Math.round(plateBox[2] * 3), Math.round(plateBox[3] * 3));
const replay = new Replayer(replayCanvas as unknown as HTMLCanvasElement, OLD.strokes, OLD.paper ?? "smooth", sizeOf(OLD).w, layersOf(OLD).map((l) => ({ ...l })), sizeOf(OLD).h);

/* ---------- the scene's words ---------- */
function title(x: SKRSContext2D, no: string, l1: string, l2: string, note: string, a: number) {
  x.save();
  x.globalAlpha *= a;
  kicker(x, no, 90, 200, PINK, "left", 32);
  headline(x, l1, 90, 320, 118, INK);
  headline(x, l2, 90, 440, 118, BLUE);
  serif(x, note, 90, 530, 40, 900, SOFT, true);
  x.restore();
}
const PHONE_Y = 1170;

function frame(x: SKRSContext2D, t: number) {
  ground(x);

  // the hook, then the home page: open it in any browser
  if (t < T.s2) {
    const a = life(t, -1, T.s2);
    const intro = 1 - span(t, 1.9, 2.3, inOut);
    if (intro > 0) {
      x.globalAlpha = a * intro * span(t, 0.0, 0.3);
      kicker(x, "A 30-second tour", 84, 700, PINK, "left", 36);
      const size = 250;
      const k1 = span(t, 0.2, 0.6);
      x.save();
      x.globalAlpha = a * intro * k1;
      x.translate(0, (1 - k1) * 40);
      headline(x, "THIS IS", 80, 920, size, INK);
      x.restore();
      const k2 = span(t, 0.5, 0.9);
      if (k2 > 0) {
        const hw = measureHead(x, "TILO.", size);
        x.globalAlpha = a * intro;
        highlighter(x, 80 + size * 0.02, 80 + hw * 0.98, 1170 - size * 0.34, size * 0.74, span(t, 0.9, 1.5));
        x.save();
        x.globalAlpha = a * intro * k2;
        x.translate(0, (1 - k2) * 40);
        headline(x, "TILO.", 80, 1170, size, PINK);
        x.restore();
      }
      x.globalAlpha = a * intro * span(t, 1.0, 1.4);
      serif(x, "A free studio for drawing by hand, in your browser.", 84, 1300, 48, 900, SOFT, true);
    }
    const k = span(t, 2.0, 2.7);
    if (k > 0) {
      title(x, "01", "OPEN IT IN", "ANY BROWSER.", "Phone, tablet or computer. Nothing to install.", a * k);
      x.globalAlpha = a * k;
      phone(x, img.home, 540, PHONE_Y + (1 - k) * 500, -0.02, 0, (o) => {
        tap(o, el("tour-home", "Start a blank sheet"), span(t, 4.3, 5.1, (p) => p));
      });
    }
    x.globalAlpha = 1;
  }

  // the studio: pick a tool; then pixel art
  if (t >= T.s2 && t < T.s3) {
    const a = life(t, T.s2, T.s3, 0.25), s = T.s2;
    title(x, "02", "PICK A TOOL.", "MAKE A MARK.", "Pencil, ink, brush, charcoal, marker, wash, oil. Layers when you want them.", a);
    const tools = ["Pencil", "Ink pen", "Brush pen", "Charcoal", "Marker", "Watercolour", "Gouache"];
    const pix = span(t, s + 3.4, s + 3.9, inOut);
    x.globalAlpha = a;
    phone(x, img.studio, 540, PHONE_Y, 0.015, 0, (o) => {
      const i = Math.floor(clamp((t - s - 0.4) / 0.42, 0, tools.length - 1));
      ring(o, el("tour-studio", tools[i]), span(t, s + 0.4, s + 0.6) * (1 - pix));
      o.save();
      o.globalAlpha *= span(t, s + 0.6, s + 1.1) * (1 - pix);
      serif(o, "Your first stroke goes here.", 195, 462, 18, 330, SOFT, true, "center");
      o.restore();
    });
    if (pix > 0) {
      x.globalAlpha = a * pix;
      phone(x, img.pixel, 540, PHONE_Y, 0.015, 0, (o) => {
        o.save();
        o.globalAlpha *= span(t, s + 3.9, s + 4.3);
        o.fillStyle = PINK;
        o.beginPath();
        o.roundRect(60, 280, 270, 34, 17);
        o.fill();
        o.font = "700 14px Archivo";
        o.fillStyle = PAPER;
        o.textAlign = "center";
        o.fillText("OR PIXEL ART, CELL BY CELL", 195, 302);
        o.restore();
      });
    }
    x.globalAlpha = 1;
  }

  // a piece's page: press play, and every stroke comes back
  if (t >= T.s3 && t < T.s4) {
    const a = life(t, T.s3, T.s4, 0.25), s = T.s3;
    title(x, "03", "PRESS PLAY ON", "ANY PIECE.", "Every stroke comes back, in order. The recording is the signature.", a);
    x.globalAlpha = a;
    phone(x, img.piece, 540, PHONE_Y, -0.015, 40, (o) => {
      const pos = span(t, s + 1.0, s + 5.2, (p) => p);
      if (t > s + 0.9) {
        replay.draw(pos);
        const [bx, by, bw, bh] = plateBox;
        o.fillStyle = PAPER;
        o.fillRect(bx, by, bw, bh);
        o.drawImage(replayCanvas, bx, by, bw, bh);
      }
      tap(o, el("tour-piece", "Play replay"), span(t, s + 0.5, s + 1.2, (p) => p));
    });
    x.globalAlpha = 1;
  }

  // the gallery, scrolling
  if (t >= T.s4 && t < T.s5) {
    const a = life(t, T.s4, T.s5, 0.25), s = T.s4;
    title(x, "04", "SHOW IT IN", "THE GALLERY.", "No uploads get in. The AI samples wear a tag; hand-made work goes in front.", a);
    x.globalAlpha = a;
    phone(x, img.gallery, 540, PHONE_Y, 0.02, span(t, s + 0.8, s + 5.0, inOut) * 1250);
    x.globalAlpha = 1;
  }

  // the wall, on the home page
  if (t >= T.s5 && t < T.s6) {
    const a = life(t, T.s5, T.s6, 0.25), s = T.s5;
    title(x, "05", "DRAW ON THE WALL,", "TOGETHER.", "One sheet for everyone, a new subject every three days.", a);
    x.globalAlpha = a;
    phone(x, img.home, 540, PHONE_Y, -0.02, 1180 + span(t, s + 0.3, s + 4.5, inOut) * 260);
    x.globalAlpha = 1;
  }

  // what to do now
  if (t >= T.s6) {
    const a = span(t, T.s6, T.s6 + 0.3), s = T.s6;
    x.globalAlpha = a;
    logoRep.draw(span(t, s, s + 1.0, (p) => 1 - Math.pow(1 - p, 2)));
    x.drawImage(logoCanvas, 540 - 220, 330, 440, 220);
    const k = span(t, s + 0.3, s + 0.8);
    x.save();
    x.globalAlpha = a * k;
    x.translate(0, (1 - k) * 40);
    headline(x, "START DRAWING.", 540, 780, 150, INK, "center", 940);
    headline(x, "RIGHT NOW.", 540, 930, 150, PINK, "center", 940);
    x.restore();
    x.globalAlpha = a * span(t, s + 1.0, s + 1.5);
    serif(x, OPEN ? "Free, in your browser. Make an account to show your work in the gallery." : "No account needed to draw: your sheets stay on your device.", 540, 1040, 46, 900, INK, true, "center");
    // the address lands on the music's next phrase
    const hit = 1 + 0.08 * (1 - span(t, T.hit, T.hit + 0.45));
    x.globalAlpha = a * span(t, T.hit - 0.15, T.hit);
    x.save();
    x.translate(540, 1260);
    x.scale(hit, hit);
    headline(x, "TILOART.COM/STUDIO", 0, 0, 120, BLUE, "center", 960);
    x.restore();
    if (!OPEN) {
      x.globalAlpha = a * span(t, T.hit + 0.4, T.hit + 0.9);
      kicker(x, "Gallery: closed beta · invites: hello@tiloart.com", 540, 1370, SOFT, "center", 24);
    }
    x.globalAlpha = 1;
  }
}

/** the Reel cover: the title in the middle, where the grid's 3:4 crop keeps it */
function cover() {
  const c = createCanvas(W, H), x = c.getContext("2d");
  ground(x);
  logoAt(x, INK, 540, 470, 420);
  kicker(x, "A 30-second tour", 80, 720, PINK, "left", 36);
  headline(x, "THIS IS", 80, 940, 250, INK);
  const hw = measureHead(x, "TILO.", 250);
  highlighter(x, 80 + 5, 80 + hw * 0.98, 1190 - 85, 185, 1);
  headline(x, "TILO.", 80, 1190, 250, PINK);
  serif(x, "A free studio for drawing by hand, in your browser.", 80, 1320, 50, 900, SOFT, true);
  return c;
}

const [mode, dir] = process.argv.slice(2);
const outDir = join(HERE, "out");
mkdirSync(outDir, { recursive: true });

if (mode === "frames") {
  mkdirSync(dir, { recursive: true });
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d");
  // the replays only run forward, so the stills go in time order
  for (const t of [1.6, 4.6, 6.6, 8.4, 10.3, 12.6, 15.5, 19.5, 25.0, 30.0, 34.6]) {
    frame(ctx, t);
    writeFileSync(join(dir, `t${t.toFixed(1).padStart(4, "0")}.png`), await canvas.encode("png"));
  }
  writeFileSync(join(dir, "cover.png"), await cover().encode("png"));
  console.log("stills in", dir);
} else {
  writeFileSync(join(outDir, "tour-cover.png"), await cover().encode("png"));
  const silent = join(outDir, "tilo-tour-silent.mp4");
  await encode(silent, Math.round(T.end * FPS), frame);
  console.log("wrote", silent);
  if (existsSync(MUSIC)) {
    await withMusic(MUSIC, silent, join(outDir, "tilo-tour.mp4"), TRACK_GROOVE - BEAT0, T.end, true);
    console.log("wrote", join(outDir, "tilo-tour.mp4"));
  } else console.log(`no ${MUSIC}: silent copy only`);
}
