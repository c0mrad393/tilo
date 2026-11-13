/* How to join: from the waiting list to a first piece, in about a minute, with a voice.
   9:16, 1080 x 1920, 30 fps. The voice is synthesized on this Mac with Kokoro (open source,
   Apache-2.0; marketing/say.py speaks marketing/voice/join.json into marketing/voice/join/),
   and the end card says it is synthesized. Under it, "In This Moment" by Scott Buckley
   (scottbuckley.com.au, CC BY 4.0: the post has to credit it), in marketing/music/, ducked
   while the voice speaks. Every scene lasts as long as its line, so a new line re-times it all.
   The phones hold the real site. The sign-up screens come from a local server, so nothing was
   sent to the real one (node marketing/shoot.mjs join1 / join2, see there); the invite code on
   them is made up. The others are the tour's shots of tiloart.com (shoot.mjs tour).
   Usage, from the repository root: npm run video:join [-- frames DIR] */

import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BLUE, clamp, encode, FPS, ground, H, headline, HERE, highlighter, inOut, INK, kicker, life, logoAt, logoCanvas, logoRep,
  measureHead, PAPER, PINK, serif, SOFT, span, W,
} from "./kit";
import { samples } from "../src/data/samples";
import { Replayer } from "../src/engine/replay";
import { layersOf, sizeOf } from "../src/engine/stroke";

const MUSIC = join(HERE, "music", "InThisMoment.mp3");
/** where in the track the bed starts: past its quiet opening, where it has settled */
const MUSIC_FROM = 15;
const VOICE = join(HERE, "voice", "join");
const script = JSON.parse(readFileSync(join(HERE, "voice", "join.json"), "utf8")) as { lines: [string, string][] };
const lengths = JSON.parse(readFileSync(join(VOICE, "lengths.json"), "utf8")) as Record<string, number>;

/* ---------- the timeline: each scene is its line, a breath before and after ---------- */
const LEAD = 0.35, TAIL = 0.55, LAST_TAIL = 2.6;
type Scene = { name: string; start: number; voice: number; end: number; text: string };
const scenes: Scene[] = [];
{
  let t = 0;
  script.lines.forEach(([name, text], i) => {
    const voice = t + LEAD;
    const end = voice + lengths[name] + (i === script.lines.length - 1 ? LAST_TAIL : TAIL);
    scenes.push({ name, start: t, voice, end, text });
    t = end;
  });
}
const S = Object.fromEntries(scenes.map((s) => [s.name, s])) as Record<string, Scene>;
const END = scenes[scenes.length - 1].end;

/* ---------- subtitles: what the voice says, a sentence or so at a time ---------- */
const SAY_TO_READ: [RegExp, string][] = [
  [/tiloart dot com slash join/gi, "tiloart.com/join"],
  [/Press, Join Tilo/, "Press “Join Tilo”"],
];
const cues: { a: number; b: number; text: string }[] = [];
for (const s of scenes) {
  let text = s.text;
  for (const [re, to] of SAY_TO_READ) text = text.replace(re, to);
  // a sentence ends at a stop with a space after it, so "tiloart.com/join" stays whole
  const parts = text.split(/(?<=[.?!])\s+/);
  // short sentences ride with the next one, so a cue isn't on for a blink
  const chunks: string[] = [];
  for (const p of parts) chunks.length && chunks[chunks.length - 1].length < 28 ? (chunks[chunks.length - 1] += " " + p) : chunks.push(p);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  let t = s.voice;
  for (const c of chunks) {
    const d = (c.length / total) * lengths[s.name];
    cues.push({ a: t, b: t + d, text: c });
    t += d;
  }
}

/* ---------- the shots, and where things sit on them ---------- */
const SHOTS = join(HERE, "shots");
const shot = (n: string) => loadImage(join(SHOTS, `${n}.png`));
type Box = [number, number, number, number];
type Boxes = Record<string, { scrollY?: number; canvases: Box[]; els: [string, ...Box][] }>;
const boxes: Boxes = Object.assign(
  {},
  ...["join1", "join2", "tour"].map((f) => JSON.parse(readFileSync(join(SHOTS, `${f}-boxes.json`), "utf8")) as Boxes),
);
const img: Record<string, Image> = {};
for (const n of ["join-form", "join-done", "invite-mail", "signin-form", "signin-sent", "handle-form", "tour-studio", "tour-pixel", "tour-piece", "tour-gallery", "tour-home"]) img[n] = await shot(n);
/** where a button or label sits on a page, in page CSS pixels, by the start of its name */
const el = (page: string, name: string): Box => {
  const e = boxes[page].els.find(([t]) => t.startsWith(name));
  if (!e) throw new Error(`no "${name}" on ${page}`);
  return e.slice(1) as Box;
};

