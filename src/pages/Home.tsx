import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Annotate, type Measure } from "../components/Annotate";
import { Icon } from "../components/Icon";
import { PinCard } from "../components/PinCard";
import { ReplayCanvas } from "../components/ReplayCanvas";
import { Wall } from "../components/Wall";
import { DISCIPLINES } from "../data/disciplines";
import { allPieces, stampTotal, useLocal } from "../data/local";
import { PROMPT, SAMPLES } from "../data/samples";
import { Sketch } from "../engine/sketch";
import { fmtMin, type Piece } from "../engine/stroke";

/* Pen marks over the hero: a loop around "here", and an arrow down to the wall. */
function heroMarks(w: number, h: number, measure: Measure, ink: string) {
  const S = new Sketch(9);
  const word = measure(".hl-mark");
  if (word) {
    const rx = word.width * 0.55 + 6, ry = word.height * 0.5;
    S.circle(word.x + word.width * 0.53, word.y + word.height * 0.56, rx, "ink", ink, 2.6, 1.4, 1.12, ry / rx);
  }
  const ctas = measure(".hero-ctas");
  if (ctas && w > 860) {
    const x0 = ctas.x + ctas.width + 28, y0 = ctas.y + 8;
    S.poly([[x0, y0], [x0 + 34, y0 + 40], [x0 + 30, h - 14]], "ink", ink, 2.2, 0.6, 6);
    S.poly([[x0 + 18, h - 34], [x0 + 30, h - 10], [x0 + 44, h - 32]], "ink", ink, 2.2, 0.3, 4);
  }
  return S.strokes;
}

function FeedCard({ piece }: { piece: Piece }) {
  const bar = useRef<HTMLSpanElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  return (
    <Link to={`/piece/${piece.id}`} viewTransition className="feed-card sheet settle" style={{ ["--settle-r" as string]: `${(piece.tilt ?? 0) * 0.8}deg` }}>
      <ReplayCanvas
        strokes={piece.strokes}
        mode="loop"
        label={`${piece.title} being drawn, stroke by stroke`}
        onProgress={(pos, idx) => {
          if (bar.current) bar.current.style.transform = `scaleX(${pos})`;
          if (counter.current) counter.current.textContent = `STROKE ${idx + 1} / ${piece.strokes.length}`;
        }}
      />
      <span className="feed-time"><span ref={bar} /></span>
      <span className="feed-meta">
        <span className="pin-title">{piece.title}</span>
        <span className="mono feed-count" ref={counter}>{piece.strokes.length} STROKES</span>
      </span>
      <span className="pin-by">@{piece.by} · {fmtMin(piece.minutes)} min</span>
    </Link>
  );
}

