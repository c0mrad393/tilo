import { useLocation } from "react-router";
import { useSyncExternalStore } from "react";
import { decode, encode } from "../engine/codec";
import type { PaperId } from "../engine/paper";
import type { LayerDef, ShapeId, Stroke } from "../engine/stroke";
import { request, ServerError } from "./account";

/* Tilo for schools (docs/SCHOOLS.md). Teachers run classes with their own Tilo account;
   pupils sign in with a class code, their name and a picture password, and their work is
   kept on the server, private to the class. Everything goes through a SchoolApi: the real
   one talks to /api/school, the demo one (school-demo.ts) keeps a made-up school in the
   browser, so the same pages run both. */

export type Ages = "6-8" | "9-11" | "12-15";
export const AGES: Record<Ages, { label: string; pictures: number; simple: boolean }> = {
  "6-8": { label: "Ages 6 to 8", pictures: 3, simple: true },
  "9-11": { label: "Ages 9 to 11", pictures: 4, simple: true },
  "12-15": { label: "Ages 12 to 15", pictures: 4, simple: false },
};
export const AGE_IDS = Object.keys(AGES) as Ages[];

/** the twelve pictures a password is made of, in the order they are shown */
export const PICTURES = ["sun", "moon", "star", "cloud", "tree", "flower", "fish", "cat", "bird", "boat", "house", "apple"] as const;
export type PictureId = (typeof PICTURES)[number];

/** what a teacher can stamp on a pupil's work */
export const PRAISE = ["Bold colours", "Careful colouring", "Brave idea", "Good use of space", "Lovely details", "Worked hard"] as const;

/** the colours a pupil's name tag can have, by pupil */
export const TAGS = ["#E0392B", "#F2861E", "#D9A21B", "#2E9B47", "#1F8A8A", "#2C64D4", "#7A4BC4", "#C2457F"];

export interface Teacher {
  id: string;
  name: string;
  status: "pending" | "active";
  lead: boolean;
}
export interface School {
  id: string;
  name: string;
  city: string;
  status: "pending" | "active" | "closed";
  /** the code another teacher of the school types to ask to join */
  code: string;
  /** your place in it */
  me: "active" | "pending";
  teachers: Teacher[];
}
export interface ClassInfo {
  id: string;
  school: string;
  schoolName: string;
  name: string;
  ages: Ages;
  /** what pupils type to sign in */
  code: string;
  archived: boolean;
  pupils: number;
  /** handed in and not reviewed yet */
  waiting: number;
}
export interface Pupil {
  id: string;
  name: string;
  /** index into TAGS */
  tag: number;
  /** the picture password, indexes into PICTURES; only teachers see it */
  pictures?: number[];
  /** too many wrong tries: signing in waits until then */
  lockedUntil?: string | null;
}
export interface TaskDraft {
  title: string;
  brief: string;
  shape: ShapeId;
  /** a fixed set of colours, or none for the usual crayon box */
  palette: string[] | null;
  /** YYYY-MM-DD */
  due: string | null;
}
export interface Task extends TaskDraft {
  id: string;
  open: boolean;
  created: string;
}
export type WorkStatus = "draft" | "handed" | "back" | "reviewed";
export interface Work {
  id: string;
  pupil: string;
  /** null for a pupil's own drawing */
  task: string | null;
  title: string;
  shape: ShapeId;
  paper: PaperId;
  layers: LayerDef[];
  strokes: number;
  minutes: number;
  status: WorkStatus;
  stamps: string[];
  note: string;
  /** in the class gallery */
  shown: boolean;
  /** the image check, run when the work is handed in */
  check: "waiting" | "ok" | "held" | null;
  updated: string;
  handed: string | null;
}
export interface Show {
  id: string;
  title: string;
  about: string;
  works: string[];
  /** pupils' names under their work */
  names: boolean;
  /** the show's address: /show/{token} */
  token: string;
  created: string;
}
export interface ClassPage {
  cls: ClassInfo;
  pupils: Pupil[];
  tasks: Task[];
  works: Work[];
  shows: Show[];
}
export interface Door {
  cls: { name: string; school: string; ages: Ages };
  pupils: Pick<Pupil, "id" | "name" | "tag">[];
}
export type ByWork = Work & { by: string | null };
export interface PupilHome {
  me: Pick<Pupil, "id" | "name" | "tag">;
  cls: { name: string; school: string; ages: Ages };
  tasks: Task[];
  works: Work[];
  gallery: ByWork[];
}
export interface ShowPage {
  show: Show;
  school: string;
  cls: string;
  works: ByWork[];
}
export interface OpenWork {
  work: Work;
  task: Task | null;
  strokes: Stroke[];
  ages: Ages;
}
export interface Draft {
  title: string;
  strokes: Stroke[];
  layers: LayerDef[];
  paper: PaperId;
  minutes: number;
}