/** a form field: its label and the box under it, across the page's column */
const field = (page: string, name: string): Box => {
  const [lx, ly] = el(page, name);
  return [lx, ly, 390 - lx * 2, 68];
};

/* ---------- a phone holding a page; draw on it in the page's own CSS pixels ---------- */
const PHONE_W = 470, PHONE_H = PHONE_W * (2532 / 1170), CSS = PHONE_W / 390;
const PHONE_Y = 1150;
/** scroll: how far to move the picture up (tall shots); the overlay follows the page */
function phone(x: SKRSContext2D, name: string, cx: number, cy: number, rot: number, scroll = 0, over?: (x: SKRSContext2D) => void) {
  const page = img[name];
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
  x.fillStyle = "#fff";
  x.fillRect(-w / 2, -h / 2, w, h);
  x.drawImage(page, 0, scroll * 3, 1170, 2532, -w / 2, -h / 2, w, h);
  if (over) {
    x.translate(-w / 2, -h / 2 - (scroll + (boxes[name]?.scrollY ?? 0)) * CSS);
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
/** a finger tap: a ring that grows and fades */
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
/** a pink outline round something */
function ring(x: SKRSContext2D, [bx, by, bw, bh]: Box, a: number) {
  if (a <= 0) return;
  x.save();
  x.globalAlpha *= a;
  x.strokeStyle = PINK;
  x.lineWidth = 3;
  x.beginPath();
  x.roundRect(bx - 4, by - 4, bw + 8, bh + 8, 8);
  x.stroke();
  x.restore();
}
/** one shot fading into another at k */
function swap(x: SKRSContext2D, a: number, k: number, first: () => void, second: () => void) {
  x.globalAlpha = a * (1 - k);
  if (k < 1) first();
  x.globalAlpha = a * k;
  if (k > 0) second();
  x.globalAlpha = 1;
}

/* ---------- the replay on the piece page: that sample's own recording ---------- */
const OLD = samples().find((p) => p.id === "oldtown")!;
const plateBox = boxes["tour-piece"].canvases[0];
const replayCanvas = createCanvas(Math.round(plateBox[2] * 3), Math.round(plateBox[3] * 3));
const replay = new Replayer(replayCanvas as unknown as HTMLCanvasElement, OLD.strokes, OLD.paper ?? "smooth", sizeOf(OLD).w, layersOf(OLD).map((l) => ({ ...l })), sizeOf(OLD).h);

/* ---------- words ---------- */
function title(x: SKRSContext2D, no: string, l1: string, l2: string, a: number) {
  x.save();
  x.globalAlpha *= a;
  kicker(x, no, 90, 190, PINK, "left", 32);
  headline(x, l1, 90, 310, 112, INK);
  headline(x, l2, 90, 425, 112, BLUE);
  x.restore();
}
/** the subtitle under the phone */
function subtitle(x: SKRSContext2D, t: number) {
  const c = cues.find((q) => t >= q.a - 0.1 && t < q.b + 0.25);
  if (!c) return;
  const a = Math.min(span(t, c.a - 0.1, c.a + 0.1), 1 - span(t, c.b + 0.1, c.b + 0.25));
  x.save();
  x.globalAlpha = a;
  x.font = "600 40px Archivo";
  // two lines at most, centred, on a paper band
  const words = c.text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (x.measureText(next).width > 920 && line) (lines.push(line), (line = w));
    else line = next;
  }
  lines.push(line);
  const y0 = 1795 - (lines.length - 1) * 26;
  const bw = Math.max(...lines.map((l) => x.measureText(l).width)) + 48;
  x.fillStyle = "rgba(29,27,25,0.86)";
  x.beginPath();
  x.roundRect(540 - bw / 2, y0 - 46, bw, lines.length * 52 + 30, 14);
  x.fill();
  x.fillStyle = PAPER;
  x.textAlign = "center";
  lines.forEach((l, i) => x.fillText(l, 540, y0 + i * 52));
  x.restore();
}

function frame(x: SKRSContext2D, t: number) {
  ground(x);
  const life_ = (s: Scene) => life(t, s.start, s.end, 0.3);
  const on = (s: Scene) => t >= s.start && t < s.end;

  // the hook
  if (on(S.hook)) {
    const s = S.hook, a = life(t, -1, s.end, 0.3);
    x.globalAlpha = a * span(t, 0.0, 0.3);
    kicker(x, "In about a minute", 84, 640, PINK, "left", 36);
    const size = 210;
    const k1 = span(t, 0.2, 0.6);
    x.save();
    x.globalAlpha = a * k1;
    x.translate(0, (1 - k1) * 40);
    headline(x, "HOW TO", 80, 840, size, INK);
    headline(x, "JOIN", 80, 1040, size, INK);
    x.restore();
    const k2 = span(t, 0.6, 1.0);
    if (k2 > 0) {
      const hw = measureHead(x, "TILO.", size);
      x.globalAlpha = a;
      highlighter(x, 80 + size * 0.02, 80 + hw * 0.98, 1240 - size * 0.34, size * 0.74, span(t, 1.0, 1.6));
      x.save();
      x.globalAlpha = a * k2;
      x.translate(0, (1 - k2) * 40);
      headline(x, "TILO.", 80, 1240, size, PINK);
      x.restore();
    }
    x.globalAlpha = a * span(t, 1.2, 1.6);
    serif(x, "From the waiting list to your first piece in the gallery.", 84, 1370, 46, 900, SOFT, true);
    x.globalAlpha = 1;
  }

  // 01: the waiting list, then "you're on the list"
  if (on(S.join)) {
    const s = S.join, a = life_(s);
    title(x, "01 · tiloart.com/join", "LEAVE YOUR", "EMAIL.", a);
    const k = span(t, s.voice + 4.6, s.voice + 5.1, inOut);
    swap(x, a, k,
      () => phone(x, "join-form", 540, PHONE_Y + (1 - span(t, s.start, s.start + 0.6)) * 400, -0.02, 0, (o) => {
        ring(o, field("join-form", "Email"), span(t, s.voice + 0.8, s.voice + 1.2) * (1 - span(t, s.voice + 3.4, s.voice + 3.7)));
        tap(o, el("join-form", "Put me on the list"), span(t, s.voice + 3.9, s.voice + 4.6, (p) => p));
      }),
      () => phone(x, "join-done", 540, PHONE_Y, -0.02),
    );
  }

  // 02: the invite email
  if (on(S.mail)) {
    const s = S.mail, a = life_(s);
    title(x, "02", "YOUR INVITE", "ARRIVES.", a);
    x.globalAlpha = a;
    phone(x, "invite-mail", 540, PHONE_Y, 0.015, 0, (o) => {
      ring(o, el("invite-mail", "Join Tilo"), span(t, s.voice + 2.4, s.voice + 2.7) * (1 - span(t, s.voice + 3.4, s.voice + 3.6)));
      tap(o, el("invite-mail", "Join Tilo"), span(t, s.voice + 3.2, s.voice + 3.9, (p) => p));
    });
    x.globalAlpha = 1;
  }

  // 03: sign in with a link, no password
  if (on(S.signin)) {
    const s = S.signin, a = life_(s);
    title(x, "03", "SIGN IN.", "NO PASSWORD.", a);
    const k = span(t, s.voice + 3.0, s.voice + 3.5, inOut);
    swap(x, a, k,
      () => phone(x, "signin-form", 540, PHONE_Y, -0.015, 0, (o) => tap(o, el("signin-form", "Email me a link"), span(t, s.voice + 2.3, s.voice + 3.0, (p) => p))),
      () => phone(x, "signin-sent", 540, PHONE_Y, -0.015),
    );
  }

  // 04: pick a handle; the code is filled in
  if (on(S.handle)) {
    const s = S.handle, a = life_(s);
    title(x, "04", "PICK YOUR", "HANDLE.", a);
    x.globalAlpha = a;
    phone(x, "handle-form", 540, PHONE_Y, 0.015, 0, (o) => {
      ring(o, field("handle-form", "Handle"), span(t, s.voice + 0.3, s.voice + 0.6) * (1 - span(t, s.voice + 1.4, s.voice + 1.6)));
      ring(o, field("handle-form", "Invite code"), span(t, s.voice + 1.7, s.voice + 2.0) * (1 - span(t, s.voice + 3.4, s.voice + 3.6)));
      tap(o, el("handle-form", "Join Tilo"), span(t, s.voice + 4.1, s.voice + 4.8, (p) => p));
    });
    x.globalAlpha = 1;
  }

  // 05: the studio; then pixels
  if (on(S.draw)) {
    const s = S.draw, a = life_(s);
    title(x, "05", "OPEN THE STUDIO.", "DRAW.", a);
    const tools = ["Pencil", "Ink pen", "Brush pen", "Charcoal", "Marker", "Watercolour"];
    const k = span(t, s.voice + 3.0, s.voice + 3.5, inOut);
    swap(x, a, k,
      () => phone(x, "tour-studio", 540, PHONE_Y, -0.015, 0, (o) => {
        const i = Math.floor(clamp((t - s.voice - 0.6) / 0.4, 0, tools.length - 1));
        ring(o, el("tour-studio", tools[i]), span(t, s.voice + 0.6, s.voice + 0.8));
        o.save();
        o.globalAlpha *= span(t, s.voice + 0.8, s.voice + 1.3);
        serif(o, "Your first stroke goes here.", 195, 462, 18, 330, SOFT, true, "center");
        o.restore();
      }),
      () => phone(x, "tour-pixel", 540, PHONE_Y, -0.015, 0, (o) => {
        o.save();
        o.globalAlpha *= span(t, s.voice + 3.5, s.voice + 3.9);
        o.fillStyle = PINK;
        o.beginPath();
        o.roundRect(60, 280, 270, 34, 17);
        o.fill();
        o.font = "700 14px Archivo";
        o.fillStyle = PAPER;
        o.textAlign = "center";
        o.fillText("OR PIXEL ART, CELL BY CELL", 195, 302);
        o.restore();
      }),
    );
  }

  // 06: a piece with its recording, replaying
  if (on(S.publish)) {
    const s = S.publish, a = life_(s);
    title(x, "06", "PUBLISH IT.", "PRESS PLAY.", a);
    x.globalAlpha = a;
    // the piece on show is one of the site's samples, which an AI drew; say so
    serif(x, "The piece shown is a Tilo sample drawn by Claude, an AI, and labelled so on the site.", 90, 500, 30, 900, SOFT, true);
    phone(x, "tour-piece", 540, PHONE_Y, 0.015, 40, (o) => {
      const pos = span(t, s.voice + 1.2, s.end - 0.2, (p) => p);
      if (t > s.voice + 1.1) {
        replay.draw(pos);
        const [bx, by, bw, bh] = plateBox;
        o.fillStyle = PAPER;
        o.fillRect(bx, by, bw, bh);
        o.drawImage(replayCanvas, bx, by, bw, bh);
      }
      tap(o, el("tour-piece", "Play replay"), span(t, s.voice + 0.6, s.voice + 1.3, (p) => p));
    });
    x.globalAlpha = 1;
  }

  // 07: the gallery, then the wall
  if (on(S.social)) {
    const s = S.social, a = life_(s);
    title(x, "07", "STAMP. FOLLOW.", "DRAW TOGETHER.", a);
    x.globalAlpha = a;
    serif(x, "Pieces marked AI-MADE are Tilo's samples, drawn by an AI.", 90, 500, 30, 900, SOFT, true);
    x.globalAlpha = 1;
    const k = span(t, s.voice + 2.9, s.voice + 3.4, inOut);
    swap(x, a, k,
      () => phone(x, "tour-gallery", 540, PHONE_Y, -0.015, 300 + span(t, s.start, s.voice + 3.2, inOut) * 700),
      () => phone(x, "tour-home", 540, PHONE_Y, -0.015, 1180 + span(t, s.voice + 3.0, s.end, inOut) * 200),
    );
  }

  // the end card
  if (t >= S.cta.start) {
    const s = S.cta, a = span(t, s.start, s.start + 0.3);
    x.globalAlpha = a;
    logoRep.draw(span(t, s.start, s.start + 1.0, (p) => 1 - Math.pow(1 - p, 2)));
    x.drawImage(logoCanvas, 540 - 200, 250, 400, 200);
    const k = span(t, s.start + 0.3, s.start + 0.8);
    x.save();
    x.globalAlpha = a * k;
    x.translate(0, (1 - k) * 40);
    headline(x, "CAN'T WAIT?", 540, 660, 130, INK, "center", 940);
    headline(x, "START DRAWING NOW.", 540, 790, 130, PINK, "center", 940);
    x.restore();
    x.globalAlpha = a * span(t, s.voice + 1.6, s.voice + 2.1);
    serif(x, "No account needed. Your sheets stay on your device until you're in.", 540, 900, 44, 880, INK, true, "center");
    // the address arrives with the voice saying it
    const say = s.voice + lengths.cta - 2.0;
    const pulse = 1 + 0.07 * (1 - span(t, say, say + 0.45));
    x.globalAlpha = a * span(t, say - 0.2, say);
    x.save();
    x.translate(540, 1170);
    x.scale(pulse, pulse);
    headline(x, "TILOART.COM/JOIN", 0, 0, 124, BLUE, "center", 980);
    x.restore();
    x.globalAlpha = a * span(t, s.voice + 0.6, s.voice + 1.0);
    kicker(x, "Drawing: tiloart.com/studio", 540, 1280, SOFT, "center", 28);
    x.globalAlpha = a * span(t, say, say + 0.5);
    serif(x, "Voice: synthesized with Kokoro. Music: “In This Moment” by Scott Buckley, CC BY 4.0.", 540, 1600, 26, 900, SOFT, true, "center");
    x.globalAlpha = 1;
  }

  subtitle(x, t);
}

/** the Reel cover */
function cover() {
  const c = createCanvas(W, H), x = c.getContext("2d");
  ground(x);
  logoAt(x, INK, 540, 430, 400);
  kicker(x, "In about a minute", 80, 680, PINK, "left", 36);
  headline(x, "HOW TO", 80, 880, 210, INK);
  headline(x, "JOIN", 80, 1080, 210, INK);
  const hw = measureHead(x, "TILO.", 210);
  highlighter(x, 84, 80 + hw * 0.98, 1280 - 71, 155, 1);
  headline(x, "TILO.", 80, 1280, 210, PINK);
  serif(x, "From the waiting list to your first piece in the gallery.", 80, 1400, 48, 900, SOFT, true);
  return c;
}

/** the voice lines at their places, and the music under them, quieter while she speaks */
async function mix(silent: string, file: string) {
  const voices = scenes.map((s) => join(VOICE, `${s.name}.wav`));
  const inputs = ["-i", silent, "-ss", String(MUSIC_FROM), "-t", String(END), "-i", MUSIC, ...voices.flatMap((v) => ["-i", v])];
  const placed = scenes.map((s, i) => `[${i + 2}:a]aresample=48000,aformat=channel_layouts=mono,adelay=${Math.round(s.voice * 1000)}:all=1[v${i}]`);
  const graph = [
    ...placed,
    `${scenes.map((_, i) => `[v${i}]`).join("")}amix=inputs=${scenes.length}:normalize=0,apad=whole_dur=${END},loudnorm=I=-16:TP=-2:LRA=7,asplit=2[voice][key]`,
    `[1:a]aresample=48000,afade=t=in:d=1.2,afade=t=out:st=${END - 3}:d=3,volume=-2dB[bed]`,
    `[bed][key]sidechaincompress=threshold=0.03:ratio=4:attack=40:release=600:makeup=1[ducked]`,
    `[voice]pan=stereo|c0=c0|c1=c0[vs]`,
    `[vs][ducked]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[out]`,
  ].join(";");
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", graph, "-map", "0:v", "-map", "[out]", "-c:v", "copy", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-t", String(END), "-movflags", "+faststart", file], { stdio: "inherit" });
  await new Promise((r) => ff.on("close", r));
}

