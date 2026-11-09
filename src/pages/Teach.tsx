import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router";
import { Icon } from "../components/Icon";
import { Picture, pictureName } from "../components/Picture";
import { ReplayCanvas } from "../components/ReplayCanvas";
import { DemoBar, SLink, StatusChip, Tag, useSchoolApi, Waiting } from "../components/SchoolBits";
import { WorkPlate } from "../components/WorkPlate";
import { ACCOUNTS, useAccount } from "../data/account";
import { AGE_IDS, AGES, ago, at, dueLabel, isPixelTask, LESSONS, PRAISE, STATUS_LABEL, type Ages, type ClassInfo, type ClassPage, type Lesson, type Pupil, type School, type SchoolApi, type Show, type Task, type TaskDraft, type Work } from "../data/school";
import { DRAW_SHAPES, fmtMin, PIXEL_SHAPES, SHAPES, type ShapeId, type Stroke } from "../engine/stroke";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const errText = (e: unknown) => (e instanceof Error ? e.message : "That didn't work. Try again.");

/** Teachers sign in with their own Tilo account; the demo needs none. */
function useTeacherGate(demo: boolean) {
  const { ready, profile } = useAccount();
  if (demo) return { ok: true, why: null };
  if (!ACCOUNTS) return { ok: false, why: "accounts" as const };
  if (!ready) return { ok: false, why: "wait" as const };
  if (!profile) return { ok: false, why: "signin" as const };
  return { ok: true, why: null };
}
function Gate({ why }: { why: "accounts" | "wait" | "signin" | null }) {
  if (why === "wait") return <Waiting />;
  return (
    <section className="school-gate sheet">
      <h2>Teachers sign in with their own Tilo account</h2>
      {why === "accounts" ? (
        <p className="serif">Accounts aren't open on this copy of Tilo yet.</p>
      ) : (
        <p className="serif">Sign in, pick a handle, then come back here to register your school or join it. Pupils never need an email: you give them a class code and pictures.</p>
      )}
      <div className="row-btns">
        {why === "signin" && <Link className="btn btn-ink" to="/account?next=/teach" viewTransition>Sign in</Link>}
        <Link className="btn btn-line" to="/demo/teach" viewTransition>Try the demo first</Link>
      </div>
    </section>
  );
}

/* ---------- /teach: your schools and classes ---------- */

export function Teach() {
  const { api, demo } = useSchoolApi();
  const gate = useTeacherGate(demo);
  const [data, setData] = useState<{ schools: School[]; classes: ClassInfo[] } | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    api?.mine().then(setData, (e) => setError(errText(e)));
  }, [api]);
  useEffect(() => {
    if (gate.ok) reload();
  }, [gate.ok, reload]);

  return (
    <>
      {demo && <DemoBar />}
      <main id="main" tabIndex={-1} className="wrap school-page">
        <header className="page-head">
          <p className="kicker">Tilo for schools{demo ? " · demo" : ""}</p>
          <h1>Your classes</h1>
          <p className="serif">Pupils draw here with a class code and a picture password. Their work stays in the class until you show it.</p>
        </header>
        {!gate.ok ? (
          <Gate why={gate.why} />
        ) : error ? (
          <p className="field-note is-error" role="alert">{error}</p>
        ) : !data || !api ? (
          <Waiting />
        ) : (
          <>
            {data.schools.map((s) => (
              <SchoolBlock key={s.id} school={s} classes={data.classes.filter((c) => c.school === s.id)} api={api} reload={reload} demo={demo} />
            ))}
            {!data.schools.length && <p className="serif school-lede">Start by registering your school, or join it if a colleague already has.</p>}
            <SchoolForms api={api} reload={reload} first={!data.schools.length} />
          </>
        )}
      </main>
    </>
  );
}

