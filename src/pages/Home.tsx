import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Annotate, type Measure } from "../components/Annotate";
import { Icon } from "../components/Icon";
import { AiMark, PinCard, PixelMark } from "../components/PinCard";
import { ReplayCanvas } from "../components/ReplayCanvas";
import { Trace } from "../components/Trace";
import { Wall } from "../components/Wall";
import { DISCIPLINES } from "../data/disciplines";
import { allPieces, useLocal } from "../data/local";
import { FIRST_SUBJECT, PROMPT } from "../data/prompt";
import { EventSection } from "../components/EventBits";
import { samples } from "../data/samples";
import { Sketch } from "../engine/sketch";
import { drawnCount, isPixelShape, toolsUsed, type Piece } from "../engine/stroke";

const HIGHLIGHTER = "#FFD23F";

/* A highlighter pass behind "hands", drawn on load by the same engine as everything else. */
function heroMarks(_w: number, _h: number, measure: Measure) {
  const S = new Sketch(5);
  const word = measure(".hl");
  if (word) {
    // an opaque ink pass so the word stays readable on it in both themes
    const y = word.y + word.height * 0.52, x0 = word.x + word.height * 0.05, x1 = word.x + word.width * 0.95;
    const w = word.height * 1.02; // ink lays down about 0.8 of w at mid pressure
    S.poly([[x0, y + w * 0.1], [x0 + (x1 - x0) * 0.5, y - w * 0.06], [x1, y + w * 0.04]], "ink", HIGHLIGHTER, w, 0.8, 18);
  }
  return S.strokes;
}

/* A piece replaying in a loop, with its trace moving underneath. */
function LivePlate({ piece, no, className = "", children }: { piece: Piece; no: number; className?: string; children?: React.ReactNode }) {
  const trace = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  return (
    <Link to={`/piece/${piece.id}`} viewTransition className={`card lift press ${className}`} style={{ ["--press-delay" as string]: `${(no % 4) * 90}ms` }}>
      <span className="plate">
        <ReplayCanvas
          strokes={piece.strokes}
          layers={piece.layers}
          paper={piece.paper}
          shape={piece.shape}
          aspect={4 / 3}
          mode="loop"
          label={`${piece.title} being drawn, stroke by stroke${piece.ai ? ", by an AI" : ""}`}
          onProgress={(pos, idx) => {
            trace.current?.style.setProperty("--pos", String(pos));
            if (counter.current) counter.current.textContent = `stroke ${idx + 1} of ${piece.strokes.length}`;
          }}
        />
        {piece.ai && <AiMark />}
        <PixelMark shape={piece.shape} />
      </span>
      <Trace strokes={piece.strokes} ref={trace} />
      <span className="card-cap">
        <span className="card-no kicker">Plate {String(no).padStart(2, "0")}</span>
        <span className="card-title">{piece.title}</span>
        <span className="card-by serif">@{piece.by}{piece.ai ? " · drawn by AI" : ""} · <span ref={counter}>{drawnCount(piece.strokes)} strokes</span></span>
        {children}
      </span>
    </Link>
  );
}

