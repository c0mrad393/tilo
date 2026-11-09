import { decode, encode, fromBase64, toBase64 } from "../engine/codec";
import { Sketch } from "../engine/sketch";
import { BASE_LAYER, drawnCount, type ShapeId, type Stroke } from "../engine/stroke";
import { kidButterfly, kidCat, kidCity, kidCreature, kidFruit, kidHouse, kidSea, kidWarmCold } from "./kid-art";
import { AGES, LESSONS, pupilSession, type Ages, type ClassInfo, type ClassPage, type Pupil, type School, type SchoolApi, type Show, type Task, type Work } from "./school";

/* The schools demo: a made-up school with three classes, running entirely in this browser.
   Its drawings are made in code (kid-art.ts) the first time they are looked at; whatever is
   drawn, reviewed or changed here is kept in this browser only, until "Start again".
   Nothing is sent anywhere, so it can be shown to a school safely. */

type GenId = "house" | "pet" | "mirror" | "sea" | "warmcold" | "fruit" | "creature" | "city";
const GENS: Record<GenId, (S: Sketch) => void> = { house: kidHouse, pet: kidCat, mirror: kidButterfly, sea: kidSea, warmcold: kidWarmCold, fruit: kidFruit, creature: kidCreature, city: kidCity };

type DClass = Omit<ClassInfo, "pupils" | "waiting" | "schoolName">;
type DPupil = Pupil & { cls: string; pictures: number[] };
type DTask = Task & { cls: string };
/** a demo work made in code: which drawing, its seed, and how much of it is drawn so far */
type DWork = Work & { gen?: [GenId, number, number] };
type DShow = Show & { cls: string };
interface State {
  v: 1;
  schools: School[];
  classes: DClass[];
  pupils: DPupil[];
  tasks: DTask[];
  works: DWork[];
  shows: DShow[];
  /** what was drawn in the demo, as recordings */
  recs: Record<string, string>;
  /** a pupil's wrong tries, so the lock can be shown */
  tries: Record<string, number>;
}

const KEY = "tilo.demo.v2";
const DAY = 864e5;

/** a seeded number from a string */
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const iso = (t: number) => new Date(t).toISOString();
const dateOnly = (t: number) => new Date(t).toISOString().slice(0, 10);

function picturesFor(ages: Ages, seed: number) {
  const n = AGES[ages].pictures, out: number[] = [];
  let x = seed;
  while (out.length < n) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    const p = (x >>> 8) % 12;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}
function classCode(seed: number) {
  const words = ["SUN", "MOON", "STAR", "KITE", "FOX", "OWL", "BEE", "SEA"];
  return `${words[seed % words.length]}-${1000 + (seed % 9000)}`;
}

const NOTES: Record<string, string[]> = {
  house: ["Your sun is so happy! Next time, try colouring the sky too.", "What a cosy house. I love the smoke from the chimney.", "Lovely bright walls. Can you add a path up to the door?", "The tree and the flowers make it feel like home."],
  pet: ["Those whiskers are great!", "I can tell your cat is happy.", "Lovely stripes, and the ball of wool is fun."],
  sea: ["The water goes right to the edges, well done.", "Your fish have such bright stripes.", "I like the little boat on top.", "So much going on under the water!"],
  creature: ["Great use of Mirror: both sides match.", "A brilliant creature. What is its name?", "The outline makes it stand out well.", "Clever colours for the belly."],
  warmcold: ["The warm sky against the cold mountains works really well."],
};

