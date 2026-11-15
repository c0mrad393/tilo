/* How to join: from the waiting list to a first piece, in about a minute, with a voice.
   9:16, 1080 x 1920, 30 fps; the parts every guide video shares are in guide.ts (the voice,
   the subtitles, the phones, the mix). The end card says the voice is synthesized, and credits
   the music. The phones hold the real site. The sign-up screens come from a local server, so
   nothing was sent to the real one (node marketing/shoot.mjs join1 / join2, see there); the
   invite code on them is made up. The others are the tour's shots of tiloart.com (shoot.mjs tour).
   Usage, from the repository root: npm run video:join [-- frames DIR] */

import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { BLUE, clamp, ground, H, headline, highlighter, inOut, INK, kicker, life, logoAt, logoCanvas, logoRep, measureHead, PAPER, PINK, serif, SOFT, span, W } from "./kit";
import { guide, type Scene } from "./guide";

const { S, lengths, el, field, phone, tap, ring, swap, title, subtitle, replay, replayCanvas, plateBox, PHONE_Y, run } = await guide({
  voice: "join",
  boxes: ["join1", "join2", "tour"],
  shots: ["join-form", "join-done", "invite-mail", "signin-form", "signin-sent", "handle-form", "tour-studio", "tour-pixel", "tour-piece", "tour-gallery", "tour-home"],
  sayToRead: [[/Press, Join Tilo/, "Press “Join Tilo”"]],
});

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

await run("join", frame, cover);