const [mode, dir] = process.argv.slice(2);
const outDir = join(HERE, "out");
mkdirSync(outDir, { recursive: true });
console.log(`${END.toFixed(1)} s; scenes at ${scenes.map((s) => `${s.name} ${s.start.toFixed(1)}`).join(", ")}`);

if (mode === "frames") {
  mkdirSync(dir, { recursive: true });
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d");
  // the replays only run forward, so the stills go in time order
  const at = scenes.flatMap((s) => [s.voice + 1.2, (s.voice + s.end) / 2 + 0.5]).sort((a, b) => a - b);
  for (const t of at) {
    frame(ctx, t);
    writeFileSync(join(dir, `t${t.toFixed(1).padStart(4, "0")}.png`), await canvas.encode("png"));
  }
  writeFileSync(join(dir, "cover.png"), await cover().encode("png"));
  console.log("stills in", dir);
} else {
  writeFileSync(join(outDir, "join-cover.png"), await cover().encode("png"));
  const silent = join(outDir, "tilo-join-silent.mp4");
  await encode(silent, Math.round(END * FPS), frame);
  console.log("wrote", silent);
  if (!existsSync(MUSIC)) throw new Error(`no ${MUSIC}`);
  await mix(silent, join(outDir, "tilo-join.mp4"));
  console.log("wrote", join(outDir, "tilo-join.mp4"));
}