/** The demo school as it is on day one. */
function build(): State {
  const now = Date.now();
  const s: State = { v: 1, schools: [], classes: [], pupils: [], tasks: [], works: [], shows: [], recs: {}, tries: {} };
  s.schools.push({
    id: "demo",
    name: "Sunny Hill School",
    city: "Tbilisi",
    status: "active",
    code: "TEACH-HV7K2M",
    me: "active",
    teachers: [
      { id: "t-you", name: "You (Ms Nana K.)", status: "active", lead: true },
      { id: "t-giorgi", name: "Giorgi L.", status: "active", lead: false },
      { id: "t-levan", name: "Levan T.", status: "pending", lead: false },
    ],
  });

  const classes: { id: string; name: string; ages: Ages; pupils: string[]; tasks: { lesson: string; gen: GenId; daysAgo: number; dueIn: number | null; open: boolean; plan: string }[] }[] = [
    {
      id: "c-3b", name: "3B Art", ages: "6-8",
      pupils: ["Nino B.", "Luka K.", "Mariam T.", "Giorgi M.", "Ana S.", "Saba D.", "Elene G.", "Dato R."],
      tasks: [
        // r: reviewed and shown, b: sent back, h: handed in, d: still drawing, -: not started
        { lesson: "house", gen: "house", daysAgo: 20, dueIn: -13, open: false, plan: "rrrrrbrh" },
        { lesson: "pet", gen: "pet", daysAgo: 8, dueIn: -1, open: true, plan: "hhdhhh-d" },
        { lesson: "mirror", gen: "mirror", daysAgo: 1, dueIn: 4, open: true, plan: "dd-hd--d" },
      ],
    },
    {
      id: "c-5a", name: "5A Art", ages: "9-11",
      pupils: ["Keti L.", "Levan Ch.", "Tamar J.", "Irakli N.", "Salome P.", "Nika Z.", "Mariam O.", "Sandro V."],
      tasks: [
        { lesson: "sea", gen: "sea", daysAgo: 24, dueIn: -17, open: false, plan: "rrrrrrrr" },
        { lesson: "warmcold", gen: "warmcold", daysAgo: 9, dueIn: -2, open: true, plan: "hhhdhhdh" },
        { lesson: "fruit", gen: "fruit", daysAgo: 2, dueIn: 5, open: true, plan: "hdhd-hdh" },
      ],
    },
    {
      id: "c-pixel", name: "Pixel club", ages: "12-15",
      pupils: ["Anano K.", "Dachi M.", "Lizi G.", "Tornike B.", "Barbare S.", "Gega A."],
      tasks: [
        { lesson: "creature", gen: "creature", daysAgo: 15, dueIn: -8, open: false, plan: "rrrrrr" },
        { lesson: "city", gen: "city", daysAgo: 3, dueIn: 6, open: true, plan: "hdhd-h" },
      ],
    },
  ];

  classes.forEach((c, ci) => {
    s.classes.push({ id: c.id, school: "demo", name: c.name, ages: c.ages, code: classCode(hash(c.id) + ci), archived: false });
    const pupils = c.pupils.map((name, i): DPupil => ({ id: `${c.id}-p${i}`, name, tag: (i + ci * 3) % 8, cls: c.id, pictures: picturesFor(c.ages, hash(name) + i) }));
    s.pupils.push(...pupils);
    c.tasks.forEach((t, ti) => {
      const lesson = LESSONS.find((l) => l.id === t.lesson)!;
      const created = now - t.daysAgo * DAY;
      const id = `${c.id}-t${ti}`;
      s.tasks.push({ id, cls: c.id, title: lesson.title, brief: lesson.brief, shape: lesson.shape, palette: lesson.palette, due: t.dueIn === null ? null : dateOnly(now + t.dueIn * DAY), open: t.open, created: iso(created) });
      pupils.forEach((p, pi) => {
        const st = t.plan[pi];
        if (!st || st === "-") return;
        const seed = hash(`${id}:${p.name}`);
        const draft = st === "d";
        const when = created + (0.2 + ((seed % 100) / 100) * 0.7) * Math.max(1, t.daysAgo - 1) * DAY;
        const notes = NOTES[t.gen] ?? ["Lovely work."];
        const status = st === "r" ? "reviewed" : st === "b" ? "back" : st === "h" ? "handed" : "draft";
        const stamps = status === "reviewed" ? [0, 1, 2, 3, 4, 5].filter((k) => (seed >> k) % 3 === 0).slice(0, 2).map((k) => ["Bold colours", "Careful colouring", "Brave idea", "Good use of space", "Lovely details", "Worked hard"][k]) : [];
        s.works.push({
          id: `${id}-w${pi}`,
          pupil: p.id,
          task: id,
          title: pi % 3 === 0 ? `${lesson.title} by ${p.name.split(" ")[0]}` : lesson.title,
          shape: lesson.shape,
          paper: lesson.shape.startsWith("px") ? "plain" : "smooth",
          layers: [BASE_LAYER],
          strokes: 0,
          minutes: Math.round((6 + (seed % 29)) * 10) / 10,
          status,
          stamps: stamps.length || status !== "reviewed" ? stamps : ["Worked hard"],
          note: status === "reviewed" ? notes[seed % notes.length] : status === "back" ? "Lovely start! Can you colour in the roof and add a path to the door?" : "",
          shown: status === "reviewed" && seed % 7 !== 0,
          check: status === "draft" ? null : "ok",
          updated: iso(Math.min(now - 3600e3, when)),
          handed: status === "draft" ? null : iso(Math.min(now - 3600e3, when)),
          gen: [t.gen, seed, draft ? 0.35 + ((seed >> 3) % 40) / 100 : status === "back" ? 0.8 : 1],
        });
      });
    });
  });

  const reviewed = (task: string) => s.works.filter((w) => w.task === task && w.status === "reviewed").map((w) => w.id);
  s.shows.push(
    { id: "sh-1", cls: "c-3b", title: "Our houses", about: "Class 3B drew the house they live in, or one they would like to live in. Each drawing replays from the first line.", works: reviewed("c-3b-t0"), names: true, token: "our-houses", created: iso(now - 10 * DAY) },
    { id: "sh-2", cls: "c-5a", title: "Under the sea", about: "Class 5A's sea pictures, painted in the Tilo studio in one lesson.", works: reviewed("c-5a-t0").slice(0, 6), names: false, token: "under-the-sea", created: iso(now - 14 * DAY) },
  );
  return s;
}

