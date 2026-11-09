import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { Picture } from "../components/Picture";
import { DemoBar, StatusChip, Tag, useSchoolApi, Waiting } from "../components/SchoolBits";
import { WorkPlate } from "../components/WorkPlate";
import { AGES, at, dueLabel, isPixelTask, PICTURES, usePupil, type Door, type PupilHome, type SchoolApi, type ShowPage, type Work } from "../data/school";
import { SHAPES } from "../engine/stroke";

const errText = (e: unknown) => (e instanceof Error ? e.message : "That didn't work. Try again.");

/* ---------- /class: a pupil signs in, then sees their tasks and drawings ---------- */

export function ClassPage() {
  const { api, demo } = useSchoolApi();
  const me = usePupil(demo);
  return (
    <>
      {demo && <DemoBar />}
      <div className="kid-page">{!api ? <Waiting /> : me ? <PupilHomePage api={api} demo={demo} /> : <SignIn api={api} demo={demo} />}</div>
    </>
  );
}

function KidMast({ children }: { children?: React.ReactNode }) {
  return (
    <header className="kid-mast">
      <span className="logo" role="img" aria-label="Tilo"><Logo /></span>
      <span className="kicker kid-mast-for">for schools</span>
      <span className="sp" />
      {children}
    </header>
  );
}