/** the time left on the subject up now: "2d 14:03:22", then "Closing now" */
function useCountdown() {
  const [s, setS] = useState("--:--:--");
  useEffect(() => {
    const tick = () => {
      const sec = Math.floor((PROMPT.ends - Date.now()) / 1000);
      if (sec <= 0) return setS("Closing now");
      const days = Math.floor(sec / 86400);
      const clock = [(sec % 86400) / 3600, (sec % 3600) / 60, sec % 60].map((n) => String(Math.floor(n)).padStart(2, "0")).join(":");
      setS(days ? `${days}d ${clock}` : clock);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return s;
}

/* The benches index: one row per discipline. On a pointer device the hovered row's demo
   follows the cursor; on touch it sits at the end of the row. */
function Benches() {
  const list = useRef<HTMLOListElement>(null);
  const follow = (e: React.PointerEvent) => {
    const r = list.current!.getBoundingClientRect();
    list.current!.style.setProperty("--mx", `${e.clientX - r.left}px`);
    list.current!.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <ol className="index" ref={list} onPointerMove={follow}>
      {DISCIPLINES.map((d, i) => {
        const open = !!d.to;
        return (
          <li key={d.id} data-replay-host className={`index-row press${open ? " is-open" : ""}`} style={{ ["--press-delay" as string]: `${i * 40}ms` }}>
            <span className="index-no num">{String(i + 1).padStart(2, "0")}</span>
            {open ? (
              <Link to={d.to!} viewTransition className="index-name">{d.name}</Link>
            ) : (
              <span className="index-name">{d.name}</span>
            )}
            <span className="index-blurb serif">{d.blurb}</span>
            <span className="index-stage kicker">{open ? "Open now" : `Stage ${d.stage}`}</span>
            <span className={`index-peek ${d.material}`} aria-hidden="true">
              <ReplayCanvas strokes={d.demo} paper={null} mode="hover" label={`Example of ${d.name.toLowerCase()}`} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Home() {
  const local = useLocal();
  const countdown = useCountdown();
  const entries = allPieces(local).filter((p) => p.prompt === PROMPT.no).slice(0, 4);
  const sample = (id: string) => samples().find((p) => p.id === id)!;
  const feed = ["gergeti", "oldtown", "blacksea", "raintram", "harvest"].map(sample);
  const hero = sample("nightlamp");
  const proof = sample("rkatsiteli");
  const pixels = ["narikala", "khinkali", "batumisun", "brotseuli"].map(sample);
  const paintings = samples().filter((p) => !isPixelShape(p.shape));

  return (
    <main id="main" tabIndex={-1}>
      <section className="hero wrap" aria-labelledby="hero-h">
        <Annotate build={heroMarks} delay={700} ms={900} />
        <h1 id="hero-h" className="hero-h">
          <span className="ink-blue">Drawn by <span className="hl">hands,</span></span>
          <span className="ink-pink">not prompts.</span>
        </h1>
        <div className="hero-foot">
          <div className="hero-copy">
            <p className="lede serif">Tilo is a free studio and gallery for art made stroke by stroke, in the browser. Every piece keeps its recording, so anyone can watch exactly how a person made it.</p>
            <div className="hero-ctas">
              <Link to="/studio" viewTransition className="btn btn-ink"><Icon name="pencil" />Start a blank sheet</Link>
              <a href="#today" className="btn btn-line">Today's subject</a>
            </div>
            <Link to="/studio?new&kind=pixel" viewTransition className="hero-new">
              <span className="hero-new-tag kicker">New</span>
              <span className="serif">Pixel art is open: a grid, a small palette, every cell on purpose.</span>
              <Icon name="arrow" size={18} />
            </Link>
            <dl className="hero-facts">
              <div><dt className="num">0</dt><dd>uploads in the hand-made gallery</dd></div>
              <div><dt className="num">{hero.strokes.length}</dt><dd>strokes in Plate 01, drawn by an AI for you to beat</dd></div>
              <div><dt>Free</dt><dd>to draw, show and stamp</dd></div>
            </dl>
          </div>
          <LivePlate piece={hero} no={1} className="hero-plate">
            <span className="card-note serif">A sample Claude, an AI, drew in code · {toolsUsed(hero.strokes).join(", ")} · playing from its recording</span>
          </LivePlate>
        </div>
      </section>

      <EventSection />

      <section className="sec wrap" id="wall" aria-labelledby="wall-h">
        <header className="sec-head">
          <h2 id="wall-h">The wall</h2>
          <p className="serif">
            One sheet for everyone, with a new subject every three days: an outline with room left on purpose. Members pick a pen and add to it; anyone can
            look around with the hand. When its time is up it goes into the <Link to="/wall/past">archive of past walls</Link>.
          </p>
        </header>
        <Wall />
      </section>

      <section className="sec wrap" aria-labelledby="feed-h">
        <header className="sec-head">
          <h2 id="feed-h">On the press</h2>
          <p className="serif">Pieces are stored as recordings, so this row plays how they were made, not only how they ended. The strip under each one is its trace: every stroke in order, with its pressure. For now these are the AI samples; the press fills with yours.</p>
        </header>
        <div className="feed" tabIndex={0} role="region" aria-label="Pieces being replayed">
          {feed.map((p, i) => <LivePlate key={p.id} piece={p} no={i + 2} className="feed-card" />)}
        </div>
      </section>

      <section className="sec wrap" id="pixel" aria-labelledby="pixel-h">
        <header className="sec-head">
          <h2 id="pixel-h">Pixel art</h2>
          <p className="serif">
            The newest bench: a sheet 16 to 128 cells across, a small palette, and a pen that puts down one cell at a time. Pixel pieces keep their
            recording like any other, so they replay cell by cell. These four were drawn in code by Claude, an AI, to show what the grid can do; the hands
            are meant to win here too.
          </p>
        </header>
        <div className="pixel-row">{pixels.map((p, i) => <LivePlate key={p.id} piece={p} no={i + 16} className="pixel-card" />)}</div>
        <div className="hero-ctas pixel-ctas">
          <Link to="/studio?new&kind=pixel" viewTransition className="btn btn-ink"><Icon name="pixel" />Start a pixel sheet</Link>
          <Link to="/gallery?sort=pixel" viewTransition className="btn btn-line">Pixel art in the gallery<Icon name="arrow" /></Link>
        </div>
      </section>

      <section className="sec wrap" id="benches" aria-labelledby="bench-h">
        <header className="sec-head">
          <h2 id="bench-h">Benches</h2>
          <p className="serif">One studio, many surfaces. Each discipline gets the material it is made on. Painting and pixel art are open now; the rest arrive stage by stage. Point at one to see it drawn.</p>
        </header>
        <Benches />
      </section>

      <section className="sec wrap" id="today" aria-labelledby="today-h">
        <header className="sec-head">
          <h2 id="today-h">The subject</h2>
          <p className="serif">Same rules for everyone, for three days: a subject, six inks and ten minutes. A new one goes up every third midnight, Tbilisi time. People stamp the entries, and the most stamped go to the front of the gallery.</p>
        </header>
        <div className="subject">
          <article className={`poster press${PROMPT.event ? " poster-sunset" : ""}`} aria-labelledby="poster-h">
            <span className="poster-moon" aria-hidden="true" />
            <p className="poster-top kicker"><span>Subject No. {PROMPT.no}</span><span>Closes in <b className="num">{countdown}</b></span></p>
            <h3 id="poster-h" className="poster-title">{PROMPT.title}</h3>
            <ul className="poster-rules">
              <li><b className="num">{PROMPT.palette.length}</b>inks, fixed</li>
              <li><b className="num">{PROMPT.minutes}:00</b>on the clock</li>
              <li><b className="num">1</b>sheet, no uploads</li>
            </ul>
            <ul className="poster-inks" aria-label="The inks for this subject">
              {PROMPT.palette.map((c, i) => (
                <li key={c}><i style={{ ["--c" as string]: c }} />{PROMPT.names[i]}</li>
              ))}
            </ul>
            <div className="poster-foot">
              <Link to={`/studio?prompt=${PROMPT.no}`} viewTransition className="btn btn-poster"><Icon name="pencil" />Start the 10-minute sheet</Link>
              <span className="serif">{PROMPT.no === FIRST_SUBJECT.no ? "The first two entries are AI samples. Yours goes next to them." : entries.length ? "Yours goes next to them." : "No entries yet. Yours can be the first."}</span>
            </div>
          </article>
          <div className="subject-entries">
            <p className="kicker">Entries so far · point at one to replay it</p>
            <div className="entries">{entries.map((p, i) => <PinCard key={p.id} piece={p} index={i} />)}</div>
          </div>
        </div>
      </section>

      <section className="sec wrap" id="beat" aria-labelledby="beat-h">
        <header className="sec-head">
          <h2 id="beat-h">The bar to beat</h2>
          <p className="serif">
            Tilo opened with eight pieces drawn by Claude, an AI, in code. Every line in them is a real stroke with a real tool, so they replay and
            remix like anything else. They're here to show what the tools can do, and to be beaten.
          </p>
        </header>
        <div className="beat">
          <div className="beat-copy">
            <p className="lede serif">A program can lay down a thousand tidy strokes. It can't hesitate, change its mind halfway or draw the street it grew up on. You can.</p>
            <p className="serif">Draw something better with your own hands and it hangs here, beside them and then in front of them. Or open one, press Remix, and redo it your way: the credit goes back to the sample, and the hand that improved it is yours.</p>
            <div className="hero-ctas">
              <Link to="/studio" viewTransition className="btn btn-ink"><Icon name="pencil" />Draw your own</Link>
              <Link to="/gallery" viewTransition className="btn btn-line">The whole gallery<Icon name="arrow" /></Link>
            </div>
          </div>
          <div className="salon is-even">{paintings.map((p, i) => <PinCard key={p.id} piece={p} index={i} no={i + 7} />)}</div>
        </div>
      </section>

      <section className="sec wrap" aria-labelledby="proof-h">
        <header className="sec-head">
          <h2 id="proof-h">Proof of hand</h2>
          <p className="serif">The recording is the signature. It is what separates a drawing from a picture of one.</p>
        </header>
        <div className="proof">
          <LivePlate piece={proof} no={15} className="proof-plate" />
          <div className="proof-copy">
            <p className="lede serif">Uploads can't go into the hand-made gallery. A piece is drawn on Tilo, and its recording travels with it. That doesn't make faking impossible, but it makes faking more work than drawing.</p>
            <ol className="badges">
              <li><b>Recorded on Tilo</b><span className="serif">Every stroke is saved in order, with its timing and pressure.</span></li>
              <li><b>Drawn live</b><span className="serif">Made while others watched, in a live room or on the wall.</span></li>
              <li><b>Verified artist</b><span className="serif">A person whose body of work and process have been reviewed.</span></li>
            </ol>
            <p className="serif proof-note">The plate beside this was drawn by an AI, and its recording looks like a hand's. That's why a recording alone doesn't earn the badge, and why Tilo's AI samples never carry it.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