/* ---- keeping it ---- */

let state: State | null = null;
const load = (): State => {
  if (state) return state;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (saved?.v === 1) return (state = saved);
  } catch {
    // nothing kept, or storage off: start fresh
  }
  return (state = build());
};
const keep = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or off: changes last until the page closes
  }
};
/** Puts the demo back as it was on day one, and signs the demo pupil out. */
export function resetDemo() {
  state = build();
  made.clear();
  try {
    localStorage.removeItem(KEY);
  } catch {}
  pupilSession.set(true, null);
}

/* ---- the drawings ---- */

const made = new Map<string, Stroke[]>();
function strokesOf(w: DWork): Stroke[] {
  let s = made.get(w.id);
  if (s) return s;
  const S = load();
  if (S.recs[w.id]) s = decode(fromBase64(S.recs[w.id]));
  else if (w.gen) {
    const [gen, seed, part] = w.gen;
    const sk = new Sketch(seed);
    GENS[gen](sk);
    s = part < 1 ? sk.strokes.slice(0, Math.max(1, Math.round(sk.strokes.length * part))) : sk.strokes;
    // timed as if drawn over the minutes the work says, so a replay paces like a hand
    const t0 = new Date(w.updated).getTime() - w.minutes * 60e3;
    s.forEach((st, i) => (st.t = Math.round(t0 + ((i + 1) / s!.length) * w.minutes * 60e3)));
  } else s = [];
  w.strokes = drawnCount(s);
  made.set(w.id, s);
  return s;
}
/** draws the works a page is about to show, a few at a time so the page stays responsive */
async function ready(works: DWork[]) {
  let n = 0;
  for (const w of works) {
    if (made.has(w.id)) continue;
    strokesOf(w);
    if (++n % 4 === 0) await new Promise((r) => setTimeout(r, 0));
  }
}