function SchoolForms({ api, reload, first }: { api: SchoolApi; reload: () => void; first: boolean }) {
  const [open, setOpen] = useState(first);
  const [msg, setMsg] = useState<[string, boolean] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (e: React.FormEvent<HTMLFormElement>, f: (d: FormData) => Promise<void>, done: string) => {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    try {
      await f(new FormData(form));
      form.reset();
      setMsg([done, true]);
      reload();
    } catch (err) {
      setMsg([errText(err), false]);
    }
    setBusy(false);
  };
  if (!open) return <button className="btn btn-line school-more" onClick={() => setOpen(true)}><Icon name="plus" />Register or join another school</button>;
  return (
    <div className="school-forms">
      <form className="sheet school-form" onSubmit={(e) => run(e, (d) => api.registerSchool(String(d.get("name")).trim(), String(d.get("city")).trim()), "Registered. Tilo checks every new school before its pupils can sign in, usually within a day.")}>
        <h2>Register your school</h2>
        <p className="serif">You'll be its first teacher. Tilo checks the school is real before pupils can sign in; after that, your colleagues join with the school's teacher code and you approve them.</p>
        <div className="field"><label htmlFor="s-name">School's name</label><input id="s-name" name="name" required minLength={2} maxLength={80} autoComplete="organization" /></div>
        <div className="field"><label htmlFor="s-city">Town or city</label><input id="s-city" name="city" required maxLength={60} autoComplete="address-level2" /></div>
        <button className="btn btn-ink" disabled={busy}>Register the school</button>
      </form>
      <form className="sheet school-form" onSubmit={(e) => run(e, (d) => api.joinSchool(String(d.get("code")).trim()), "Asked. A teacher at the school approves you, and then your classes can start.")}>
        <h2>Join your school</h2>
        <p className="serif">A teacher already on Tilo finds the school's teacher code on their classes page. Type it here and they approve you.</p>
        <div className="field"><label htmlFor="s-code">Teacher code</label><input id="s-code" name="code" required maxLength={24} autoComplete="off" autoCapitalize="characters" placeholder="TEACH-ABC234" /></div>
        <button className="btn btn-line" disabled={busy}>Ask to join</button>
      </form>
      {msg && <p className={`field-note${msg[1] ? "" : " is-error"}`} role={msg[1] ? "status" : "alert"}>{msg[0]}</p>}
    </div>
  );
}