export interface SchoolApi {
  readonly demo: boolean;
  // ---- teachers ----
  mine(): Promise<{ schools: School[]; classes: ClassInfo[] }>;
  registerSchool(name: string, city: string): Promise<void>;
  joinSchool(code: string): Promise<void>;
  decideTeacher(school: string, teacher: string, ok: boolean): Promise<void>;
  newClass(school: string, name: string, ages: Ages): Promise<string>;
  classPage(id: string): Promise<ClassPage>;
  editClass(id: string, patch: { name?: string; archived?: boolean }): Promise<void>;
  addPupils(cls: string, names: string[]): Promise<void>;
  editPupil(id: string, patch: { name?: string; newPictures?: true }): Promise<void>;
  removePupil(id: string): Promise<void>;
  saveTask(cls: string, task: TaskDraft & { id?: string; open?: boolean }): Promise<void>;
  removeTask(id: string): Promise<void>;
  review(work: string, r: { stamps: string[]; note: string; status: "back" | "reviewed"; shown: boolean }): Promise<void>;
  saveShow(cls: string, show: { id?: string; title: string; about: string; works: string[]; names: boolean }): Promise<string>;
  removeShow(id: string): Promise<void>;
  // ---- anyone allowed to see the work: its teacher, its pupil, a classmate once shown ----
  strokes(work: string): Promise<Stroke[]>;
  showPage(token: string): Promise<ShowPage>;
  /** a work in a show, for anyone with the show's link */
  showStrokes(token: string, work: string): Promise<Stroke[]>;
  // ---- pupils ----
  door(code: string): Promise<Door>;
  signIn(code: string, pupil: string, pictures: number[]): Promise<void>;
  signOut(): void;
  pupilHome(): Promise<PupilHome>;
  /** the pupil's draft for a task, made if there isn't one; task null starts an own drawing */
  startWork(task: string | null, shape?: ShapeId): Promise<string>;
  openWork(id: string): Promise<OpenWork>;
  saveWork(id: string, d: Draft): Promise<void>;
  handIn(id: string): Promise<void>;
}

/* ---- lessons a teacher can start a task from ---- */

export interface Lesson extends TaskDraft {
  id: string;
  ages: Ages[];
}
export const LESSONS: Lesson[] = [
  { id: "house", title: "My house", brief: "Draw the house you live in, or one you'd like to. What's around it: a tree, the sun, a garden?", shape: "land", palette: null, due: null, ages: ["6-8", "9-11"] },
  { id: "pet", title: "My pet", brief: "Draw a cat, a dog or any animal you love. Give it a face that shows how it feels.", shape: "land", palette: null, due: null, ages: ["6-8", "9-11"] },
  { id: "mirror", title: "A mirror butterfly", brief: "Open Sheet and turn on Mirror. Draw one half of a butterfly and watch the other half appear.", shape: "land", palette: null, due: null, ages: ["6-8", "9-11"] },
  { id: "sea", title: "Under the sea", brief: "Fish, weed, shells, a boat on top. Colour the water all the way to the edges.", shape: "land", palette: null, due: null, ages: ["6-8", "9-11"] },
  { id: "warmcold", title: "Warm and cold", brief: "A sky in warm colours over land in cold ones. Use only the colours given.", shape: "land", palette: ["#F6CB2C", "#F2861E", "#E0392B", "#EF79AE", "#7A4BC4", "#22306E", "#2C64D4", "#1F8A8A", "#FFFFFF"], due: null, ages: ["9-11", "12-15"] },
  { id: "fruit", title: "Fruit in 16 × 16", brief: "A pixel fruit on a 16 by 16 grid. Outline it first, then fill it in. Add one light cell for the shine.", shape: "px16", palette: null, due: null, ages: ["9-11", "12-15"] },
  { id: "creature", title: "A creature on 32 × 32", brief: "Invent a creature. Turn on Mirror so both sides match, then give it eyes, a mouth and a colour of its own.", shape: "px32", palette: null, due: null, ages: ["9-11", "12-15"] },
  { id: "city", title: "My city at night", brief: "A city at night on 64 by 48 cells: buildings, lit windows, the moon. Darker colours at the top of the sky.", shape: "pxland", palette: null, due: null, ages: ["12-15"] },
  { id: "street", title: "Our street", brief: "Draw the street outside the school, or your own. Houses, balconies, trees, cars, people.", shape: "land", palette: null, due: null, ages: ["9-11", "12-15"] },
  { id: "portrait", title: "A friend's portrait", brief: "Draw a classmate's face from looking, not from memory. Start with the shape of the head.", shape: "port", palette: null, due: null, ages: ["12-15"] },
];

