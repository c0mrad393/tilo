/* Release week (src/data/event.ts): the sunset wall, the event's subject and the AI-made samples,
   in under a minute, with a voice. 9:16, 1080 x 1920, 30 fps; the parts every guide video
   shares are in guide.ts. The phones hold tiloart.com as it was during the event
   (node marketing/shoot.mjs release); the wall is its outline as the server draws it
   (npm run wall:sheet -- strip, into marketing/out/wall-strip.png); the paintings are the samples'
   own recordings, replayed. Those samples are Claude's, drawn in code, and the video says so
   wherever one is on screen. Nothing in it comes from the game: no logo, lettering, art or
   character, only its name and date, and the end card says Tilo has nothing to do with it.
   Usage, from the repository root: npm run video:release [-- frames DIR] */

import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { join } from "node:path";
import { drawPlate, H, HERE, headline, inOut, kicker, life, logoAt, PAPER, plate, serif, span, trace, W, YELLOW } from "./kit";
import { guide, type Scene } from "./guide";
import { samples } from "../src/data/samples";
import { SUBJECTS } from "../src/data/prompt";

const { S, lengths, el, phone, ring, tap, subtitle, PHONE_Y, run } = await guide({
  voice: "release",
  boxes: ["release", "tour"],
  shots: ["rel-home", "rel-wall"],
  sayToRead: [[/G T A six/g, "GTA VI"], [/tiloart dot com/g, "tiloart.com"]],
});

const NIGHT = "#1B1426", PINKS = "#FF4F9A", TEAL = "#22E1D8";
const SKY = ["#24124A", "#4E2580", "#A2348E", "#F0507A", "#FF8A5C", "#FFC46A"];
const wallPic = await loadImage(join(HERE, "out", "wall-strip.png"));
const piece = (id: string) => samples().find((p) => p.id === id)!;
const strip = plate(piece("sunstrip"), 940), motel = plate(piece("neonmotel"), 940), loading = plate(piece("loadingme"), 560);
const inks = SUBJECTS.find((s) => s.event === "release")!.palette;

/** the dusk the whole video sits in: a sky in bands, a striped sun low down, stars */
const dusk = (() => {
  const c = createCanvas(W, H), x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, H);
  SKY.forEach((s, i) => g.addColorStop(i / (SKY.length - 1), s));
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  let seed = 3;
  const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  x.fillStyle = "rgba(255,233,246,0.8)";
  for (let i = 0; i < 90; i++) {
    const r = 1 + R() * 2.2;
    x.beginPath();
    x.arc(R() * W, R() * 700, r, 0, Math.PI * 2);
    x.fill();
  }
  return c;
})();
function sun(x: SKRSContext2D, cx: number, base: number, r: number, a = 1) {
  x.save();
  x.globalAlpha *= a;
  x.beginPath();
  x.rect(0, 0, W, base);
  x.clip();
  const g = x.createLinearGradient(0, base - r, 0, base);
  g.addColorStop(0, "#FFF0A0");
  g.addColorStop(0.5, "#FFB347");
  g.addColorStop(1, PINKS);
  x.fillStyle = g;
  x.beginPath();
  x.arc(cx, base, r, Math.PI, 0);
  x.fill();
  // the cuts, in the sky's colour behind them
  for (let k = 0; k < 6; k++) {
    const y = base - r * 0.5 + k * r * 0.09;
    x.fillStyle = "#F0507A";
    x.fillRect(cx - r, y, r * 2, 4 + k * 3);
  }
  x.restore();
}
function ground(x: SKRSContext2D, t: number) {
  x.drawImage(dusk, 0, 0);
  sun(x, 540, 1500 - Math.sin(t * 0.08) * 20, 420, 0.55);
  // the sea under it
  const sea = x.createLinearGradient(0, 1500, 0, H);
  sea.addColorStop(0, "#4A2A72");
  sea.addColorStop(1, NIGHT);
  x.fillStyle = sea;
  x.fillRect(0, 1500, W, H - 1500);
  x.fillStyle = TEAL;
  x.fillRect(0, 1500, W, 5);
}