function SignIn({ api, demo }: { api: SchoolApi; demo: boolean }) {
  const [q] = useSearchParams();
  const [code, setCode] = useState(q.get("code") ?? "");
  const [door, setDoor] = useState<Door | null>(null);
  const [who, setWho] = useState<Door["pupils"][number] | null>(null);
  const [pics, setPics] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<[string, string, string][]>([]);
  // the demo's pictures for each pupil, to show as a hint
  const [hint, setHint] = useState<Record<string, number[]>>({});
  useEffect(() => {
    if (!demo) return;
    import("../data/school-demo").then((m) => {
      const h = m.demoHints();
      setCodes(h.codes);
      setHint(h.pictures);
    });
  }, [demo]);

  const open = async (c = code) => {
    setBusy(true);
    setError("");
    try {
      setDoor(await api.door(c));
      setCode(c.trim().toUpperCase());
    } catch (e) {
      setError(errText(e));
    }
    setBusy(false);
  };
  const need = door ? AGES[door.cls.ages].pictures : 3;
  const tap = async (i: number) => {
    if (busy || pics.length >= need) return;
    const next = [...pics, i];
    setPics(next);
    setError("");
    if (next.length < need) return;
    setBusy(true);
    try {
      await api.signIn(code, who!.id, next);
    } catch (e) {
      setError(errText(e));
      setPics([]);
    }
    setBusy(false);
  };

  return (
    <>
      <KidMast>{!demo && <Link to="/teach" className="kid-mast-link">I'm a teacher</Link>}</KidMast>
      <main id="main" tabIndex={-1} className="kid-main">
        {!door ? (
          <form className="kid-step" onSubmit={(e) => { e.preventDefault(); open(); }}>
            <h1>Hello! What's your class code?</h1>
            <p className="kid-lede">It's on the card your teacher gave you.</p>
            <input className="kid-code mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label="Class code" placeholder="SUN-1234" maxLength={12} autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus />
            <button className="btn btn-ink kid-go" disabled={busy || code.trim().length < 4}>Next<Icon name="next" /></button>
            {error && <p className="kid-error" role="alert">{error}</p>}
            {demo && codes.length > 0 && (
              <div className="kid-demo-hint">
                <p className="kicker">Demo classes</p>
                {codes.map(([c, name, ages]) => (
                  <button type="button" key={c} className="btn btn-line" onClick={() => open(c)}>
                    {name} <small className="serif">{ages}</small> <span className="mono">{c}</span>
                  </button>
                ))}
              </div>
            )}
          </form>
        ) : !who ? (
          <div className="kid-step">
            <button className="kid-back link-btn" onClick={() => setDoor(null)}><Icon name="back" size={18} />Another code</button>
            <h1>Which one is you?</h1>
            <p className="kid-lede">{door.cls.name} · {door.cls.school}</p>
            <ul className="kid-names">
              {door.pupils.map((p) => (
                <li key={p.id}>
                  <button onClick={() => { setWho(p); setPics([]); setError(""); }}><Tag name={p.name} tag={p.tag} big /></button>
                </li>
              ))}
            </ul>
            {!door.pupils.length && <p className="kid-lede">Your teacher hasn't added anyone yet.</p>}
          </div>
        ) : (
          <div className="kid-step">
            <button className="kid-back link-btn" onClick={() => setWho(null)}><Icon name="back" size={18} />Not {who.name.split(" ")[0]}?</button>
            <h1>Hi {who.name.split(" ")[0]}! Tap your {need} pictures</h1>
            <p className="kid-lede">In the same order as on your card.</p>
            <div className="kid-slots" aria-label={`${pics.length} of ${need} pictures tapped`}>
              {Array.from({ length: need }, (_, k) => (
                <span key={k} className={`kid-slot${pics[k] !== undefined ? " is-full" : ""}`}>{pics[k] !== undefined ? <Picture i={pics[k]} size={44} label={false} /> : k + 1}</span>
              ))}
              {pics.length > 0 && !busy && <button className="icon-btn kid-undo" onClick={() => setPics((p) => p.slice(0, -1))} aria-label="Take the last picture back"><Icon name="undo" /></button>}
            </div>
            <div className="kid-pictures">
              {PICTURES.map((name, i) => (
                <button key={name} onClick={() => tap(i)} disabled={busy} aria-label={name}>
                  <Picture i={i} size={64} label={false} />
                </button>
              ))}
            </div>
            {error && <p className="kid-error" role="alert">{error}</p>}
            {demo && hint[who.id] && (
              <p className="kid-demo-hint">
                <span className="kicker">Demo: {who.name.split(" ")[0]}'s pictures</span>
                {hint[who.id].map((i, k) => <Picture key={k} i={i} size={32} />)}
              </p>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function PupilHomePage({ api, demo }: { api: SchoolApi; demo: boolean }) {
  const nav = useNavigate();
  const [home, setHome] = useState<PupilHome | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => {
    api.pupilHome().then(setHome, (e) => setError(errText(e)));
  }, [api]);
  useEffect(reload, [reload]);
  const start = async (task: string | null, shape?: "land" | "px32") => {
    setBusy(true);
    try {
      const id = await api.startWork(task, shape);
      nav(at(demo, `/class/draw/${id}`), { viewTransition: true });
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  };
  if (error) return <main className="kid-main"><p className="kid-error" role="alert">{error}</p><button className="btn btn-line" onClick={() => api.signOut()}>Sign out</button></main>;
  if (!home) return <Waiting />;
  const mine = (task: string) => home.works.find((w) => w.task === task);
  const open = home.tasks.filter((t) => t.open);
  const own = home.works.filter((w) => !w.task);
  const load = (w: Work) => () => api.strokes(w.id);

  return (
    <>
      <KidMast>
        <Tag name={home.me.name} tag={home.me.tag} />
        <button className="btn btn-quiet" onClick={() => api.signOut()}>Sign out</button>
      </KidMast>
      <main id="main" tabIndex={-1} className="kid-main kid-home">
        <h1>Hi {home.me.name.split(" ")[0]}!</h1>
        <p className="kid-lede">{home.cls.name} · {home.cls.school}</p>

        <section aria-labelledby="todo-h">
          <h2 id="todo-h" className="kid-h">To do</h2>
          {!open.length && <p className="kid-lede">Nothing to do right now. Draw anything you like below!</p>}
          <ul className="kid-tasks">
            {open.map((t) => {
              const w = mine(t.id);
              const done = w && (w.status === "handed" || w.status === "reviewed");
              return (
                <li key={t.id} className={`kid-task sheet${done ? " is-done" : ""}`}>
                  <div className="kid-task-text">
                    <h3>{t.title}</h3>
                    <p>{t.brief}</p>
                    <p className="kid-task-meta">
                      {isPixelTask(t) ? `Pixel art, ${SHAPES[t.shape].name}` : "Drawing"}
                      {t.due ? ` · ${dueLabel(t.due)}` : ""}
                    </p>
                    {w?.status === "back" && w.note && <p className="kid-note"><b>Your teacher says:</b> {w.note}</p>}
                  </div>
                  {w && w.strokes > 0 && <span className="kid-task-pic"><WorkPlate work={w} load={load(w)} label={w.title} /></span>}
                  <div className="kid-task-go">
                    {done ? (
                      <StatusChip work={w!} />
                    ) : (
                      <button className="btn btn-ink kid-go" onClick={() => start(t.id)} disabled={busy}>
                        {w ? (w.status === "back" ? "Work on it" : "Carry on") : "Start"}<Icon name="next" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="free-h">
          <h2 id="free-h" className="kid-h">Draw anything</h2>
          <div className="kid-free">
            <button className="btn btn-line kid-go" onClick={() => start(null, "land")} disabled={busy}><Icon name="brushpen" />A drawing</button>
            <button className="btn btn-line kid-go" onClick={() => start(null, "px32")} disabled={busy}><Icon name="pixel" />Pixel art</button>
          </div>
        </section>

        {home.works.length > 0 && (
          <section aria-labelledby="mine-h">
            <h2 id="mine-h" className="kid-h">Your drawings</h2>
            <ul className="work-grid kid-grid">
              {home.works.map((w) => {
                const editable = w.status === "draft" || w.status === "back";
                const body = (
                  <>
                    <WorkPlate work={w} load={load(w)} label={w.title} mode="hover" />
                    <span className="work-cap"><span className="kid-title">{w.title}</span><StatusChip work={w} /></span>
                    {w.stamps.length > 0 && <span className="kid-stamps">{w.stamps.map((s) => <span key={s} className="kid-stamp">{s}</span>)}</span>}
                    {w.note && w.status === "reviewed" && <span className="kid-note"><b>Your teacher says:</b> {w.note}</span>}
                  </>
                );
                return (
                  <li key={w.id}>
                    {editable ? <button className="work-tile" onClick={() => w.task ? start(w.task) : nav(at(demo, `/class/draw/${w.id}`))}>{body}</button> : <div className="work-tile">{body}</div>}
                  </li>
                );
              })}
            </ul>
            {own.length > 0 && <p className="kid-lede">Your own drawings go to your teacher when you hand them in.</p>}
          </section>
        )}

        <section aria-labelledby="gal-h">
          <h2 id="gal-h" className="kid-h">Our class gallery</h2>
          {!home.gallery.length ? (
            <p className="kid-lede">When your teacher picks drawings to show, they appear here.</p>
          ) : (
            <ul className="work-grid kid-grid">
              {home.gallery.map((w) => (
                <li key={w.id} className="work-tile">
                  <WorkPlate work={w} load={load(w)} label={`${w.title}${w.by ? ` by ${w.by}` : ""}`} mode="hover" />
                  <span className="work-cap"><span className="kid-title">{w.title}</span>{w.by && <span className="serif">{w.by}</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

/* ---------- /show/:token: a class's show, for anyone with the link ---------- */

export function Show() {
  const { token = "" } = useParams();
  const { api, demo } = useSchoolApi();
  const [page, setPage] = useState<ShowPage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api?.showPage(token).then(setPage, (e) => setError(errText(e)));
  }, [api, token]);
  // a show is for those given the link: search engines are asked to leave it out
  useEffect(() => {
    const m = document.createElement("meta");
    m.name = "robots";
    m.content = "noindex, nofollow";
    document.head.append(m);
    return () => m.remove();
  }, []);
  useEffect(() => {
    if (page) document.title = `${page.show.title} · ${page.cls} · Tilo`;
  }, [page]);
  return (
    <>
      {demo && <DemoBar />}
      <main id="main" tabIndex={-1} className="wrap show-page">
        {error ? (
          <p className="empty serif">{error}</p>
        ) : !page || !api ? (
          <Waiting />
        ) : (
          <>
            <header className="page-head">
              <p className="kicker">{page.school} · {page.cls}</p>
              <h1>{page.show.title}</h1>
              {page.show.about && <p className="serif">{page.show.about}</p>}
              <p className="serif show-how">Each drawing replays from its first line: hover over it, or tap it, to watch.</p>
            </header>
            <ul className="show-grid">
              {page.works.map((w) => (
                <li key={w.id} className="card">
                  <WorkPlate work={w} load={() => api.showStrokes(token, w.id)} label={`${w.title}${w.by ? ` by ${w.by}` : ""}`} mode="hover" />
                  <span className="card-cap">
                    <span className="card-title">{w.title}</span>
                    {w.by && <span className="card-by">{w.by}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="serif show-foot">Drawn in <Link to="/schools">Tilo for schools</Link>, where every drawing is kept with its recording.</p>
          </>
        )}
      </main>
    </>
  );
}

/* ---------- /schools and /demo ---------- */

export function Schools() {
  return (
    <main id="main" tabIndex={-1} className="wrap schools-page">
      <header className="page-head schools-hero">
        <p className="kicker">Tilo for schools</p>
        <h1>A drawing room for a whole class</h1>
        <p className="serif">Pupils aged 6 to 15 draw and paint in Tilo's studio, with pixel art too. The teacher sets tasks, watches every drawing being made, stamps it and writes a note, and shows the best of it to parents. No emails for pupils, no public profiles, nothing to chat.</p>
        <div className="row-btns">
          <Link to="/demo" className="btn btn-ink" viewTransition>See the demo school<Icon name="next" /></Link>
          <Link to="/teach" className="btn btn-line" viewTransition>Start a class</Link>
          <Link to="/class" className="btn btn-quiet" viewTransition>I'm a pupil</Link>
        </div>
      </header>
      <ol className="schools-steps">
        <li><b>The teacher makes a class</b> and types the pupils' names. Tilo gives each one a picture password and prints their sign-in cards.</li>
        <li><b>Pupils sign in</b> with the class code, their name and their pictures, on any computer or tablet. Their work is saved as they draw.</li>
        <li><b>The teacher sets tasks</b>, from a library of lessons or their own: drawing or pixel art, a due date, the colours to use.</li>
        <li><b>Every drawing is a recording.</b> The teacher watches how it was made, not only how it ended, and reviews it with stamps and a note.</li>
        <li><b>Shows</b> put the best of the class on a page for parents, by link only. Pupils see each other's work only once the teacher has chosen it.</li>
      </ol>
      <section className="schools-safe sheet" aria-labelledby="safe-h">
        <h2 id="safe-h">Made safe for children</h2>
        <ul className="serif">
          <li>Pupils have no email, no handle and no public page. Tilo keeps the name the teacher typed, the pictures and the drawings, nothing else.</li>
          <li>Pupils can't write to anyone. The only words they type are their drawings' titles.</li>
          <li>Every drawing handed in goes through Tilo's image check, frame by frame along its replay.</li>
          <li>Teachers confirm teachers: a school's first teacher is checked by Tilo, and every colleague after that is approved by a teacher already there.</li>
          <li>No adverts and no tracking.</li>
        </ul>
      </section>
    </main>
  );
}

export function DemoHome() {
  const nav = useNavigate();
  const again = async () => {
    (await import("../data/school-demo")).resetDemo();
    nav(0);
  };
  return (
    <>
      <DemoBar />
      <main id="main" tabIndex={-1} className="wrap schools-page demo-home">
        <header className="page-head">
          <p className="kicker">Tilo for schools · demo</p>
          <h1>Sunny Hill School</h1>
          <p className="serif">A made-up school with three classes, twenty-two pupils and their drawings, each one a recording you can watch being drawn. Everything works, and nothing you do leaves this browser.</p>
        </header>
        <div className="demo-doors">
          <Link to="/demo/teach" className="demo-door sheet" viewTransition>
            <span className="kicker">Be the teacher</span>
            <b>Ms Nana's classes</b>
            <span className="serif">Set a task, review the cat drawings 3B handed in, approve a colleague, make a show for parents.</span>
          </Link>
          <Link to="/demo/class" className="demo-door sheet" viewTransition>
            <span className="kicker">Be a pupil</span>
            <b>Sign in with pictures</b>
            <span className="serif">Pick a class, tap a name and their pictures, then draw the mirror butterfly or a pixel fruit.</span>
          </Link>
          <Link to="/demo/show/our-houses" className="demo-door sheet" viewTransition>
            <span className="kicker">Be a parent</span>
            <b>“Our houses”, 3B's show</b>
            <span className="serif">The page a teacher sends home: the drawings replaying from the first line.</span>
          </Link>
        </div>
        <p className="serif"><button className="link-btn" onClick={again}>Start the demo again</button> puts everything back as it was.</p>
      </main>
    </>
  );
}