/* ---- the pupil's session: kept for this tab only, since school computers are shared ---- */

export interface PupilSession {
  token: string;
  id: string;
  name: string;
  tag: number;
  cls: string;
}
const sessionKey = (demo: boolean) => (demo ? "tilo.demo.pupil" : "tilo.pupil");
const subs = new Set<() => void>();
const sessions: Record<string, PupilSession | null | undefined> = {};
export const pupilSession = {
  get(demo: boolean): PupilSession | null {
    const k = sessionKey(demo);
    if (sessions[k] === undefined) {
      try {
        sessions[k] = JSON.parse(sessionStorage.getItem(k) ?? "null");
      } catch {
        sessions[k] = null;
      }
    }
    return sessions[k] ?? null;
  },
  set(demo: boolean, s: PupilSession | null) {
    const k = sessionKey(demo);
    sessions[k] = s;
    try {
      if (s) sessionStorage.setItem(k, JSON.stringify(s));
      else sessionStorage.removeItem(k);
    } catch {
      // storage off: the session lasts until the page closes
    }
    subs.forEach((f) => f());
  },
};
export const usePupil = (demo: boolean) =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => pupilSession.get(demo),
  );

/* ---- the real thing: /api/school ---- */

async function pupilCall<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const s = pupilSession.get(false);
  const headers = new Headers(init.headers);
  if (s) headers.set("authorization", `Bearer ${s.token}`);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  const res = await fetch(`/api/school${path}`, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  if (res.status === 401 && s) pupilSession.set(false, null);
  if (!res.ok) {
    const b = await res.json().catch(() => null);
    throw new ServerError(b?.error ?? `The server answered ${res.status}.`, res.status);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
async function teacherCall<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const res = await request(`/api/school${path}`, init);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}
const recCache = new Map<string, Promise<Stroke[]>>();

const live: SchoolApi = {
  demo: false,
  mine: () => teacherCall("/mine"),
  registerSchool: (name, city) => teacherCall("/schools", { method: "POST", json: { name, city } }),
  joinSchool: (code) => teacherCall("/schools/join", { method: "POST", json: { code } }),
  decideTeacher: (school, teacher, ok) => teacherCall(`/schools/${school}/teachers/${teacher}`, { method: "POST", json: { ok } }),
  newClass: (school, name, ages) => teacherCall<{ id: string }>("/classes", { method: "POST", json: { school, name, ages } }).then((r) => r.id),
  classPage(id) {
    // a pupil may have drawn more since: the teacher's copies are fetched again
    for (const k of recCache.keys()) if (k.startsWith("t:")) recCache.delete(k);
    return teacherCall(`/classes/${id}`);
  },
  editClass: (id, patch) => teacherCall(`/classes/${id}`, { method: "PATCH", json: patch }),
  addPupils: (cls, names) => teacherCall(`/classes/${cls}/pupils`, { method: "POST", json: { names } }),
  editPupil: (id, patch) => teacherCall(`/pupils/${id}`, { method: "PATCH", json: patch }),
  removePupil: (id) => teacherCall(`/pupils/${id}`, { method: "DELETE" }),
  saveTask: (cls, task) => teacherCall(task.id ? `/tasks/${task.id}` : `/classes/${cls}/tasks`, { method: task.id ? "PATCH" : "POST", json: task }),
  removeTask: (id) => teacherCall(`/tasks/${id}`, { method: "DELETE" }),
  review: (work, r) => teacherCall(`/works/${work}/review`, { method: "POST", json: r }),
  saveShow: (cls, show) => teacherCall<{ token: string }>(show.id ? `/shows/${show.id}` : `/classes/${cls}/shows`, { method: show.id ? "PATCH" : "POST", json: show }).then((r) => r.token),
  removeShow: (id) => teacherCall(`/shows/${id}`, { method: "DELETE" }),
  strokes(work) {
    // pupils' pages ask with the pupil's session, teachers' pages with their Tilo account (a
    // teacher may have tried signing in as a pupil in the same tab)
    const pupil = location.pathname.startsWith("/class") ? pupilSession.get(false) : null;
    const key = `${pupil ? "p" : "t"}:${work}`;
    let p = recCache.get(key);
    if (!p) {
      const fetchRec = pupil
        ? fetch(`/api/school/works/${work}/rec`, { headers: { authorization: `Bearer ${pupil.token}` } })
        : request(`/api/school/works/${work}/rec`);
      p = Promise.resolve(fetchRec).then(async (res) => {
        if (!res.ok) throw new ServerError("The drawing couldn't be fetched.", res.status);
        return decode(new Uint8Array(await res.arrayBuffer()));
      });
      p.catch(() => recCache.delete(key));
      recCache.set(key, p);
    }
    return p;
  },
  showPage: (token) => pupilCall(`/shows/${encodeURIComponent(token)}`),
  showStrokes: (token, work) =>
    fetch(`/api/school/shows/${encodeURIComponent(token)}/rec/${work}`).then(async (res) => {
      if (!res.ok) throw new ServerError("The drawing couldn't be fetched.", res.status);
      return decode(new Uint8Array(await res.arrayBuffer()));
    }),
  door: (code) => pupilCall(`/door/${encodeURIComponent(code.trim().toUpperCase())}`),
  async signIn(code, pupil, pictures) {
    const s = await pupilCall<PupilSession>("/signin", { method: "POST", json: { code: code.trim().toUpperCase(), pupil, pictures } });
    recCache.clear();
    pupilSession.set(false, s);
  },
  signOut() {
    recCache.clear();
    pupilSession.set(false, null);
  },
  pupilHome: () => pupilCall("/pupil"),
  startWork: (task, shape) => pupilCall<{ id: string }>("/pupil/works", { method: "POST", json: { task, shape } }).then((r) => r.id),
  async openWork(id) {
    const w = await pupilCall<Omit<OpenWork, "strokes">>(`/pupil/works/${id}`);
    recCache.delete(`p:${id}`);
    const strokes = w.work.strokes ? await live.strokes(id) : [];
    return { ...w, strokes };
  },
  async saveWork(id, d) {
    const form = new FormData();
    form.set("meta", JSON.stringify({ title: d.title, layers: d.layers, paper: d.paper, minutes: d.minutes }));
    form.set("rec", new Blob([encode(d.strokes) as BlobPart]), "rec.tl");
    recCache.delete(`p:${id}`);
    await pupilCall(`/pupil/works/${id}`, { method: "PUT", body: form });
  },
  handIn: (id) => pupilCall(`/pupil/works/${id}/hand-in`, { method: "POST" }),
};

/** The demo, loaded the first time a /demo page asks for it (its drawings are made in code). */
let demoApi: Promise<SchoolApi> | null = null;
const loadDemo = () => (demoApi ??= import("./school-demo").then((m) => m.demo));

/** Pages under /demo use the demo school; the rest use the real one. */
export const useDemo = () => useLocation().pathname.startsWith("/demo");
export const schoolApi = (demo: boolean): Promise<SchoolApi> => (demo ? loadDemo() : Promise.resolve(live));
/** Where a schools page lives, under /demo for the demo. */
export const at = (demo: boolean, path: string) => (demo ? `/demo${path}` : path);

/* ---- small things the pages share ---- */

export const STATUS_LABEL: Record<WorkStatus, string> = { draft: "Still drawing", handed: "Handed in", back: "Sent back", reviewed: "Reviewed" };
export const isPixelTask = (t: Pick<TaskDraft, "shape">) => t.shape.startsWith("px");
/** "Due Friday 14 November", "Due today", "Was due 3 November" */
export function dueLabel(due: string | null, now = new Date()) {
  if (!due) return "";
  const d = new Date(`${due}T23:59:59`);
  const today = now.toISOString().slice(0, 10);
  if (due === today) return "Due today";
  const f = new Intl.DateTimeFormat("en-GB", { weekday: d.getTime() - now.getTime() < 6 * 864e5 ? "long" : undefined, day: "numeric", month: "long" }).format(d);
  return d < now ? `Was due ${f}` : `Due ${f}`;
}
export const ago = (iso: string, now = Date.now()) => {
  const s = (now - new Date(iso).getTime()) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 86400 * 1.5) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
};
export const encodeRec = (s: Stroke[]) => encode(s);