const strip = <T extends object>(o: T, ...keys: string[]) => {
  const c = { ...o } as Record<string, unknown>;
  keys.forEach((k) => delete c[k]);
  return c as never;
};
const plain = (w: DWork): Work => {
  const { gen: _, ...rest } = w;
  return rest;
};
const pause = () => new Promise((r) => setTimeout(r, 120));
const refuse = (msg: string): never => {
  throw new Error(msg);
};
const me = () => pupilSession.get(true) ?? refuse("Sign in first.");

function info(c: DClass): ClassInfo {
  const S = load();
  const pupils = S.pupils.filter((p) => p.cls === c.id);
  const ids = new Set(pupils.map((p) => p.id));
  return {
    ...c,
    schoolName: S.schools.find((s) => s.id === c.school)?.name ?? "",
    pupils: pupils.length,
    waiting: S.works.filter((w) => ids.has(w.pupil) && w.status === "handed").length,
  };
}

export const demo: SchoolApi = {
  demo: true,
  async mine() {
    const S = load();
    return { schools: S.schools, classes: S.classes.map(info) };
  },
  async registerSchool(name, city) {
    const S = load();
    S.schools.push({ id: uid("s"), name, city, status: "pending", code: `TEACH-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, me: "active", teachers: [{ id: "t-you", name: "You", status: "active", lead: true }] });
    keep();
  },
  async joinSchool() {
    refuse("In the demo you're already a teacher at Sunny Hill School.");
  },
  async decideTeacher(school, teacher, ok) {
    const S = load();
    const sc = S.schools.find((s) => s.id === school)!;
    sc.teachers = ok ? sc.teachers.map((t) => (t.id === teacher ? { ...t, status: "active" } : t)) : sc.teachers.filter((t) => t.id !== teacher);
    keep();
  },
  async newClass(school, name, ages) {
    const S = load();
    const id = uid("c");
    S.classes.push({ id, school, name, ages, code: classCode(hash(id)), archived: false });
    keep();
    return id;
  },
  async classPage(id): Promise<ClassPage> {
    const S = load();
    const c = S.classes.find((x) => x.id === id) ?? refuse("There's no such class in the demo.");
    const pupils = S.pupils.filter((p) => p.cls === id);
    const ids = new Set(pupils.map((p) => p.id));
    const works = S.works.filter((w) => ids.has(w.pupil));
    await ready(works);
    return {
      cls: info(c),
      pupils: pupils.map((p) => strip(p, "cls")),
      tasks: S.tasks.filter((t) => t.cls === id).map((t) => strip(t, "cls")).reverse(),
      works: works.map((w) => plain(w)),
      shows: S.shows.filter((s) => s.cls === id).map((s) => strip(s, "cls")),
    };
  },
  async editClass(id, patch) {
    const c = load().classes.find((x) => x.id === id)!;
    Object.assign(c, patch);
    keep();
  },
  async addPupils(cls, names) {
    const S = load();
    const c = S.classes.find((x) => x.id === cls)!;
    const n = S.pupils.filter((p) => p.cls === cls).length;
    names.forEach((name, i) => S.pupils.push({ id: uid("p"), name, tag: (n + i) % 8, cls, pictures: picturesFor(c.ages, hash(name + Date.now()) + i) }));
    keep();
  },
  async editPupil(id, patch) {
    const S = load();
    const p = S.pupils.find((x) => x.id === id)!;
    if (patch.name) p.name = patch.name;
    if (patch.newPictures) {
      p.pictures = picturesFor(S.classes.find((c) => c.id === p.cls)!.ages, hash(p.name + Date.now()));
      delete S.tries[id];
      p.lockedUntil = null;
    }
    keep();
  },
  async removePupil(id) {
    const S = load();
    S.pupils = S.pupils.filter((p) => p.id !== id);
    const gone = new Set(S.works.filter((w) => w.pupil === id).map((w) => w.id));
    S.works = S.works.filter((w) => !gone.has(w.id));
    S.shows.forEach((s) => (s.works = s.works.filter((w) => !gone.has(w))));
    keep();
  },
  async saveTask(cls, t) {
    const S = load();
    if (t.id) Object.assign(S.tasks.find((x) => x.id === t.id)!, t);
    else S.tasks.push({ ...t, id: uid("t"), cls, open: t.open ?? true, created: iso(Date.now()) });
    keep();
  },
  async removeTask(id) {
    const S = load();
    S.tasks = S.tasks.filter((t) => t.id !== id);
    S.works.forEach((w) => w.task === id && (w.task = null));
    keep();
  },
  async review(id, r) {
    const w = load().works.find((x) => x.id === id)!;
    Object.assign(w, r, { shown: r.status === "reviewed" && r.shown, updated: iso(Date.now()) });
    keep();
  },
  async saveShow(cls, sh) {
    const S = load();
    if (sh.id) {
      const old = S.shows.find((x) => x.id === sh.id)!;
      Object.assign(old, sh);
      keep();
      return old.token;
    }
    const token = `${sh.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "show"}-${Math.random().toString(36).slice(2, 6)}`;
    S.shows.push({ ...sh, id: uid("sh"), cls, token, created: iso(Date.now()) });
    keep();
    return token;
  },
  async removeShow(id) {
    const S = load();
    S.shows = S.shows.filter((s) => s.id !== id);
    keep();
  },
  async strokes(id) {
    const w = load().works.find((x) => x.id === id) ?? refuse("That drawing isn't in the demo any more.");
    return strokesOf(w);
  },
  async showPage(token) {
    const S = load();
    const sh = S.shows.find((s) => s.token === token) ?? refuse("There's no show at this address.");
    const c = S.classes.find((x) => x.id === sh.cls)!;
    const works = sh.works.map((id) => S.works.find((w) => w.id === id)).filter((w): w is DWork => !!w);
    await ready(works);
    return {
      show: strip(sh, "cls"),
      school: S.schools.find((s) => s.id === c.school)?.name ?? "",
      cls: c.name,
      works: works.map((w) => ({ ...plain(w), by: sh.names ? S.pupils.find((p) => p.id === w.pupil)?.name ?? null : null })),
    };
  },
  showStrokes: (_token, work) => demo.strokes(work),
  async door(code) {
    await pause();
    const S = load();
    const c = S.classes.find((x) => x.code === code.trim().toUpperCase() && !x.archived) ?? refuse("No class has that code. Check it with your teacher.");
    return {
      cls: { name: c.name, school: S.schools.find((s) => s.id === c.school)?.name ?? "", ages: c.ages },
      pupils: S.pupils.filter((p) => p.cls === c.id).map(({ id, name, tag }) => ({ id, name, tag })),
    };
  },
  async signIn(code, pupil, pictures) {
    await pause();
    const S = load();
    const c = S.classes.find((x) => x.code === code.trim().toUpperCase()) ?? refuse("No class has that code.");
    const p = S.pupils.find((x) => x.id === pupil && x.cls === c.id) ?? refuse("That name isn't in the class.");
    if (p.lockedUntil && new Date(p.lockedUntil).getTime() > Date.now()) refuse("Too many wrong tries. Ask your teacher, or wait a little.");
    if (pictures.join() !== p.pictures.join()) {
      S.tries[p.id] = (S.tries[p.id] ?? 0) + 1;
      if (S.tries[p.id] >= 5) {
        p.lockedUntil = iso(Date.now() + 15 * 60e3);
        S.tries[p.id] = 0;
      }
      keep();
      refuse("Those aren't your pictures. Try again.");
    }
    delete S.tries[p.id];
    keep();
    pupilSession.set(true, { token: "demo", id: p.id, name: p.name, tag: p.tag, cls: c.id });
  },
  signOut: () => pupilSession.set(true, null),
  async pupilHome() {
    const S = load();
    const s = me();
    const p = S.pupils.find((x) => x.id === s.id) ?? (pupilSession.set(true, null), refuse("Sign in again."));
    const c = S.classes.find((x) => x.id === p.cls)!;
    const mine = S.works.filter((w) => w.pupil === p.id);
    const gallery = S.works.filter((w) => w.shown && w.status === "reviewed" && S.pupils.find((q) => q.id === w.pupil)?.cls === c.id);
    await ready([...mine, ...gallery]);
    return {
      me: { id: p.id, name: p.name, tag: p.tag },
      cls: { name: c.name, school: S.schools.find((x) => x.id === c.school)?.name ?? "", ages: c.ages },
      tasks: S.tasks.filter((t) => t.cls === c.id).map((t) => strip(t, "cls")).reverse(),
      works: mine.map((w) => plain(w)).sort((a: Work, b: Work) => b.updated.localeCompare(a.updated)),
      gallery: gallery.map((w) => ({ ...plain(w), by: S.pupils.find((q) => q.id === w.pupil)?.name ?? null })),
    };
  },
  async startWork(task, shape) {
    const S = load();
    const s = me();
    if (task) {
      const open = S.works.find((w) => w.pupil === s.id && w.task === task && (w.status === "draft" || w.status === "back"));
      if (open) return open.id;
    }
    const t = task ? S.tasks.find((x) => x.id === task) : null;
    const sh: ShapeId = t?.shape ?? shape ?? "land";
    const id = uid("w");
    S.works.push({
      id, pupil: s.id, task, title: t?.title ?? "My drawing", shape: sh, paper: sh.startsWith("px") ? "plain" : "smooth", layers: [BASE_LAYER],
      strokes: 0, minutes: 0, status: "draft", stamps: [], note: "", shown: false, check: null, updated: iso(Date.now()), handed: null,
    });
    keep();
    return id;
  },
  async openWork(id) {
    const S = load();
    const s = me();
    const w = S.works.find((x) => x.id === id && x.pupil === s.id) ?? refuse("That drawing isn't yours, or it's gone.");
    const c = S.classes.find((x) => x.id === s.cls)!;
    return { work: plain(w), task: w.task ? strip(S.tasks.find((t) => t.id === w.task)!, "cls") : null, strokes: strokesOf(w).map((st) => ({ ...st })), ages: c.ages };
  },
  async saveWork(id, d) {
    const S = load();
    const s = me();
    const w = S.works.find((x) => x.id === id && x.pupil === s.id) ?? refuse("That drawing isn't yours.");
    if (w.status === "handed" || w.status === "reviewed") refuse("This drawing is handed in.");
    S.recs[id] = toBase64(encode(d.strokes));
    made.set(id, d.strokes);
    delete w.gen;
    Object.assign(w, { title: d.title.trim().slice(0, 60) || w.title, layers: d.layers, paper: d.paper, minutes: Math.round(d.minutes * 10) / 10, strokes: drawnCount(d.strokes), updated: iso(Date.now()) });
    keep();
  },
  async handIn(id) {
    const S = load();
    const s = me();
    const w = S.works.find((x) => x.id === id && x.pupil === s.id) ?? refuse("That drawing isn't yours.");
    if (!w.strokes && !made.get(id)?.length) refuse("Draw something first.");
    Object.assign(w, { status: "handed", handed: iso(Date.now()), updated: iso(Date.now()), check: "ok" });
    keep();
  },
};

/** For the demo's sign-in page: each class's code, and each pupil's pictures, so whoever is
    showing the demo doesn't need the printed cards. */
export function demoHints() {
  const S = load();
  return {
    codes: S.classes.filter((c) => !c.archived).map((c) => [c.code, c.name, AGES[c.ages].label] as [string, string, string]),
    pictures: Object.fromEntries(S.pupils.map((p) => [p.id, p.pictures])) as Record<string, number[]>,
  };
}