function useCountdown() {
  const [s, setS] = useState("--:--:--");
  useEffect(() => {
    const tick = () => {
      const now = new Date(), end = new Date(now);
      end.setUTCHours(24, 0, 0, 0);
      const sec = Math.floor((+end - +now) / 1000);
      setS([sec / 3600, (sec % 3600) / 60, sec % 60].map((n) => String(Math.floor(n)).padStart(2, "0")).join(":"));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return s;
}

const isLight = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  return (n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150;
};

export function Home() {
  const local = useLocal();
  const countdown = useCountdown();
  const promptEntries = allPieces(local).filter((p) => p.prompt === PROMPT.no).slice(0, 4);
  const top = [...SAMPLES].sort((a, b) => stampTotal(b, local) - stampTotal(a, local)).slice(0, 4);
  const feed = ["window", "kazbegi", "oneline", "pomegranate", "tram", "waves"].map((id) => SAMPLES.find((p) => p.id === id)!);

  return (
    <main>
      <section className="hero wrap" aria-labelledby="hero-h">
        <Annotate build={heroMarks} />
        <h1 id="hero-h">
          Make it here.
          <br />
          Hang it <span className="hl-mark">here.</span>
        </h1>
        <div className="hero-side">
          <p>Tilo is a free studio in your browser for art made by hand. Every piece keeps its full recording, so anyone can watch how it was made, stroke by stroke.</p>
          <div className="hero-ctas">
            <Link to="/studio" viewTransition className="btn btn-ink"><Icon name="pencil" />Start a blank sheet</Link>
            <a href="#today" className="btn btn-mat">Today's prompt</a>
          </div>
        </div>
      </section>

      <div className="wrap"><Wall /></div>

      <section className="sec wrap" aria-labelledby="feed-h">
        <div className="sec-head">
          <span className="label">Process feed</span>
          <h2 id="feed-h">Watch the work happen</h2>
          <p className="aside">Pieces on Tilo are stored as recordings, so the feed plays how they were made instead of only the result. These are sample pieces.</p>
        </div>
        <div className="feed" tabIndex={0} aria-label="Pieces being replayed">
          {feed.map((p) => <FeedCard key={p.id} piece={p} />)}
        </div>
      </section>

      <section className="sec wrap" id="workbenches" aria-labelledby="bench-h">
        <div className="sec-head">
          <span className="label">Workbenches</span>
          <h2 id="bench-h">One mat, many materials</h2>
          <p className="aside">Each discipline gets its own surface to work on. Painting is open now; the others arrive stage by stage. Hover one to see it drawn.</p>
        </div>
        <div className="benches">
          {DISCIPLINES.map((d, i) => {
            const body = (
              <>
                <span className="bench-surface">
                  <ReplayCanvas strokes={d.demo} paper={null} mode="hover" label={`Example of ${d.name.toLowerCase()}`} />
                </span>
                <span className="bench-label">
                  <span className="bench-name">{d.name}</span>
                  <span className={`bench-stage mono${d.stage === 0 ? " is-open" : ""}`}>{d.stage === 0 ? "OPEN NOW" : `STAGE ${d.stage}`}</span>
                </span>
                <span className="bench-blurb">{d.blurb}</span>
              </>
            );
            const style = { ["--settle-r" as string]: `${((i * 53) % 5) - 2}deg` };
            return d.stage === 0 ? (
              <Link key={d.id} to="/studio" viewTransition data-replay-host className={`bench sheet settle ${d.material}`} style={style}>{body}</Link>
            ) : (
              <div key={d.id} data-replay-host tabIndex={0} className={`bench sheet settle ${d.material}`} style={style}>{body}</div>
            );
          })}
        </div>
      </section>

      <section className="sec wrap" id="today" aria-labelledby="today-h">
        <div className="sec-head">
          <span className="label">Daily prompt</span>
          <h2 id="today-h">Same rules for everyone, for one day</h2>
          <p className="aside">A prompt sets a subject, a palette and a time limit. Other people stamp the entries, and the most stamped go to the front of the gallery.</p>
        </div>
        <div className="prompt-grid">
          <article className="sheet tape prompt-card settle" style={{ ["--tr" as string]: "-3deg" }}>
            <div className="mono prompt-no">PROMPT #{PROMPT.no} · CLOSES IN {countdown}</div>
            <h3>{PROMPT.title}</h3>
            <ul className="rules">
              <li><b>{PROMPT.palette.length}</b><span>colours, fixed</span></li>
              <li><b>{PROMPT.minutes}:00</b><span>minutes on the clock</span></li>
              <li><b>1</b><span>sheet, no uploads</span></li>
            </ul>
            <div className="paint" aria-label="The colours for this prompt">
              {PROMPT.palette.map((c, i) => (
                <div key={c} style={{ ["--c" as string]: c, ["--fg" as string]: isLight(c) ? "#1B1E1D" : "#FFFFFF" }}><span>{PROMPT.names[i]}</span></div>
              ))}
            </div>
            <div className="prompt-foot">
              <Link to="/studio?prompt=312" viewTransition className="btn btn-ink"><Icon name="pencil" />Start the 10-minute sheet</Link>
              <span className="mono">{PROMPT.entries} ENTRIES SO FAR (EXAMPLE)</span>
            </div>
          </article>
          <div className="entries">
            <p className="entries-note"><span className="hand">Entries so far</span><span className="mono">SAMPLE PIECES · HOVER TO REPLAY</span></p>
            {promptEntries.map((p, i) => <PinCard key={p.id} piece={p} index={i + 3} />)}
          </div>
        </div>
      </section>

      <section className="sec wrap" aria-labelledby="pin-h">
        <div className="sec-head">
          <span className="label">Gallery</span>
          <h2 id="pin-h">Most stamped this week</h2>
          <Link to="/gallery" viewTransition className="btn btn-mat sec-link">See the whole pinboard<Icon name="arrow" /></Link>
        </div>
        <div className="board">{top.map((p, i) => <PinCard key={p.id} piece={p} index={i} />)}</div>
      </section>

      <section className="sec wrap proof-sec" aria-labelledby="proof-h">
        <div className="proof-copy">
          <span className="label">Proof of hand</span>
          <h2 id="proof-h">The recording is the signature</h2>
          <p>Uploads can't go into the hand-made gallery. A piece is drawn on Tilo, and its stroke record travels with it. That doesn't make faking impossible, but it makes faking more work than drawing.</p>
          <ol className="badges">
            <li><b>Recorded on Tilo</b><span>Every stroke is saved in order, with timing and pressure.</span></li>
            <li><b>Drawn live</b><span>Made while others watched, in a live room or on the wall.</span></li>
            <li><b>Verified artist</b><span>A person whose body of work and process have been reviewed.</span></li>
          </ol>
        </div>
        <figure className="proof-sheet sheet tape settle" style={{ ["--tr" as string]: "3deg" }}>
          <ReplayCanvas strokes={SAMPLES[2].strokes} mode="loop" label="Sololaki balcony replaying" />
          <figcaption className="mono"><Icon name="proof" size={16} /> RECORDED ON TILO · {SAMPLES[2].strokes.length} STROKES · {fmtMin(SAMPLES[2].minutes)} MIN</figcaption>
        </figure>
      </section>
    </main>
  );
}
