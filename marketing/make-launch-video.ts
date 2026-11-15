/* Tilo is open: the launch, and how to join now that anyone can, in under a minute, with a voice.
   9:16, 1080 x 1920, 30 fps; the parts every guide video shares are in guide.ts (the voice,
   the subtitles, the phones, the mix). The end card says the voice is synthesized, and credits
   the music. The phones hold the real site: the sign-up screens from a local server with sign-up
   open, so nothing was sent to the real one (node marketing/shoot.mjs launch1 / launch2, see
   there), the email as Auth sends it (marketing/invite-mail.ts), the rest the tour's shots of
   tiloart.com (shoot.mjs tour). Pieces marked AI-MADE are Tilo's samples, and the video says so.
   The Google button shows once Google sign-in is on (server/ops/set-secrets.sh); the
   shots were taken with it on locally.
   Usage, from the repository root: npm run video:launch [-- frames DIR] */

import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { BLUE, ground, H, headline, highlighter, inOut, INK, kicker, life, logoAt, logoCanvas, logoRep, measureHead, PAPER, PINK, serif, SOFT, span, W } from "./kit";
import { guide, type Scene } from "./guide";

const { S, lengths, el, field, phone, tap, ring, swap, title, subtitle, replay, replayCanvas, plateBox, PHONE_Y, run } = await guide({
  voice: "launch",
  boxes: ["launch1", "launch2", "tour"],
  shots: ["open-join", "open-signin", "open-sent", "signin-mail", "open-handle", "tour-studio", "tour-pixel", "tour-piece", "tour-gallery", "tour-home"],
});

const lin = (p: number) => p;
const note = (x: SKRSContext2D, text: string, a: number) => {
  x.globalAlpha = a;
  serif(x, text, 90, 500, 30, 900, SOFT, true);
  x.globalAlpha = 1;
};