function SchoolBlock({ school, classes, api, reload, demo }: { school: School; classes: ClassInfo[]; api: SchoolApi; reload: () => void; demo: boolean }) {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [ages, setAges] = useState<Ages>("6-8");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [archived, setArchived] = useState(false);
  const pending = school.teachers.filter((t) => t.status === "pending");
  const shown = classes.filter((c) => c.archived === archived);
  const make = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const id = await api.newClass(school.id, name.trim(), ages);
      nav(at(demo, `/teach/${id}/pupils`), { viewTransition: true });
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  };
  const decide = async (id: string, ok: boolean) => {
    await api.decideTeacher(school.id, id, ok).catch((e) => setError(errText(e)));
    reload();
  };
  return (
    <section className="school-block" aria-labelledby={`school-${school.id}`}>
      <div className="school-head">
        <h2 id={`school-${school.id}`}>{school.name}<small className="serif">{school.city}</small></h2>
        {school.status !== "active" && <span className="chip-s is-handed">{school.status === "pending" ? "Waiting for Tilo to check the school" : "Closed"}</span>}
        {school.me === "pending" && <span className="chip-s is-handed">Waiting for a teacher here to approve you</span>}
      </div>
      {school.me === "active" && (
        <>
          <div className="school-facts">
            <p className="serif">Teacher code <b className="mono">{school.code}</b> · colleagues type it on their classes page to join, and any of you approves them.</p>
            <p className="serif">Teachers: {school.teachers.filter((t) => t.status === "active").map((t) => t.name).join(", ")}</p>
          </div>
          {pending.length > 0 && (
            <ul className="school-pending" aria-label="Teachers asking to join">
              {pending.map((t) => (
                <li key={t.id}>
                  <span><b>{t.name}</b> asks to join {school.name}.</span>
                  <span className="row-btns">
                    <button className="btn btn-quiet" onClick={() => decide(t.id, false)}>Turn down</button>
                    <button className="btn btn-ink" onClick={() => decide(t.id, true)}>Approve</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ul className="class-cards">
            {shown.map((c) => (
              <li key={c.id}>
                <SLink to={`/teach/${c.id}`} className="class-card sheet">
                  <span className="class-card-name">{c.name}</span>
                  <span className="serif">{AGES[c.ages].label} · {plural(c.pupils, "pupil")}</span>
                  <span className="class-card-code mono">{c.code}</span>
                  {c.waiting > 0 && <span className="chip-s is-handed">{c.waiting} to review</span>}
                </SLink>
              </li>
            ))}
            {!archived && school.status === "active" && (
              <li>
                <form className="class-card class-new sheet" onSubmit={make}>
                  <span className="class-card-name">New class</span>
                  <div className="field"><label htmlFor={`c-${school.id}`}>Name</label><input id={`c-${school.id}`} value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} placeholder="3B Art" autoComplete="off" /></div>
                  <div className="seg" role="group" aria-label="Ages" style={{ ["--n" as string]: 3 }}>
                    {AGE_IDS.map((a) => <button type="button" key={a} aria-pressed={ages === a} onClick={() => setAges(a)}>{a}</button>)}
                  </div>
                  <button className="btn btn-ink" disabled={busy}><Icon name="plus" />Make the class</button>
                </form>
              </li>
            )}
          </ul>
          {classes.some((c) => c.archived) && (
            <button className="link-btn" onClick={() => setArchived((a) => !a)}>{archived ? "Back to this year's classes" : `Archived classes (${classes.filter((c) => c.archived).length})`}</button>
          )}
          {error && <p className="field-note is-error" role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}

/* ---------- /teach/:cls/:tab: one class ---------- */

type Tab = "work" | "pupils" | "shows";
const TABS: [Tab, string][] = [["work", "Tasks and work"], ["pupils", "Pupils"], ["shows", "Shows"]];

export function ClassRoom() {
  const { cls = "", tab = "work" } = useParams();
  const { api, demo } = useSchoolApi();
  const gate = useTeacherGate(demo);
  const [page, setPage] = useState<ClassPage | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    api?.classPage(cls).then(setPage, (e) => setError(errText(e)));
  }, [api, cls]);
  useEffect(() => {
    if (gate.ok) reload();
  }, [gate.ok, reload]);

  const t = (TABS.some(([k]) => k === tab) ? tab : "work") as Tab;
  return (
    <>
      {demo && <DemoBar />}
      <main id="main" tabIndex={-1} className="wrap school-page">
        {!gate.ok ? (
          <Gate why={gate.why} />
        ) : error ? (
          <>
            <p className="field-note is-error" role="alert">{error}</p>
            <SLink to="/teach">Back to your classes</SLink>
          </>
        ) : !page || !api ? (
          <Waiting />
        ) : (
          <>
            <header className="page-head class-head">
              <p className="kicker"><SLink to="/teach">{page.cls.schoolName}</SLink> · {AGES[page.cls.ages].label}</p>
              <h1>{page.cls.name}</h1>
              <div className="class-door">
                <p className="serif">Pupils sign in at <b>{location.host}{at(demo, "/class")}</b> with the code</p>
                <p className="class-code mono">{page.cls.code}</p>
              </div>
            </header>
            <nav className="admin-tabs class-tabs" aria-label="Class">
              {TABS.map(([k, label]) => (
                <NavLink key={k} to={at(demo, `/teach/${cls}${k === "work" ? "" : `/${k}`}`)} end viewTransition aria-current={t === k ? "page" : undefined} className={t === k ? "active" : undefined}>
                  {label}
                  {k === "work" && page.cls.waiting > 0 && <b className="tab-n">{page.cls.waiting}</b>}
                </NavLink>
              ))}
            </nav>
            {t === "work" && <WorkTab page={page} api={api} reload={reload} />}
            {t === "pupils" && <PupilsTab page={page} api={api} reload={reload} />}
            {t === "shows" && <ShowsTab page={page} api={api} reload={reload} demo={demo} />}
          </>
        )}
      </main>
    </>
  );
}

/* ---- tasks and work ---- */

function WorkTab({ page, api, reload }: { page: ClassPage; api: SchoolApi; reload: () => void }) {
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [looking, setLooking] = useState<Work | null>(null);
  const byPupil = useMemo(() => new Map(page.pupils.map((p) => [p.id, p])), [page.pupils]);
  const own = page.works.filter((w) => !w.task && w.status !== "draft");
  const load = (id: string) => () => api.strokes(id);
  const flip = async (t: Task) => {
    await api.saveTask(page.cls.id, { ...t, open: !t.open });
    reload();
  };

  return (
    <div className="work-tab">
      <div className="tab-bar">
        <p className="serif">{page.tasks.length ? `${plural(page.tasks.filter((t) => t.open).length, "open task")}, ${page.cls.waiting} handed in to review.` : "No tasks yet. Set the first one: pupils see it when they sign in."}</p>
        <button className="btn btn-ink" onClick={() => setEditing("new")}><Icon name="plus" />New task</button>
      </div>
      {!page.pupils.length && <p className="held-note">This class has no pupils yet. <SLink to={`/teach/${page.cls.id}/pupils`}>Add them</SLink> and print their sign-in cards.</p>}

      {page.tasks.map((t) => {
        const works = page.works.filter((w) => w.task === t.id);
        const handed = works.filter((w) => w.status !== "draft").length;
        const toReview = works.filter((w) => w.status === "handed").length;
        return (
          <section key={t.id} className="task-block" aria-labelledby={`task-${t.id}`}>
            <div className="task-head">
              <div>
                <h2 id={`task-${t.id}`}>{t.title}</h2>
                <p className="serif task-meta">
                  {isPixelTask(t) ? `Pixel art, ${SHAPES[t.shape].name}` : `Drawing, ${SHAPES[t.shape].name.toLowerCase()}`}
                  {t.palette ? `, ${t.palette.length} colours` : ""} · {t.due ? dueLabel(t.due) : "No due date"} · {handed} of {page.pupils.length} handed in{toReview ? `, ${toReview} to review` : ""}
                </p>
              </div>
              <span className={`chip-s ${t.open ? "is-open" : "is-closed"}`}>{t.open ? "Open" : "Closed"}</span>
              <div className="row-btns">
                <button className="btn btn-quiet" onClick={() => flip(t)}>{t.open ? "Close it" : "Open it again"}</button>
                <button className="btn btn-line" onClick={() => setEditing(t)}>Edit</button>
              </div>
            </div>
            <p className="serif task-brief">{t.brief}</p>
            <ul className="work-grid">
              {page.pupils.map((p) => {
                const w = works.find((x) => x.pupil === p.id);
                return (
                  <li key={p.id}>
                    {w ? (
                      <button className="work-tile" onClick={() => setLooking(w)} aria-label={`${p.name}: ${w.title}, ${STATUS_LABEL[w.status].toLowerCase()}`}>
                        <WorkPlate work={w} load={load(w.id)} label={`${w.title} by ${p.name}`} />
                        <span className="work-cap"><Tag name={p.name} tag={p.tag} /><StatusChip work={w} /></span>
                        {w.stamps.length > 0 && <span className="work-stamps">{w.stamps.join(" · ")}</span>}
                      </button>
                    ) : (
                      <div className="work-tile is-none">
                        <span className="plate work-plate work-none" style={{ aspectRatio: SHAPES[t.shape].w / SHAPES[t.shape].h }}><span className="work-empty serif">Not started</span></span>
                        <span className="work-cap"><Tag name={p.name} tag={p.tag} /></span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {own.length > 0 && (
        <section className="task-block" aria-labelledby="own-h">
          <div className="task-head"><h2 id="own-h">Drawn on their own</h2></div>
          <p className="serif task-brief">What pupils drew outside the tasks and handed in to you.</p>
          <ul className="work-grid">
            {own.map((w) => {
              const p = byPupil.get(w.pupil);
              return (
                <li key={w.id}>
                  <button className="work-tile" onClick={() => setLooking(w)}>
                    <WorkPlate work={w} load={load(w.id)} label={`${w.title} by ${p?.name}`} />
                    <span className="work-cap">{p && <Tag name={p.name} tag={p.tag} />}<StatusChip work={w} /></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {editing && <TaskDialog cls={page.cls} task={editing === "new" ? null : editing} api={api} hasWork={editing !== "new" && page.works.some((w) => w.task === editing.id)} onDone={(changed) => { setEditing(null); if (changed) reload(); }} />}
      {looking && <ReviewDialog work={looking} pupil={byPupil.get(looking.pupil)!} task={page.tasks.find((t) => t.id === looking.task) ?? null} api={api} onDone={(changed) => { setLooking(null); if (changed) reload(); }} />}
    </div>
  );
}

/** A dialog that opens as soon as it is on the page and tells its parent when it closes. */
function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const closed = useRef(onClose);
  closed.current = onClose;
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const f = () => closed.current();
    d.addEventListener("close", f);
    return () => d.removeEventListener("close", f);
  }, []);
  return ref;
}

function TaskDialog({ cls, task, api, hasWork, onDone }: { cls: ClassInfo; task: Task | null; api: SchoolApi; hasWork: boolean; onDone: (changed: boolean) => void }) {
  const changed = useRef(false);
  const dlg = useDialog(() => onDone(changed.current));
  const [d, setD] = useState<TaskDraft>(() => task ?? { title: "", brief: "", shape: "land", palette: null, due: null });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [doomed, setDoomed] = useState(false);
  const lessons = LESSONS.filter((l) => l.ages.includes(cls.ages));
  const pixel = isPixelTask(d);
  const from = (l: Lesson) => setD({ title: l.title, brief: l.brief, shape: l.shape, palette: l.palette, due: d.due });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.saveTask(cls.id, { ...d, title: d.title.trim(), brief: d.brief.trim(), id: task?.id });
      changed.current = true;
      dlg.current!.close();
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  };
  const remove = async () => {
    await api.removeTask(task!.id);
    changed.current = true;
    dlg.current!.close();
  };
  return (
    <dialog ref={dlg} aria-labelledby="task-h" className="wide-dlg">
      <form className="small-sheet sheet task-form" onSubmit={save}>
        <h2 id="task-h">{task ? "Edit the task" : "A new task"}</h2>
        {!task && (
          <div className="lessons" role="group" aria-label="Start from a lesson">
            <span className="kicker">Start from a lesson</span>
            {lessons.map((l) => <button type="button" key={l.id} className="lesson-chip" aria-pressed={d.title === l.title} onClick={() => from(l)}>{l.title}</button>)}
          </div>
        )}
        <div className="field"><label htmlFor="t-title">Title</label><input id="t-title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} required maxLength={60} autoComplete="off" /></div>
        <div className="field"><label htmlFor="t-brief">What to do</label><textarea id="t-brief" rows={3} value={d.brief} onChange={(e) => setD({ ...d, brief: e.target.value })} maxLength={400} placeholder="Pupils read this before they start." /></div>
        <div className="seg" role="group" aria-label="Kind" style={{ ["--n" as string]: 2 }}>
          <button type="button" aria-pressed={!pixel} disabled={hasWork} onClick={() => setD({ ...d, shape: "land", palette: null })}>Drawing</button>
          <button type="button" aria-pressed={pixel} disabled={hasWork} onClick={() => setD({ ...d, shape: "px16", palette: null })}>Pixel art</button>
        </div>
        <div className="seg" role="group" aria-label={pixel ? "Grid" : "Sheet"} style={{ ["--n" as string]: pixel ? PIXEL_SHAPES.length : DRAW_SHAPES.length }}>
          {(pixel ? PIXEL_SHAPES : DRAW_SHAPES).map((s: ShapeId) => <button type="button" key={s} aria-pressed={d.shape === s} disabled={hasWork && d.shape !== s} onClick={() => setD({ ...d, shape: s })}>{SHAPES[s].name}</button>)}
        </div>
        {hasWork && <p className="hint">Pupils have started, so the sheet stays as it is.</p>}
        {d.palette && (
          <label className="check"><input type="checkbox" checked onChange={() => setD({ ...d, palette: null })} /> Only these colours: <span className="pal-mini">{d.palette.map((c) => <i key={c} style={{ background: c }} />)}</span></label>
        )}
        <div className="field"><label htmlFor="t-due">Due <span className="field-optional">optional</span></label><input id="t-due" type="date" value={d.due ?? ""} onChange={(e) => setD({ ...d, due: e.target.value || null })} /></div>
        {error && <p className="field-note is-error" role="alert">{error}</p>}
        <div className="row">
          {task && !hasWork && (doomed ? <button type="button" className="btn btn-danger" onClick={remove}>Delete it for good</button> : <button type="button" className="btn btn-quiet" onClick={() => setDoomed(true)}>Delete the task</button>)}
          <span className="sp" />
          <button type="button" className="btn btn-quiet" onClick={() => dlg.current!.close()}>Cancel</button>
          <button className="btn btn-ink" disabled={busy}>{task ? "Save" : "Set the task"}</button>
        </div>
      </form>
    </dialog>
  );
}

function ReviewDialog({ work, pupil, task, api, onDone }: { work: Work; pupil: Pupil; task: Task | null; api: SchoolApi; onDone: (changed: boolean) => void }) {
  const changed = useRef(false);
  const dlg = useDialog(() => onDone(changed.current));
  const [strokes, setStrokes] = useState<Stroke[] | null>(null);
  const [run, setRun] = useState(0);
  const [stamps, setStamps] = useState<string[]>(work.stamps);
  const [note, setNote] = useState(work.note);
  const [shown, setShown] = useState(work.status === "reviewed" ? work.shown : true);
  const [error, setError] = useState("");
  useEffect(() => {
    api.strokes(work.id).then(setStrokes, (e) => setError(errText(e)));
  }, [api, work.id]);
  const held = work.check === "held";
  const canReview = work.status !== "draft";
  const send = async (status: "back" | "reviewed") => {
    try {
      await api.review(work.id, { stamps, note: note.trim(), status, shown: shown && !held });
      changed.current = true;
      dlg.current!.close();
    } catch (e) {
      setError(errText(e));
    }
  };
  const toggle = (s: string) => setStamps((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s]));
  const ratio = SHAPES[work.shape].w / SHAPES[work.shape].h;
  return (
    <dialog ref={dlg} aria-labelledby="rev-h" className="review-dlg" onClick={(e) => e.target === e.currentTarget && dlg.current!.close()}>
      <div className="review sheet">
        <div className="review-art">
          <span className="plate" style={{ aspectRatio: ratio }}>
            {strokes && <ReplayCanvas key={run} strokes={strokes} layers={work.layers} paper={work.paper} shape={work.shape} mode={run ? "once" : "static"} label={`${work.title} by ${pupil.name}`} />}
          </span>
          <div className="row-btns">
            <button className="btn btn-line" onClick={() => setRun((r) => r + 1)} disabled={!strokes?.length}><Icon name="replay" />Watch it being drawn</button>
            <span className="serif review-facts">{plural(work.strokes, "stroke")} · {fmtMin(work.minutes)} drawing{work.handed ? ` · handed in ${ago(work.handed)}` : ""}</span>
          </div>
        </div>
        <div className="review-side">
          <p className="kicker">{task?.title ?? "Drawn on their own"}</p>
          <h2 id="rev-h">{work.title}</h2>
          <p><Tag name={pupil.name} tag={pupil.tag} /> <StatusChip work={work} /></p>
          {held && <p className="held-note">Tilo's image check held this drawing, so it can't go into a gallery or a show. Look at it, and send it back or talk to the pupil.</p>}
          {!canReview ? (
            <p className="serif">{pupil.name} is still drawing this. You can watch it so far, and review it once it's handed in.</p>
          ) : (
            <>
              <div className="praise" role="group" aria-label="Stamps">
                {PRAISE.map((s) => <button type="button" key={s} className="praise-btn" aria-pressed={stamps.includes(s)} onClick={() => toggle(s)}>{s}</button>)}
              </div>
              <div className="field"><label htmlFor="r-note">A note for {pupil.name.split(" ")[0]}</label><textarea id="r-note" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What works, and one thing to try next time." /></div>
              <label className="check"><input type="checkbox" checked={shown && !held} disabled={held} onChange={(e) => setShown(e.target.checked)} /> Show it in the class gallery</label>
              {error && <p className="field-note is-error" role="alert">{error}</p>}
              <div className="row">
                <button className="btn btn-quiet" onClick={() => send("back")}>Send back to work on</button>
                <button className="btn btn-ink" onClick={() => send("reviewed")}>{work.status === "reviewed" ? "Save" : "Mark reviewed"}</button>
              </div>
            </>
          )}
          <button className="icon-btn review-x" onClick={() => dlg.current!.close()} aria-label="Close"><Icon name="x" /></button>
        </div>
      </div>
    </dialog>
  );
}

/* ---- pupils and their cards ---- */

function PupilsTab({ page, api, reload }: { page: ClassPage; api: SchoolApi; reload: () => void }) {
  const [names, setNames] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [doomed, setDoomed] = useState<Pupil | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const del = useRef<HTMLDialogElement>(null);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const list = names.split("\n").map((n) => n.trim().replace(/\s+/g, " ")).filter(Boolean);
    if (!list.length) return;
    setBusy(true);
    try {
      await api.addPupils(page.cls.id, list);
      setNames("");
      reload();
    } catch (err) {
      setError(errText(err));
    }
    setBusy(false);
  };
  const act = (f: () => Promise<void>) => f().then(reload, (e) => setError(errText(e)));
  const printCards = () => {
    document.documentElement.classList.add("printing");
    const done = () => {
      document.documentElement.classList.remove("printing");
      removeEventListener("afterprint", done);
    };
    addEventListener("afterprint", done);
    print();
  };
  const workCount = (id: string) => page.works.filter((w) => w.pupil === id).length;

  return (
    <div className="pupils-tab">
      <div className="tab-bar">
        <p className="serif">{plural(page.pupils.length, "pupil")}. Each has a picture password of {AGES[page.cls.ages].pictures} pictures; print the cards and hand them out.</p>
        <button className="btn btn-line" onClick={printCards} disabled={!page.pupils.length}><Icon name="download" />Print sign-in cards</button>
      </div>
      <ul className="pupil-list">
        {page.pupils.map((p) => (
          <li key={p.id}>
            {renaming === p.id ? (
              <form className="pupil-rename" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("n")!.toString().trim(); setRenaming(null); if (v && v !== p.name) act(() => api.editPupil(p.id, { name: v })); }}>
                <input name="n" defaultValue={p.name} maxLength={24} autoFocus aria-label={`New name for ${p.name}`} onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} />
                <button className="btn btn-ink">Save</button>
              </form>
            ) : (
              <Tag name={p.name} tag={p.tag} />
            )}
            <span className="pupil-pics" role="img" aria-label={`Pictures: ${p.pictures?.map(pictureName).join(", ")}`}>{p.pictures?.map((i, k) => <Picture key={k} i={i} size={28} label={false} />)}</span>
            <span className="serif pupil-note">{p.lockedUntil && new Date(p.lockedUntil) > new Date() ? "Locked after wrong tries" : plural(workCount(p.id), "drawing")}</span>
            <span className="row-btns">
              <button className="btn btn-quiet" onClick={() => setRenaming(p.id)}>Rename</button>
              <button className="btn btn-quiet" onClick={() => act(() => api.editPupil(p.id, { newPictures: true }))}>New pictures</button>
              <button className="icon-btn" onClick={() => { setDoomed(p); del.current!.showModal(); }} aria-label={`Remove ${p.name}`} title="Remove"><Icon name="trash" size={18} /></button>
            </span>
          </li>
        ))}
      </ul>
      <form className="sheet add-pupils" onSubmit={add}>
        <div className="field">
          <label htmlFor="p-names">Add pupils</label>
          <textarea id="p-names" rows={4} value={names} onChange={(e) => setNames(e.target.value)} placeholder={"Nino B.\nLuka K.\nMariam T."} />
          <p className="hint">One name a line. A first name and an initial is enough: Tilo keeps nothing else about a pupil.</p>
        </div>
        <button className="btn btn-ink" disabled={busy || !names.trim()}><Icon name="plus" />Add them</button>
      </form>
      {error && <p className="field-note is-error" role="alert">{error}</p>}

      <dialog ref={del} aria-labelledby="pdel-h">
        <div className="small-sheet sheet">
          <h2 id="pdel-h">Remove {doomed?.name}?</h2>
          <p>Their {doomed ? plural(workCount(doomed.id), "drawing") : ""} go with them, from the class and from any show. This can't be undone.</p>
          <div className="row">
            <button className="btn btn-quiet" onClick={() => del.current!.close()}>Keep them</button>
            <button className="btn btn-danger" onClick={() => { const p = doomed!; del.current!.close(); act(() => api.removePupil(p.id)); }}>Remove</button>
          </div>
        </div>
      </dialog>

      <div className="print-cards" aria-hidden="true">
        {page.pupils.map((p) => (
          <div key={p.id} className="print-card">
            <p className="print-name">{p.name}</p>
            <p className="print-how">Go to <b>{location.host}/class</b> and type</p>
            <p className="print-code">{page.cls.code}</p>
            <p className="print-how">Tap your name, then your pictures in this order:</p>
            <p className="print-pics">{p.pictures?.map((i, k) => <span key={k}><Picture i={i} size={64} label={false} /><small>{k + 1}. {pictureName(i)}</small></span>)}</p>
            <p className="print-foot">{page.cls.name} · {page.cls.schoolName} · Tilo</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- shows ---- */

function ShowsTab({ page, api, reload, demo }: { page: ClassPage; api: SchoolApi; reload: () => void; demo: boolean }) {
  const [editing, setEditing] = useState<Show | "new" | null>(null);
  const [copied, setCopied] = useState("");
  const shown = page.works.filter((w) => w.status === "reviewed" && w.check !== "held");
  const url = (s: Show) => `${location.origin}${at(demo, `/show/${s.token}`)}`;
  const copy = async (s: Show) => {
    try {
      await navigator.clipboard.writeText(url(s));
      setCopied(s.id);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      prompt("Copy the show's address", url(s));
    }
  };
  const gallery = page.works.filter((w) => w.shown && w.status === "reviewed");
  return (
    <div className="shows-tab">
      <div className="tab-bar">
        <p className="serif">A show is a set of reviewed drawings with a title, for parents and the school. Anyone with its link can see it; it isn't listed or searchable anywhere.</p>
        <button className="btn btn-ink" onClick={() => setEditing("new")} disabled={!shown.length}><Icon name="plus" />New show</button>
      </div>
      {!page.shows.length ? (
        <p className="empty serif">{shown.length ? "No shows yet." : "Review some work first: shows are made from reviewed drawings."}</p>
      ) : (
        <ul className="show-list">
          {page.shows.map((s) => (
            <li key={s.id} className="sheet">
              <div>
                <h2>{s.title}</h2>
                <p className="serif">{plural(s.works.length, "drawing")} · names {s.names ? "shown" : "left off"} · made {ago(s.created)}</p>
                {s.about && <p className="serif show-about">{s.about}</p>}
              </div>
              <div className="row-btns">
                <button className="btn btn-quiet" onClick={() => copy(s)}><Icon name="copy" size={18} />{copied === s.id ? "Copied" : "Copy the link"}</button>
                <SLink to={`/show/${s.token}`} className="btn btn-line">Open</SLink>
                <button className="btn btn-quiet" onClick={() => setEditing(s)}>Edit</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <section className="task-block" aria-labelledby="gal-h">
        <div className="task-head"><h2 id="gal-h">The class gallery</h2></div>
        <p className="serif task-brief">What the pupils see of each other's work: drawings you reviewed and chose to show. {gallery.length ? "" : "Nothing yet."}</p>
        <ul className="work-grid">
          {gallery.map((w) => {
            const p = page.pupils.find((x) => x.id === w.pupil);
            return (
              <li key={w.id} className="work-tile">
                <WorkPlate work={w} load={() => api.strokes(w.id)} label={`${w.title} by ${p?.name}`} mode="hover" />
                <span className="work-cap">{p && <Tag name={p.name} tag={p.tag} />}<span className="serif">{w.title}</span></span>
              </li>
            );
          })}
        </ul>
      </section>
      {editing && <ShowDialog cls={page.cls.id} show={editing === "new" ? null : editing} works={shown} pupils={page.pupils} api={api} onDone={(c) => { setEditing(null); if (c) reload(); }} />}
    </div>
  );
}

function ShowDialog({ cls, show, works, pupils, api, onDone }: { cls: string; show: Show | null; works: Work[]; pupils: Pupil[]; api: SchoolApi; onDone: (changed: boolean) => void }) {
  const changed = useRef(false);
  const dlg = useDialog(() => onDone(changed.current));
  const [title, setTitle] = useState(show?.title ?? "");
  const [about, setAbout] = useState(show?.about ?? "");
  const [names, setNames] = useState(show?.names ?? true);
  const [picked, setPicked] = useState<string[]>(show?.works ?? []);
  const [error, setError] = useState("");
  const [doomed, setDoomed] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked.length) return setError("Pick at least one drawing.");
    try {
      await api.saveShow(cls, { id: show?.id, title: title.trim(), about: about.trim(), works: picked, names });
      changed.current = true;
      dlg.current!.close();
    } catch (err) {
      setError(errText(err));
    }
  };
  const remove = async () => {
    await api.removeShow(show!.id);
    changed.current = true;
    dlg.current!.close();
  };
  return (
    <dialog ref={dlg} aria-labelledby="show-h" className="wide-dlg">
      <form className="small-sheet sheet" onSubmit={save}>
        <h2 id="show-h">{show ? "Edit the show" : "A new show"}</h2>
        <div className="field"><label htmlFor="sh-title">Title</label><input id="sh-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={60} autoComplete="off" placeholder="Our houses" /></div>
        <div className="field"><label htmlFor="sh-about">A line about it <span className="field-optional">optional</span></label><textarea id="sh-about" rows={2} value={about} onChange={(e) => setAbout(e.target.value)} maxLength={300} /></div>
        <label className="check"><input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} /> Show each pupil's name under their drawing</label>
        <fieldset className="pick-works">
          <legend className="kicker">Drawings ({picked.length} picked)</legend>
          <ul className="work-grid is-small">
            {works.map((w) => {
              const p = pupils.find((x) => x.id === w.pupil);
              const on = picked.includes(w.id);
              return (
                <li key={w.id}>
                  <label className={`work-tile pick${on ? " is-on" : ""}`}>
                    <input type="checkbox" checked={on} aria-label={`${w.title} by ${p?.name ?? "a pupil"}`} onChange={() => setPicked((l) => (on ? l.filter((x) => x !== w.id) : [...l, w.id]))} />
                    <WorkPlate work={w} load={() => api.strokes(w.id)} label={`${w.title} by ${p?.name}`} />
                    <span className="work-cap serif">{p?.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        {error && <p className="field-note is-error" role="alert">{error}</p>}
        <div className="row">
          {show && (doomed ? <button type="button" className="btn btn-danger" onClick={remove}>Take it down for good</button> : <button type="button" className="btn btn-quiet" onClick={() => setDoomed(true)}>Take the show down</button>)}
          <span className="sp" />
          <button type="button" className="btn btn-quiet" onClick={() => dlg.current!.close()}>Cancel</button>
          <button className="btn btn-ink">{show ? "Save" : "Make the show"}</button>
        </div>
      </form>
    </dialog>
  );
}