/** a scene's heading, on the dusk: a yellow kicker and two lines in paper and pink */
/** headlines sit on the sky with a hard violet shadow, like a poster's */
function shade(x: SKRSContext2D) {
  x.shadowColor = "rgba(27,20,38,0.75)";
  x.shadowOffsetX = 6;
  x.shadowOffsetY = 8;
  x.shadowBlur = 0;
}
function title(x: SKRSContext2D, no: string, l1: string, l2: string, a: number) {
  x.save();
  x.globalAlpha *= a;
  shade(x);
  kicker(x, no, 90, 190, YELLOW, "left", 32);
  headline(x, l1, 90, 310, 112, PAPER);
  headline(x, l2, 90, 425, 112, PINKS);
  x.restore();
}
const note = (x: SKRSContext2D, text: string, y: number, a: number) => {
  x.save();
  x.globalAlpha *= a;
  serif(x, text, 90, y, 30, 900, "rgba(251,250,245,0.88)", true);
  x.restore();
};

function frame(x: SKRSContext2D, t: number) {
  ground(x, t);
  const life_ = (s: Scene) => life(t, s.start, s.end, 0.3);
  const on = (s: Scene) => t >= s.start && t < s.end;

  // the hook
  if (on(S.hook)) {
    const s = S.hook, a = life(t, -1, s.end, 0.3), size = 250;
    x.globalAlpha = a * span(t, 0, 0.3);
    kicker(x, "Tilo · 15 to 20 November", 84, 640, YELLOW, "left", 36);
    for (const [i, [word, colour]] of ([["RELEASE", PAPER], ["WEEK.", PINKS]] as const).entries()) {
      const k = span(t, 0.2 + i * 0.3, 0.6 + i * 0.3);
      x.save();
      x.globalAlpha = a * k;
      x.translate(0, (1 - k) * 50);
      shade(x);
      headline(x, word, 80, 860 + i * 215, size, colour);
      x.restore();
    }
    const k = span(t, s.voice + 1.4, s.voice + 1.9);
    x.save();
    x.globalAlpha = a * k;
    x.fillStyle = NIGHT;
    x.beginPath();
    x.roundRect(84, 1170, 690, 96, 12);
    x.fill();
    kicker(x, "GTA VI · out 19 November", 114, 1232, YELLOW, "left", 38);
    x.restore();
    x.globalAlpha = a * span(t, s.voice + 3.6, s.voice + 4.1);
    serif(x, "Draw while you wait.", 84, 1370, 60, 900, PAPER, true);
    x.globalAlpha = 1;
  }

  // the wall, whole, drifting across
  if (on(S.wall)) {
    const s = S.wall, a = life_(s);
    title(x, "Wall No. 5 · 15 to 20 Nov", "THE SUNSET", "STRIP.", a);
    const h = 1000, w = h * 2, p = span(t, s.start, s.end, inOut);
    x.save();
    x.globalAlpha = a;
    x.beginPath();
    x.roundRect(40, 560, W - 80, 1000, 18);
    x.clip();
    x.drawImage(wallPic, -p * (w - W + 80) + 40, 560, w, h);
    x.restore();
    note(x, "The outline is Claude's, an AI's. Every mark on it is by hand.", 1620, a);
  }

  // members fill it in
  if (on(S.fill)) {
    const s = S.fill, a = life_(s);
    title(x, "On tiloart.com/wall", "FILL IT IN,", "BY HAND.", a);
    x.globalAlpha = a;
    phone(x, "rel-wall", 540, PHONE_Y + (1 - span(t, s.start, s.start + 0.6)) * 300, -0.015, 420, (o) => ring(o, [16, 680, 358, 420], span(t, s.voice + 0.4, s.voice + 0.8)));
    x.globalAlpha = 1;
  }

  // the subject on the 18th, with its six inks
  if (on(S.subject)) {
    const s = S.subject, a = life_(s);
    title(x, "Subject No. 313 · 18 November", "YOURSELF, AS A", "LOADING SCREEN.", a);
    x.globalAlpha = a;
    loading.rep.draw(span(t, s.start + 0.2, s.end - 0.4, (q) => q));
    drawPlate(x, loading, 260, 560, 1, true, true);
    inks.forEach((c, i) => {
      const k = span(t, s.voice + 4.0 + i * 0.12, s.voice + 4.3 + i * 0.12);
      x.save();
      x.globalAlpha = a * k;
      x.fillStyle = c;
      x.strokeStyle = PAPER;
      x.lineWidth = 5;
      x.beginPath();
      x.arc(190 + i * 140, 1500, 44 * (0.6 + 0.4 * k), 0, Math.PI * 2);
      x.fill();
      x.stroke();
      x.restore();
    });
    note(x, "The example is a Tilo sample drawn by Claude, an AI.", 1620, a);
    x.globalAlpha = 1;
  }

  // the AI-made samples, replaying
  if (on(S.ai)) {
    const s = S.ai, a = life_(s), mid = s.voice + lengths.ai * 0.55;
    title(x, "In the gallery", "DRAWN BY AN AI.", "BEAT THEM BY HAND.", a);
    const k = span(t, mid - 0.25, mid + 0.25, inOut);
    x.globalAlpha = a * (1 - k);
    if (k < 1) {
      strip.rep.draw(span(t, s.start, mid, (q) => q));
      drawPlate(x, strip, 70, 590);
      trace(x, 70, 1330, 940, span(t, s.start, mid, (q) => q));
    }
    x.globalAlpha = a * k;
    if (k > 0) {
      motel.rep.draw(span(t, mid, s.end - 0.3, (q) => q));
      drawPlate(x, motel, 70, 590);
      trace(x, 70, 1330, 940, span(t, mid, s.end - 0.3, (q) => q));
    }
    x.globalAlpha = 1;
    note(x, "Drawn in code by Claude, an AI, and marked AI-MADE on the site.", 1420, a);
  }

  // how: the bar at the top, then the section it leads to
  if (on(S.how)) {
    const s = S.how, a = life_(s);
    title(x, "tiloart.com", "PRESS THE BAR.", "DRAW ALONG.", a);
    x.globalAlpha = a;
    const down = span(t, s.voice + 2.2, s.voice + 3.4, inOut);
    phone(x, "rel-home", 540, PHONE_Y, 0.015, down * 1420, (o) => {
      ring(o, el("rel-home", "Release week"), span(t, s.voice + 0.6, s.voice + 1.0) * (1 - down));
      tap(o, el("rel-home", "Release week"), span(t, s.voice + 1.4, s.voice + 2.1, (q) => q));
    });
    x.globalAlpha = 1;
  }

  // the end card
  if (t >= S.cta.start) {
    const s = S.cta, a = span(t, s.start, s.start + 0.3);
    x.globalAlpha = a;
    logoAt(x, PAPER, 540, 330, 400);
    const k = span(t, s.start + 0.3, s.start + 0.8);
    x.save();
    x.globalAlpha = a * k;
    x.translate(0, (1 - k) * 40);
    shade(x);
    headline(x, "RELEASE WEEK,", 540, 660, 140, PAPER, "center", 940);
    headline(x, "ON TILO.", 540, 800, 140, PINKS, "center", 940);
    x.restore();
    const say = s.voice + lengths.cta - 1.4;
    const pulse = 1 + 0.07 * (1 - span(t, say, say + 0.45));
    x.globalAlpha = a * span(t, say - 0.2, say);
    x.save();
    x.translate(540, 1010);
    x.scale(pulse, pulse);
    shade(x);
    headline(x, "TILOART.COM", 0, 0, 140, YELLOW, "center", 980);
    x.restore();
    x.globalAlpha = a * span(t, s.voice + 0.6, s.voice + 1.0);
    serif(x, "Free. The wall is up until 20 November.", 540, 1110, 44, 880, PAPER, true, "center");
    x.globalAlpha = a * span(t, say, say + 0.5);
    serif(x, "Tilo has nothing to do with Rockstar Games or GTA VI, and nothing here comes from the game.", 540, 1600, 26, 860, "rgba(251,250,245,0.85)", true, "center");
    serif(x, "Voice: synthesized with Kokoro. Music: “In This Moment” by Scott Buckley, CC BY 4.0.", 540, 1680, 26, 900, "rgba(251,250,245,0.85)", true, "center");
    x.globalAlpha = 1;
  }

  subtitle(x, t);
}

/** the Reel cover */
function cover() {
  const c = createCanvas(W, H), x = c.getContext("2d");
  ground(x, 0);
  logoAt(x, PAPER, 540, 380, 400);
  kicker(x, "Tilo · 15 to 20 November", 80, 700, YELLOW, "left", 36);
  x.save();
  shade(x);
  headline(x, "RELEASE", 80, 940, 250, PAPER);
  headline(x, "WEEK.", 80, 1155, 250, PINKS);
  x.restore();
  serif(x, "A sunset wall, a new subject, and AI-made samples to beat by hand.", 80, 1300, 50, 900, PAPER, true);
  return c;
}

await run("release", frame, cover);