function frame(x: SKRSContext2D, t: number) {
  ground(x);
  const life_ = (s: Scene) => life(t, s.start, s.end, 0.3);
  const on = (s: Scene) => t >= s.start && t < s.end;

  // the news
  if (on(S.hook)) {
    const s = S.hook, a = life(t, -1, s.end, 0.3), size = 230;
    x.globalAlpha = a * span(t, 0.0, 0.3);
    kicker(x, "Free, for everyone", 84, 690, PINK, "left", 36);
    const k1 = span(t, 0.2, 0.6);
    x.save();
    x.globalAlpha = a * k1;
    x.translate(0, (1 - k1) * 40);
    headline(x, "TILO", 80, 900, size, INK);
    headline(x, "IS", 80, 1110, size, INK);
    x.restore();
    const k2 = span(t, 0.6, 1.0);
    if (k2 > 0) {
      const hw = measureHead(x, "OPEN.", size);
      x.globalAlpha = a;
      highlighter(x, 80 + size * 0.02, 80 + hw * 0.98, 1320 - size * 0.34, size * 0.74, span(t, 1.0, 1.6));
      x.save();
      x.globalAlpha = a * k2;
      x.translate(0, (1 - k2) * 40);
      headline(x, "OPEN.", 80, 1320, size, PINK);
      x.restore();
    }
    x.globalAlpha = a * span(t, 1.4, 1.8);
    serif(x, "No invite. No waiting list. Join, draw, publish.", 84, 1450, 46, 900, SOFT, true);
    x.globalAlpha = 1;
  }

  // what Tilo is: the gallery, every piece with its recording
  if (on(S.what)) {
    const s = S.what, a = life_(s);
    title(x, "What it is", "A STUDIO AND", "A GALLERY.", a);
    note(x, "Pieces marked AI-MADE are Tilo's samples, drawn by an AI.", a);
    x.globalAlpha = a;
    phone(x, "tour-gallery", 540, PHONE_Y + (1 - span(t, s.start, s.start + 0.6)) * 400, -0.015, 300 + span(t, s.start, s.end, inOut) * 900);
    x.globalAlpha = 1;
  }

  // 01: /join: Google in one tap, or the email
  if (on(S.join)) {
    const s = S.join, a = life_(s);
    title(x, "01 · tiloart.com/join", "GOOGLE, OR", "YOUR EMAIL.", a);
    const k = span(t, s.voice + 4.9, s.voice + 5.3, inOut);
    swap(x, a, k,
      () => phone(x, "open-join", 540, PHONE_Y, -0.02, 0, (o) => {
        ring(o, el("open-join", "Continue with Google"), span(t, s.voice + 2.3, s.voice + 2.6) * (1 - span(t, s.voice + 4.0, s.voice + 4.2)));
        tap(o, el("open-join", "Join with your email"), span(t, s.voice + 4.2, s.voice + 4.9, lin));
      }),
      () => phone(x, "open-signin", 540, PHONE_Y, -0.02, 0, (o) => {
        ring(o, field("open-signin", "Email"), span(t, s.voice + 5.3, s.voice + 5.6));
        tap(o, el("open-signin", "Email me a link"), span(t, s.voice + 6.0, s.end, lin));
      }),
    );
  }

  // 02: the link arrives; press it
  if (on(S.mail)) {
    const s = S.mail, a = life_(s);
    title(x, "02 · With email", "PRESS THE", "LINK.", a);
    const k = span(t, s.voice + 0.9, s.voice + 1.3, inOut);
    swap(x, a, k,
      () => phone(x, "open-sent", 540, PHONE_Y, 0.015),
      () => phone(x, "signin-mail", 540, PHONE_Y, 0.015, 0, (o) => {
        ring(o, el("signin-mail", "Confirm and sign in"), span(t, s.voice + 1.6, s.voice + 1.9) * (1 - span(t, s.voice + 2.8, s.voice + 3.0)));
        tap(o, el("signin-mail", "Confirm and sign in"), span(t, s.voice + 2.9, s.voice + 3.6, lin));
      }),
    );
  }

  // 03: a handle, and you're in
  if (on(S.handle)) {
    const s = S.handle, a = life_(s);
    title(x, "03", "PICK YOUR", "HANDLE.", a);
    x.globalAlpha = a;
    phone(x, "open-handle", 540, PHONE_Y, -0.015, 0, (o) => {
      ring(o, field("open-handle", "Handle"), span(t, s.voice + 0.1, s.voice + 0.4) * (1 - span(t, s.voice + 1.2, s.voice + 1.4)));
      tap(o, el("open-handle", "Join Tilo"), span(t, s.voice + 1.6, s.voice + 2.3, lin));
    });
    x.globalAlpha = 1;
  }

  // 04: the studio; then pixels
  if (on(S.draw)) {
    const s = S.draw, a = life_(s);
    title(x, "04", "OPEN THE STUDIO.", "DRAW.", a);
    const tools = ["Pencil", "Ink pen", "Brush pen", "Charcoal", "Marker", "Watercolour"];
    const k = span(t, s.voice + 2.3, s.voice + 2.7, inOut);
    swap(x, a, k,
      () => phone(x, "tour-studio", 540, PHONE_Y, 0.015, 0, (o) => {
        const i = Math.floor(Math.min(Math.max((t - s.voice - 0.3) / 0.3, 0), tools.length - 1));
        ring(o, el("tour-studio", tools[i]), span(t, s.voice + 0.3, s.voice + 0.5));
        o.save();
        o.globalAlpha *= span(t, s.voice + 0.5, s.voice + 1.0);
        serif(o, "Your first stroke goes here.", 195, 462, 18, 330, SOFT, true, "center");
        o.restore();
      }),
      () => phone(x, "tour-pixel", 540, PHONE_Y, 0.015, 0, (o) => {
        o.save();
        o.globalAlpha *= span(t, s.voice + 2.7, s.voice + 3.1);
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

  // 05: a piece with its recording, replaying
  if (on(S.publish)) {
    const s = S.publish, a = life_(s);
    title(x, "05", "PUBLISH IT.", "PRESS PLAY.", a);
    note(x, "The piece shown is a Tilo sample drawn by Claude, an AI, and labelled so on the site.", a);
    x.globalAlpha = a;
    phone(x, "tour-piece", 540, PHONE_Y, -0.015, 40, (o) => {
      if (t > s.voice + 0.9) {
        replay.draw(span(t, s.voice + 1.0, s.end - 0.2, lin));
        const [bx, by, bw, bh] = plateBox;
        o.fillStyle = PAPER;
        o.fillRect(bx, by, bw, bh);
        o.drawImage(replayCanvas, bx, by, bw, bh);
      }
      tap(o, el("tour-piece", "Play replay"), span(t, s.voice + 0.4, s.voice + 1.1, lin));
    });
    x.globalAlpha = 1;
  }

  // 06: the shared wall
  if (on(S.social)) {
    const s = S.social, a = life_(s);
    title(x, "06", "STAMP. FOLLOW.", "DRAW TOGETHER.", a);
    x.globalAlpha = a;
    phone(x, "tour-home", 540, PHONE_Y, 0.015, 1080 + span(t, s.start, s.end, inOut) * 300);
    x.globalAlpha = 1;
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
    headline(x, "FREE, FOR GOOD.", 540, 660, 130, INK, "center", 940);
    headline(x, "JOIN TODAY.", 540, 790, 130, PINK, "center", 940);
    x.restore();
    x.globalAlpha = a * span(t, s.voice + 1.0, s.voice + 1.5);
    serif(x, "Drawing needs no account. Joining takes a minute.", 540, 900, 44, 880, INK, true, "center");
    // the address arrives with the voice saying it
    const say = s.voice + lengths.cta - 2.0;
    const pulse = 1 + 0.07 * (1 - span(t, say, say + 0.45));
    x.globalAlpha = a * span(t, say - 0.2, say);
    x.save();
    x.translate(540, 1170);
    x.scale(pulse, pulse);
    headline(x, "TILOART.COM/JOIN", 0, 0, 124, BLUE, "center", 980);
    x.restore();
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
  kicker(x, "Free, for everyone", 80, 730, PINK, "left", 36);
  headline(x, "TILO", 80, 940, 230, INK);
  headline(x, "IS", 80, 1150, 230, INK);
  const hw = measureHead(x, "OPEN.", 230);
  highlighter(x, 84, 80 + hw * 0.98, 1360 - 78, 170, 1);
  headline(x, "OPEN.", 80, 1360, 230, PINK);
  serif(x, "No invite. No waiting list. Join at tiloart.com/join.", 80, 1490, 48, 900, SOFT, true);
  return c;
}

await run("launch", frame, cover);
