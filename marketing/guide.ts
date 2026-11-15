/* What the guide videos share (make-join-video.ts, make-launch-video.ts): a voiceover timed
   scene by scene, subtitles from what it says, phones holding real screenshots with taps and
   rings drawn on the page, the piece page's replay, the voice-over-music mix, and stills or
   the full render. The voice is Kokoro, synthesized on this Mac (marketing/say.py speaks
   marketing/voice/NAME.json into marketing/voice/NAME/); the music is "In This Moment" by
   Scott Buckley (CC BY 4.0), in marketing/music/, ducked while the voice speaks. */

import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BLUE, encode, FPS, H, headline, HERE, INK, kicker, PAPER, PINK, span, W } from "./kit";
import { samples } from "../src/data/samples";
import { Replayer } from "../src/engine/replay";
import { layersOf, sizeOf } from "../src/engine/stroke";

export type Box = [number, number, number, number];
export type Scene = { name: string; start: number; voice: number; end: number; text: string };

const MUSIC = join(HERE, "music", "InThisMoment.mp3");
/** where in the track the bed starts: past its quiet opening, where it has settled */
const MUSIC_FROM = 15;
/** what the voice says, as it should read on screen */
const SAY_TO_READ: [RegExp, string][] = [[/tiloart dot com slash join/gi, "tiloart.com/join"]];

export async function guide(o: {
  /** marketing/voice/NAME.json and its WAVs */
  voice: string;
  /** the shoot.mjs sets whose boxes the shots need */
  boxes: string[];
  /** the shots the scenes use, from marketing/shots */
  shots: string[];
  sayToRead?: [RegExp, string][];
}) {
  const VOICE = join(HERE, "voice", o.voice);
  const script = JSON.parse(readFileSync(join(HERE, "voice", `${o.voice}.json`), "utf8")) as { lines: [string, string][] };
  const lengths = JSON.parse(readFileSync(join(VOICE, "lengths.json"), "utf8")) as Record<string, number>;

  /* ---------- the timeline: each scene is its line, a breath before and after ---------- */
  const LEAD = 0.35, TAIL = 0.55, LAST_TAIL = 2.6;
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
  const cues: { a: number; b: number; text: string }[] = [];
  for (const s of scenes) {
    let text = s.text;
    for (const [re, to] of [...SAY_TO_READ, ...(o.sayToRead ?? [])]) text = text.replace(re, to);
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
  type Boxes = Record<string, { scrollY?: number; canvases: Box[]; els: [string, ...Box][] }>;
  const boxes: Boxes = Object.assign(
    {},
    ...o.boxes.map((f) => JSON.parse(readFileSync(join(SHOTS, `${f}-boxes.json`), "utf8")) as Boxes),
  );
  const img: Record<string, Image> = {};
  for (const n of o.shots) img[n] = await shot(n);
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

  /** `-- frames DIR` writes stills to look at; otherwise the cover, the silent video and the mixed one go in marketing/out */
  async function run(name: string, frame: (x: SKRSContext2D, t: number) => void, cover: () => ReturnType<typeof createCanvas>) {
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
      return;
    }
    writeFileSync(join(outDir, `${name}-cover.png`), await cover().encode("png"));
    const silent = join(outDir, `tilo-${name}-silent.mp4`);
    await encode(silent, Math.round(END * FPS), frame);
    console.log("wrote", silent);
    if (!existsSync(MUSIC)) throw new Error(`no ${MUSIC}`);
    await mix(silent, join(outDir, `tilo-${name}.mp4`));
    console.log("wrote", join(outDir, `tilo-${name}.mp4`));
  }

  return { scenes, S, END, lengths, el, field, phone, tap, ring, swap, title, subtitle, replay, replayCanvas, plateBox, PHONE_Y, run };
}
