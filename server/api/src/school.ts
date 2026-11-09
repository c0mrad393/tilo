import { createHmac, randomInt } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { sign, verify } from "hono/jwt";
import type { Sql } from "postgres";
import type { AuthEnv, Member } from "./auth.ts";
import { layersFrom, newId, PAPERS, Refused, SHAPES } from "./pieces.ts";
import { decode, encode, FORMAT, MAX_BYTES } from "./recording.ts";
import { flagged, type PainterThread } from "./screen.ts";
import type { Job, Result } from "./screen/worker.ts";

/* /api/school: Tilo for schools (docs/SCHOOLS.md). Teachers come with their own Tilo account
   (the member check); pupils have no account. They sign in with the class code, their name
   and a picture password, and get a token of their own, signed with a key derived from the
   JWT secret, so neither Auth nor PostgREST nor the member check takes it. A pupil's
   drawings are files under files/school/, which Caddy never serves: their teacher, the pupil
   and (once the teacher shows it) their classmates fetch them here. Handing a drawing in
   runs the same image check the gallery has; a held drawing can't be shown anywhere. */

interface Options {
  member: MiddlewareHandler<AuthEnv>;
  jwtSecret: string;
  filesDir: string;
  thread: PainterThread;
}

/** what a pupil's token stands for, read again from the database on every request */
interface Pupil {
  id: string;
  name: string;
  tag: number;
  class: string;
  cname: string;
  ages: Ages;
  school: string;
}
type Env = { Variables: AuthEnv["Variables"] & { pupil: Pupil } };
type Status = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429;

// kept in step with src/data/school.ts
type Ages = "6-8" | "9-11" | "12-15";
const PICTURES_FOR: Record<Ages, number> = { "6-8": 3, "9-11": 4, "12-15": 4 };
const PRAISE = new Set(["Bold colours", "Careful colouring", "Brave idea", "Good use of space", "Lovely details", "Worked hard"]);
const BASE_LAYER = { id: 0, name: "Layer 1", blend: "source-over", opacity: 1 };
const OPS = new Set(["move", "dup", "merge"]);

const PUPILS_PER_CLASS = 40;
const CLASSES_PER_SCHOOL = 200;
const TASKS_PER_CLASS = 300;
const SHOWS_PER_CLASS = 50;
const WORKS_PER_PUPIL = 400;
const SCHOOLS_PER_MEMBER = 3;
const SESSION_HOURS = 8;
const WRONG_TRIES = 5;

/** wrong class codes and wrong pictures one address may send in ten minutes: a whole class
    signs in from one school address, but a class mistypes a code a few times, not dozens */
const FAILS_PER_ADDRESS = 40;
/** saves one pupil may send in a minute; the studio saves a few seconds after each stroke */
const SAVES_PER_MINUTE = 40;

const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

const WORDS = ["SUN", "MOON", "STAR", "KITE", "FOX", "OWL", "BEE", "SEA", "LEAF", "BOAT", "TREE", "CAT", "BIRD", "FISH", "ROSE", "BEAR"];
const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** what pupils type: a word and four digits, short enough for a six-year-old to copy */
const classCode = () => `${WORDS[randomInt(WORDS.length)]}-${randomInt(1000, 10000)}`;
/** what colleagues type to ask to join: only a request, which a teacher there approves */
const teacherCode = () => `TEACH-${Array.from({ length: 6 }, () => ABC[randomInt(ABC.length)]).join("")}`;
/** a show's address: its title, readable, and eight random letters nobody guesses */
const showToken = (title: string) => {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30).replace(/-$/, "");
  const tail = Array.from({ length: 8 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)]).join("");
  return `${slug || "show"}-${tail}`;
};
/** a picture password: n different pictures out of the twelve, in order */
const newPictures = (ages: Ages) => {
  const left = Array.from({ length: 12 }, (_, i) => i);
  return Array.from({ length: PICTURES_FOR[ages] }, () => left.splice(randomInt(left.length), 1)[0]);
};

/** Inserts with a fresh code until one isn't taken. */
async function withCode<T>(make: () => string, insert: (code: string) => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await insert(make());
    } catch (e) {
      if ((e as { code?: string }).code !== "23505" || i >= 6) throw e;
    }
  }
}

/** Counts per key in a sliding window, in memory: a restart forgets, which is fine here. */
function counter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  const recent = (key: string) => (hits.get(key) ?? []).filter((t) => Date.now() - t < windowMs);
  return {
    full: (key: string) => recent(key).length >= max,
    add(key: string) {
      if (hits.size > 20_000) hits.clear();
      hits.set(key, [...recent(key), Date.now()]);
    },
  };
}
const addressOf = (c: Context) =>
  c.req.header("x-tilo-client-ip") || c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0].trim() || "?";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[a-z0-9]{6,16}$/;
const HEX = /^#[0-9a-f]{6}$/i;

interface TaskFields {
  title: string;
  brief: string;
  shape: string;
  palette: string[] | null;
  due: string | null;
  open: boolean;
}
/** A task as the teacher sent it, or why it can't be one. */
function taskFrom(b: Record<string, unknown>): TaskFields | string {
  const title = text(b.title, 80);
  if (!title) return "Give the task a title.";
  const shape = String(b.shape ?? "land");
  if (!SHAPES.has(shape)) return "Unknown sheet shape.";
  let palette: string[] | null = null;
  if (Array.isArray(b.palette)) {
    palette = [...new Set(b.palette.filter((x): x is string => typeof x === "string" && HEX.test(x)).map((x) => x.toUpperCase()))];
    if (!palette.length || palette.length > 16 || palette.length !== b.palette.length) return "A task's colours are 1 to 16 colours like #E0392B.";
  }
  let due: string | null = null;
  if (b.due) {
    due = String(b.due);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due))) return "The due date should look like 2026-11-14.";
  }
  return { title, brief: text(b.brief, 600), shape, palette, due, open: b.open !== false };
}

export function school(sql: Sql, { member, jwtSecret, filesDir, thread }: Options) {
  const app = new Hono<Env>();
  const signedIn = member as unknown as MiddlewareHandler<Env>;
  // a key only this API holds; Auth's own tokens are signed with the secret itself
  const pupilKey = createHmac("sha256", jwtSecret).update("tilo pupil sessions v1").digest("base64url");
  const dir = join(filesDir, "school");
  const recFile = (work: string) => join(dir, `${work}.tl`);
  const fails = counter(FAILS_PER_ADDRESS, 10 * 60_000);
  const saves = counter(SAVES_PER_MINUTE, 60_000);
  const no = (c: Context, error: string, status: Status) => c.json({ error }, status);
  const body = async (c: Context): Promise<Record<string, unknown>> => {
    const b = await c.req.json().catch(() => null);
    return b && typeof b === "object" && !Array.isArray(b) ? b : {};
  };

  // everything but a saved drawing is a little JSON
  const small = bodyLimit({ maxSize: 32 * 1024, onError: (c) => c.json({ error: "That's more than this takes." }, 413) });
  app.use("*", async (c, next) => (c.req.method === "PUT" ? next() : small(c, next)));

  /* ---------- the columns the app reads ---------- */

  const WORK = sql`w.id, w.pupil, w.task, w.title, w.shape, w.paper, w.layers, w.strokes, w.minutes, w.status, w.stamps, w.note,
    w.shown, w.checked as "check", w.updated, w.handed`;
  const TASK = sql`t.id, t.title, t.brief, t.shape, t.palette, to_char(t.due, 'YYYY-MM-DD') as due, t.open, t.created`;
  const CLASS = sql`c.id, c.school, s.name as "schoolName", c.name, c.ages, c.code, c.archived,
    (select count(*)::int from public.pupils p where p.class = c.id) as pupils,
    (select count(*)::int from public.works w join public.pupils p on p.id = w.pupil where p.class = c.id and w.status = 'handed') as waiting`;
  /** what classmates and show visitors may see: reviewed, chosen and through the check */
  const SEEN = sql`w.status = 'reviewed' and w.checked = 'ok'`;

  /* ---------- teachers ---------- */

  /** the schools a member teaches in and may run classes in */
  const teaching = (me: string) =>
    sql`select t.school from public.teachers t join public.schools s on s.id = t.school where t.member = ${me} and t.status = 'active' and s.status = 'active'`;
  const myClass = async (me: string, id: string | undefined | null) => {
    if (!id) return null;
    const [c] = await sql<{ id: string; school: string; ages: Ages; archived: boolean }[]>`
      select c.id, c.school, c.ages, c.archived from public.classes c where c.id = ${id} and c.school in (${teaching(me)})`;
    return c ?? null;
  };
  /** the class a pupil, task, show or work is in, when the member teaches it */
  const classOf = async (me: string, kind: "pupils" | "tasks" | "shows" | "works", id: string) => {
    if (!ID.test(id)) return null;
    const [row] =
      kind === "works"
        ? await sql<{ class: string }[]>`select p.class from public.works w join public.pupils p on p.id = w.pupil where w.id = ${id}`
        : await sql<{ class: string }[]>`select class from ${sql(`public.${kind}`)} where id = ${id}`;
    return myClass(me, row?.class);
  };

  // a teacher has a handle (so colleagues know who they are) and isn't suspended
  const teacher = createMiddleware<Env>(async (c, next) => {
    const [p] = await sql`select suspended from public.profiles where id = ${c.get("member").id}`;
    if (!p) return no(c, "Pick a handle on your account page first.", 403);
    if (p.suspended) return no(c, "This account is suspended.", 403);
    await next();
  });
  const T = [signedIn, teacher] as const;
  const meOf = (c: Context<Env>) => c.get("member").id;

  app.get("/mine", ...T, async (c) => {
    const me = meOf(c);
    const rows = await sql`
      select s.id, s.name, s.city, s.status, s.code, t.status as me
      from public.teachers t join public.schools s on s.id = t.school where t.member = ${me} order by s.created`;
    const schools = await Promise.all(
      rows.map(async (s) => {
        // until a teacher there approves you, you don't see who teaches there or the code
        if (s.me !== "active") return { ...s, code: "", teachers: [] };
        const teachers = await sql`
          select t.member as id, coalesce(nullif(pr.name, ''), '@' || pr.handle) as name, t.status, t.lead
          from public.teachers t join public.profiles pr on pr.id = t.member where t.school = ${s.id} order by t.created`;
        return { ...s, teachers };
      }),
    );
    const classes = await sql`
      select ${CLASS} from public.classes c join public.schools s on s.id = c.school
      where c.school in (${teaching(me)}) order by c.archived, c.created`;
    return c.json({ schools, classes });
  });

  app.post("/schools", ...T, async (c) => {
    const me = meOf(c);
    const b = await body(c);
    const name = text(b.name, 80), city = text(b.city, 60);
    if (name.length < 2) return no(c, "Type the school's name.", 400);
    const [{ n }] = await sql`select count(*)::int as n from public.schools where created_by = ${me} and status <> 'closed'`;
    if (n >= SCHOOLS_PER_MEMBER) return no(c, `You've registered ${SCHOOLS_PER_MEMBER} schools, which is the most for one account. Write to us if you need more.`, 429);
    const id = newId();
    await sql.begin(async (tx) => {
      await withCode(teacherCode, (code) => tx.savepoint((sp) => sp`insert into public.schools (id, name, city, code, created_by) values (${id}, ${name}, ${city}, ${code}, ${me})`));
      await tx`insert into public.teachers (school, member, status, lead) values (${id}, ${me}, 'active', true)`;
    });
    return c.json({ id }, 201);
  });

  app.post("/schools/join", ...T, async (c) => {
    const me = meOf(c);
    const code = text((await body(c)).code, 20).toUpperCase();
    const [s] = await sql`select id from public.schools where code = ${code} and status <> 'closed'`;
    if (!s) return no(c, "No school has that teacher code. Check it with a teacher there.", 404);
    const [{ n }] = await sql`select count(*)::int as n from public.teachers where member = ${me} and created > now() - interval '1 day'`;
    if (n >= 10) return no(c, "That's a lot of schools for one day. Try again tomorrow.", 429);
    const made = await sql`insert into public.teachers (school, member) values (${s.id}, ${me}) on conflict do nothing returning school`;
    if (!made.length) return no(c, "You're already a teacher there, or waiting to be approved.", 409);
    return c.json({ school: s.id }, 201);
  });

  // a teacher of the school approves a colleague who asked to join, or turns them down
  app.post("/schools/:id/teachers/:teacher", ...T, async (c) => {
    const me = meOf(c);
    const { id, teacher: who } = c.req.param();
    if (!UUID.test(who)) return no(c, "No such teacher.", 404);
    if (who === me) return no(c, "Another teacher there has to approve you.", 400);
    const [mine] = await sql`
      select 1 from public.teachers t join public.schools s on s.id = t.school
      where t.school = ${id} and t.member = ${me} and t.status = 'active' and s.status <> 'closed'`;
    if (!mine) return no(c, "You can only approve colleagues in a school you teach in.", 403);
    const ok = (await body(c)).ok === true;
    const done = ok
      ? await sql`update public.teachers set status = 'active', approved_by = ${me} where school = ${id} and member = ${who} and status = 'pending' returning member`
      : await sql`delete from public.teachers where school = ${id} and member = ${who} and status = 'pending' returning member`;
    if (!done.length) return no(c, "Nobody by that id is waiting to join.", 404);
    return c.body(null, 204);
  });

  app.post("/classes", ...T, async (c) => {
    const me = meOf(c);
    const b = await body(c);
    const schoolId = String(b.school ?? ""), name = text(b.name, 40), ages = String(b.ages) as Ages;
    if (!name) return no(c, "Give the class a name.", 400);
    if (!(ages in PICTURES_FOR)) return no(c, "Pick the pupils' ages.", 400);
    const [ok] = await sql`select 1 from (${teaching(me)}) t where t.school = ${schoolId}`;
    if (!ok) return no(c, "You can make classes once Tilo has checked the school and you teach there.", 403);
    const [{ n }] = await sql`select count(*)::int as n from public.classes where school = ${schoolId}`;
    if (n >= CLASSES_PER_SCHOOL) return no(c, `A school can have ${CLASSES_PER_SCHOOL} classes. Archive old ones, or write to us.`, 429);
    const id = newId();
    await withCode(classCode, (code) => sql`insert into public.classes (id, school, name, ages, code, made_by) values (${id}, ${schoolId}, ${name}, ${ages}, ${code}, ${me})`);
    return c.json({ id }, 201);
  });

  app.get("/classes/:id", ...T, async (c) => {
    const cls = await myClass(meOf(c), c.req.param("id"));
    if (!cls) return no(c, "No class of yours has that id.", 404);
    const [[info], pupils, tasks, works, shows] = await Promise.all([
      sql`select ${CLASS} from public.classes c join public.schools s on s.id = c.school where c.id = ${cls.id}`,
      sql`select id, name, tag, pictures, locked_until as "lockedUntil" from public.pupils where class = ${cls.id} order by created, name`,
      sql`select ${TASK} from public.tasks t where t.class = ${cls.id} order by t.created desc`,
      sql`select ${WORK} from public.works w join public.pupils p on p.id = w.pupil where p.class = ${cls.id} order by w.updated desc`,
      sql`select id, title, about, works, names, token, created from public.shows where class = ${cls.id} order by created desc`,
    ]);
    return c.json({ cls: info, pupils, tasks, works, shows });
  });

  app.patch("/classes/:id", ...T, async (c) => {
    const cls = await myClass(meOf(c), c.req.param("id"));
    if (!cls) return no(c, "No class of yours has that id.", 404);
    const b = await body(c);
    if (b.name !== undefined) {
      const name = text(b.name, 40);
      if (!name) return no(c, "Give the class a name.", 400);
      await sql`update public.classes set name = ${name} where id = ${cls.id}`;
    }
    if (typeof b.archived === "boolean") await sql`update public.classes set archived = ${b.archived} where id = ${cls.id}`;
    return c.body(null, 204);
  });

  app.post("/classes/:id/pupils", ...T, async (c) => {
    const cls = await myClass(meOf(c), c.req.param("id"));
    if (!cls) return no(c, "No class of yours has that id.", 404);
    const raw = (await body(c)).names;
    const names = Array.isArray(raw) ? raw.map((n) => text(n, 40)).filter(Boolean) : [];
    if (!names.length) return no(c, "Type one name a line.", 400);
    const [{ n }] = await sql`select count(*)::int as n from public.pupils where class = ${cls.id}`;
    if (n + names.length > PUPILS_PER_CLASS) return no(c, `A class can have ${PUPILS_PER_CLASS} pupils at most.`, 422);
    await sql.begin(async (tx) => {
      for (const [i, name] of names.entries())
        await tx`insert into public.pupils (id, class, name, tag, pictures)
          values (${newId()}, ${cls.id}, ${name}, ${(n + i) % 8}, ${tx.array(newPictures(cls.ages))}::smallint[])`;
    });
    return c.json({ added: names.length }, 201);
  });

  app.patch("/pupils/:id", ...T, async (c) => {
    const id = c.req.param("id");
    const cls = await classOf(meOf(c), "pupils", id);
    if (!cls) return no(c, "No pupil of yours has that id.", 404);
    const b = await body(c);
    if (b.name !== undefined) {
      const name = text(b.name, 40);
      if (!name) return no(c, "Type the pupil's name.", 400);
      await sql`update public.pupils set name = ${name} where id = ${id}`;
    }
    // new pictures also sign the pupil out everywhere and lift a lock
    if (b.newPictures === true)
      await sql`update public.pupils set pictures = ${sql.array(newPictures(cls.ages))}::smallint[], tries = 0, locked_until = null, session = session + 1 where id = ${id}`;
    return c.body(null, 204);
  });

  // a pupil leaves the class, and their drawings with them
  app.delete("/pupils/:id", ...T, async (c) => {
    const id = c.req.param("id");
    const cls = await classOf(meOf(c), "pupils", id);
    if (!cls) return no(c, "No pupil of yours has that id.", 404);
    const works = (await sql<{ id: string }[]>`select id from public.works where pupil = ${id}`).map((w) => w.id);
    await sql.begin(async (tx) => {
      await tx`delete from public.pupils where id = ${id}`;
      if (works.length)
        await tx`update public.shows set works = array(select x from unnest(works) x where x <> all(${tx.array(works)}::text[])) where class = ${cls.id}`;
    });
    await Promise.all(works.map((w) => rm(recFile(w), { force: true })));
    return c.body(null, 204);
  });

  app.post("/classes/:id/tasks", ...T, async (c) => {
    const cls = await myClass(meOf(c), c.req.param("id"));
    if (!cls) return no(c, "No class of yours has that id.", 404);
    const t = taskFrom(await body(c));
    if (typeof t === "string") return no(c, t, 400);
    const [{ n }] = await sql`select count(*)::int as n from public.tasks where class = ${cls.id}`;
    if (n >= TASKS_PER_CLASS) return no(c, `A class can have ${TASKS_PER_CLASS} tasks. Delete old ones first.`, 429);
    const id = newId();
    await sql`insert into public.tasks (id, class, title, brief, shape, palette, due, open)
      values (${id}, ${cls.id}, ${t.title}, ${t.brief}, ${t.shape}, ${t.palette ? sql.json(t.palette) : null}, ${t.due}, ${t.open})`;
    return c.json({ id }, 201);
  });

  app.patch("/tasks/:id", ...T, async (c) => {
    const id = c.req.param("id");
    if (!(await classOf(meOf(c), "tasks", id))) return no(c, "No task of yours has that id.", 404);
    const t = taskFrom(await body(c));
    if (typeof t === "string") return no(c, t, 400);
    await sql`update public.tasks set title = ${t.title}, brief = ${t.brief}, shape = ${t.shape},
      palette = ${t.palette ? sql.json(t.palette) : null}, due = ${t.due}, open = ${t.open} where id = ${id}`;
    return c.body(null, 204);
  });

  // pupils' drawings for it stay, as their own drawings
  app.delete("/tasks/:id", ...T, async (c) => {
    const id = c.req.param("id");
    if (!(await classOf(meOf(c), "tasks", id))) return no(c, "No task of yours has that id.", 404);
    await sql`delete from public.tasks where id = ${id}`;
    return c.body(null, 204);
  });

  app.post("/works/:id/review", ...T, async (c) => {
    const id = c.req.param("id");
    if (!(await classOf(meOf(c), "works", id))) return no(c, "No pupil's drawing of yours has that id.", 404);
    const b = await body(c);
    const status = b.status === "back" || b.status === "reviewed" ? b.status : null;
    if (!status) return no(c, "Send it back or mark it reviewed.", 400);
    const stamps = Array.isArray(b.stamps) ? [...new Set(b.stamps.filter((s): s is string => typeof s === "string" && PRAISE.has(s)))] : [];
    const note = text(b.note, 400);
    // shown waits for the check: classmates only ever see drawings that passed it
    const shown = status === "reviewed" && b.shown === true;
    const done = await sql`
      update public.works set status = ${status}, stamps = ${sql.array(stamps)}::text[], note = ${note}, shown = ${shown} and checked is distinct from 'held', updated = now()
      where id = ${id} and status <> 'draft' returning id`;
    if (!done.length) return no(c, "This drawing hasn't been handed in yet.", 409);
    return c.body(null, 204);
  });

  /** the works a show may hold: in the class, reviewed and through the check */
  const showFrom = async (cls: string, b: Record<string, unknown>) => {
    const title = text(b.title, 80);
    if (!title) return "Give the show a title.";
    const ids = Array.isArray(b.works) ? [...new Set(b.works.filter((w): w is string => typeof w === "string" && ID.test(w)))] : [];
    if (!ids.length) return "Pick at least one drawing.";
    if (ids.length > 60) return "A show can have 60 drawings at most.";
    const ok = new Set(
      (await sql<{ id: string }[]>`select w.id from public.works w join public.pupils p on p.id = w.pupil where p.class = ${cls} and w.id in ${sql(ids)} and ${SEEN}`).map((w) => w.id),
    );
    if (ok.size !== ids.length) return "Only reviewed drawings that passed the image check can go in a show.";
    return { title, about: text(b.about, 400), works: ids, names: b.names !== false };
  };

  app.post("/classes/:id/shows", ...T, async (c) => {
    const cls = await myClass(meOf(c), c.req.param("id"));
    if (!cls) return no(c, "No class of yours has that id.", 404);
    const s = await showFrom(cls.id, await body(c));
    if (typeof s === "string") return no(c, s, 400);
    const [{ n }] = await sql`select count(*)::int as n from public.shows where class = ${cls.id}`;
    if (n >= SHOWS_PER_CLASS) return no(c, `A class can have ${SHOWS_PER_CLASS} shows. Delete an old one first.`, 429);
    const id = newId();
    const token = await withCode(
      () => showToken(s.title),
      async (token) => {
        await sql`insert into public.shows (id, class, title, about, works, names, token)
          values (${id}, ${cls.id}, ${s.title}, ${s.about}, ${sql.array(s.works)}::text[], ${s.names}, ${token})`;
        return token;
      },
    );
    return c.json({ id, token }, 201);
  });

  app.patch("/shows/:id", ...T, async (c) => {
    const id = c.req.param("id");
    const cls = await classOf(meOf(c), "shows", id);
    if (!cls) return no(c, "No show of yours has that id.", 404);
    const s = await showFrom(cls.id, await body(c));
    if (typeof s === "string") return no(c, s, 400);
    const [row] = await sql`update public.shows set title = ${s.title}, about = ${s.about}, works = ${sql.array(s.works)}::text[], names = ${s.names}
      where id = ${id} returning token`;
    return c.json({ token: row.token });
  });

  app.delete("/shows/:id", ...T, async (c) => {
    const id = c.req.param("id");
    if (!(await classOf(meOf(c), "shows", id))) return no(c, "No show of yours has that id.", 404);
    await sql`delete from public.shows where id = ${id}`;
    return c.body(null, 204);
  });

  /* ---------- pupils ---------- */

  const pupilFrom = async (header: string | undefined): Promise<Pupil | null> => {
    const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return null;
    try {
      const claims = await verify(token, pupilKey, "HS256");
      if (claims.kind !== "pupil" || typeof claims.sub !== "string" || typeof claims.v !== "number") return null;
      const [p] = await sql<Pupil[]>`
        select p.id, p.name, p.tag, p.class, c.name as cname, c.ages, s.name as school
        from public.pupils p join public.classes c on c.id = p.class join public.schools s on s.id = c.school
        where p.id = ${claims.sub} and p.session = ${claims.v} and not c.archived and s.status = 'active'`;
      return p ?? null;
    } catch {
      return null;
    }
  };
  const pupil = createMiddleware<Env>(async (c, next) => {
    const p = await pupilFrom(c.req.header("authorization"));
    if (!p) return no(c, "Sign in again.", 401);
    c.set("pupil", p);
    await next();
  });

  /** a class pupils may sign in to: not archived, in a school that's open */
  const door = async (code: string) => {
    const [cls] = await sql<{ id: string; name: string; ages: Ages; school: string }[]>`
      select c.id, c.name, c.ages, s.name as school from public.classes c join public.schools s on s.id = c.school
      where c.code = ${code.trim().toUpperCase().slice(0, 12)} and not c.archived and s.status = 'active'`;
    return cls ?? null;
  };

  app.get("/door/:code", async (c) => {
    const ip = addressOf(c);
    if (fails.full(ip)) return no(c, "Too many tries from here. Wait a few minutes.", 429);
    const cls = await door(c.req.param("code"));
    if (!cls) {
      fails.add(ip);
      return no(c, "No class has that code. Check it with your teacher.", 404);
    }
    const pupils = await sql`select id, name, tag from public.pupils where class = ${cls.id} order by name`;
    c.header("cache-control", "no-store");
    return c.json({ cls: { name: cls.name, school: cls.school, ages: cls.ages }, pupils });
  });

  app.post("/signin", async (c) => {
    const ip = addressOf(c);
    if (fails.full(ip)) return no(c, "Too many tries from here. Wait a few minutes.", 429);
    const b = await body(c);
    const cls = await door(String(b.code ?? ""));
    if (!cls) {
      fails.add(ip);
      return no(c, "No class has that code.", 404);
    }
    const id = String(b.pupil ?? "");
    const [p] = ID.test(id)
      ? await sql<{ id: string; name: string; tag: number; pictures: number[]; session: number; locked: boolean }[]>`
          select id, name, tag, pictures, session, coalesce(locked_until > now(), false) as locked from public.pupils where id = ${id} and class = ${cls.id}`
      : [];
    if (!p) return no(c, "That name isn't in the class.", 404);
    if (p.locked) return no(c, "Too many wrong tries. Ask your teacher, or wait a little.", 429);
    const pictures = Array.isArray(b.pictures) ? b.pictures : [];
    if (pictures.length !== p.pictures.length || pictures.some((x, i) => x !== p.pictures[i])) {
      fails.add(ip);
      // the fifth wrong try in a row locks the pupil for 15 minutes
      await sql`update public.pupils set
          locked_until = case when tries + 1 >= ${WRONG_TRIES} then now() + interval '15 minutes' else locked_until end,
          tries = case when tries + 1 >= ${WRONG_TRIES} then 0 else tries + 1 end
        where id = ${p.id}`;
      return no(c, "Those aren't your pictures. Try again.", 403);
    }
    await sql`update public.pupils set tries = 0, locked_until = null where id = ${p.id}`;
    const token = await sign({ kind: "pupil", sub: p.id, cls: cls.id, v: p.session, exp: Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600 }, pupilKey, "HS256");
    return c.json({ token, id: p.id, name: p.name, tag: p.tag, cls: cls.id });
  });

  app.get("/pupil", pupil, async (c) => {
    const me = c.get("pupil");
    const [tasks, works, gallery] = await Promise.all([
      sql`select ${TASK} from public.tasks t where t.class = ${me.class} order by t.created desc`,
      sql`select ${WORK} from public.works w where w.pupil = ${me.id} order by w.updated desc`,
      sql`select ${WORK}, p.name as by from public.works w join public.pupils p on p.id = w.pupil
          where p.class = ${me.class} and w.shown and ${SEEN} order by w.updated desc limit 200`,
    ]);
    c.header("cache-control", "no-store");
    return c.json({ me: { id: me.id, name: me.name, tag: me.tag }, cls: { name: me.cname, school: me.school, ages: me.ages }, tasks, works, gallery });
  });

  // the pupil's drawing for a task (made the first time), or a new drawing of their own
  app.post("/pupil/works", pupil, async (c) => {
    const me = c.get("pupil");
    const b = await body(c);
    const taskId = typeof b.task === "string" ? b.task : null;
    let title = "My drawing", shape = SHAPES.has(String(b.shape)) ? String(b.shape) : "land";
    if (taskId) {
      const [t] = ID.test(taskId) ? await sql`select id, title, shape, open from public.tasks where id = ${taskId} and class = ${me.class}` : [];
      if (!t) return no(c, "That task isn't in your class any more.", 404);
      const [open] = await sql`select id from public.works where pupil = ${me.id} and task = ${t.id} and status in ('draft', 'back') order by created limit 1`;
      if (open) return c.json({ id: open.id });
      if (!t.open) return no(c, "Your teacher has closed this task.", 409);
      title = t.title.slice(0, 60);
      shape = t.shape;
    }
    const [{ n }] = await sql`select count(*)::int as n from public.works where pupil = ${me.id}`;
    if (n >= WORKS_PER_PUPIL) return no(c, "You have so many drawings there's no room for more. Ask your teacher.", 429);
    const id = newId();
    await sql`insert into public.works (id, pupil, task, title, shape, paper, layers)
      values (${id}, ${me.id}, ${taskId}, ${title}, ${shape}, ${shape.startsWith("px") ? "plain" : "smooth"}, ${sql.json([BASE_LAYER])})`;
    return c.json({ id }, 201);
  });

  app.get("/pupil/works/:id", pupil, async (c) => {
    const me = c.get("pupil");
    const [work] = await sql`select ${WORK} from public.works w where w.id = ${c.req.param("id")} and w.pupil = ${me.id}`;
    if (!work) return no(c, "That drawing isn't yours, or it's gone.", 404);
    const [task] = work.task ? await sql`select ${TASK} from public.tasks t where t.id = ${work.task}` : [];
    c.header("cache-control", "no-store");
    return c.json({ work, task: task ?? null, ages: me.ages });
  });

  // multipart form: "meta" (JSON: title, layers, paper, minutes) and "rec" (the recording)
  app.put(
    "/pupil/works/:id",
    pupil,
    bodyLimit({ maxSize: MAX_BYTES + 64 * 1024, onError: (c) => c.json({ error: "A drawing can be 2 MB at most." }, 413) }),
    async (c) => {
      const me = c.get("pupil");
      const id = c.req.param("id");
      if (saves.full(me.id)) return no(c, "Saving too often. It will save again in a moment.", 429);
      saves.add(me.id);
      try {
        const [work] = await sql`select id, title, status from public.works where id = ${id} and pupil = ${me.id}`;
        if (!work) throw new Refused("That drawing isn't yours, or it's gone.", 422);
        if (work.status === "handed" || work.status === "reviewed") return no(c, "This drawing is handed in.", 409);
        const form = await c.req.formData().catch(() => null);
        const rec = form?.get("rec"), meta = form?.get("meta");
        if (!(rec instanceof File) || typeof meta !== "string") throw new Refused("Send meta and rec as a form.", 400);
        let fields: Record<string, unknown>;
        try {
          fields = JSON.parse(meta);
        } catch {
          throw new Refused("meta isn't JSON.", 400);
        }
        const bytes = new Uint8Array(await rec.arrayBuffer());
        if (bytes.length > MAX_BYTES) throw new Refused("A drawing can be 2 MB at most.", 413);
        let strokes;
        try {
          strokes = decode(bytes);
        } catch {
          throw new Refused("That isn't a Tilo recording.");
        }
        if (bytes[2] > FORMAT) throw new Refused("The recording is newer than this server. Reload Tilo and try again.");
        const layers = layersFrom(fields.layers);
        const ids = new Set(layers.length ? layers.map((l) => l.id) : [0]);
        if (strokes.some((s) => !ids.has(s.l ?? 0) || (s.src !== undefined && !ids.has(s.src)))) throw new Refused("A stroke sits on a layer the drawing doesn't have.");
        const paper = String(fields.paper ?? "smooth");
        if (!PAPERS.has(paper)) throw new Refused("Unknown paper.", 400);
        const minutes = Number(fields.minutes);
        if (!Number.isFinite(minutes) || minutes < 0 || minutes > 100 * 60) throw new Refused("The drawing time doesn't make sense.", 400);
        const title = text(fields.title, 60) || work.title;
        const drawn = strokes.filter((s) => !OPS.has(s.tool)).length;

        // the file first, put in place only if the drawing is still open when the row changes
        await mkdir(dir, { recursive: true });
        const file = recFile(id);
        await writeFile(`${file}.part`, bytes);
        const done = await sql`
          update public.works set title = ${title}, layers = ${sql.json(layers.length ? (layers as never) : [BASE_LAYER])}, paper = ${paper},
            minutes = ${Math.round(minutes * 10) / 10}, strokes = ${drawn}, bytes = ${bytes.length}, updated = now()
          where id = ${id} and status in ('draft', 'back') returning id`;
        if (!done.length) {
          await rm(`${file}.part`, { force: true });
          return no(c, "This drawing is handed in.", 409);
        }
        await rename(`${file}.part`, file);
        return c.body(null, 204);
      } catch (e) {
        if (e instanceof Refused) return no(c, e.message, e.status);
        throw e;
      }
    },
  );

  app.post("/pupil/works/:id/hand-in", pupil, async (c) => {
    const me = c.get("pupil");
    const id = c.req.param("id");
    const done = await sql`
      update public.works set status = 'handed', handed = now(), updated = now(), checked = 'waiting', shown = false
      where id = ${id} and pupil = ${me.id} and status in ('draft', 'back') and strokes > 0 returning id`;
    if (!done.length) {
      const [w] = await sql`select status, strokes from public.works where id = ${id} and pupil = ${me.id}`;
      if (!w) return no(c, "That drawing isn't yours, or it's gone.", 404);
      return w.strokes ? no(c, "It's handed in already.", 409) : no(c, "Draw something first.", 422);
    }
    checks.add(id);
    return c.body(null, 204);
  });

  /* ---------- recordings and shows ---------- */

  const recording = async (c: Context, work: string) => {
    const bytes = await readFile(recFile(work)).catch(() => null);
    c.header("cache-control", "private, no-store");
    c.header("content-type", "application/octet-stream");
    // a drawing nobody has drawn on yet has no file: an empty recording says so
    return c.body(bytes ?? Buffer.from(encode([])));
  };

  // for the pupil who drew it, a classmate once it's shown, or a teacher of the class
  app.get("/works/:id/rec", async (c) => {
    const id = c.req.param("id");
    const header = c.req.header("authorization");
    const [w] = ID.test(id)
      ? await sql`select w.pupil, p.class, w.shown and ${SEEN} as seen from public.works w join public.pupils p on p.id = w.pupil where w.id = ${id}`
      : [];
    const me = await pupilFrom(header);
    let allowed = false;
    if (me) allowed = !!w && (w.pupil === me.id || (w.class === me.class && w.seen));
    else {
      const m = await memberFrom(header);
      if (!m) return no(c, "Sign in first.", 401);
      allowed = !!w && !!(await myClass(m.id, w.class));
    }
    if (!allowed) return no(c, "No such drawing, or it isn't yours to see.", 404);
    return recording(c, id);
  });
  const memberFrom = async (header: string | undefined): Promise<Member | null> => {
    const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
    try {
      const claims = await verify(token, jwtSecret, { alg: "HS256", aud: "authenticated" });
      if (claims.role !== "authenticated" || typeof claims.sub !== "string") return null;
      return { id: claims.sub, email: "" };
    } catch {
      return null;
    }
  };

  /** a show by its address, with the drawings that may still be in it, in its order */
  const showByToken = async (token: string) => {
    if (!/^[a-z0-9-]{8,48}$/.test(token)) return null;
    const [sh] = await sql`
      select sh.id, sh.title, sh.about, sh.works, sh.names, sh.token, sh.created, sh.class, c.name as cls, s.name as school
      from public.shows sh join public.classes c on c.id = sh.class join public.schools s on s.id = c.school
      where sh.token = ${token} and s.status = 'active'`;
    if (!sh) return null;
    const rows = sh.works.length
      ? await sql`select ${WORK}, p.name as by from public.works w join public.pupils p on p.id = w.pupil
          where w.id in ${sql(sh.works as string[])} and p.class = ${sh.class} and ${SEEN}`
      : [];
    const works = (sh.works as string[]).map((id) => rows.find((r) => r.id === id)).filter((w) => !!w);
    return { sh, works };
  };

  // anyone with a show's link: for parents; never listed, and asked not to be indexed
  app.get("/shows/:token", async (c) => {
    const found = await showByToken(c.req.param("token"));
    if (!found) return no(c, "There's no show at this address.", 404);
    const { sh, works } = found;
    c.header("x-robots-tag", "noindex");
    c.header("cache-control", "no-store");
    return c.json({
      show: { id: sh.id, title: sh.title, about: sh.about, works: works.map((w) => w.id), names: sh.names, token: sh.token, created: sh.created },
      school: sh.school,
      cls: sh.cls,
      works: works.map((w) => ({ ...w, by: sh.names ? w.by : null })),
    });
  });

  app.get("/shows/:token/rec/:work", async (c) => {
    const found = await showByToken(c.req.param("token"));
    const work = c.req.param("work");
    if (!found?.works.some((w) => w.id === work)) return no(c, "That drawing isn't in this show.", 404);
    c.header("x-robots-tag", "noindex");
    return recording(c, work);
  });

  /* ---------- the image check, one handed-in drawing at a time ---------- */

  const checks = (() => {
    const waiting: string[] = [];
    let busy = false;
    const check = async (id: string) => {
      const [w] = await sql`select paper, shape, layers, handed::text as at from public.works where id = ${id} and checked = 'waiting'`;
      if (!w) return;
      const job: Job = { id: `school-${id}`, rec: recFile(id), paper: w.paper, shape: w.shape, layers: w.layers };
      const r = await thread.run<Result>(job);
      // handed in again while this ran: the newer hand-in has its own check queued
      if ("error" in r) {
        console.error(`check of school work ${id} failed: ${r.error}`);
        await sql`update public.works set checked = 'held', shown = false, screen = ${sql.json({ error: r.error })} where id = ${id} and handed::text = ${w.at}`;
        return;
      }
      const held = flagged(r.scores);
      await sql`update public.works set checked = ${held ? "held" : "ok"}, shown = shown and ${!held}, screen = ${sql.json(r.scores as never)}
        where id = ${id} and handed::text = ${w.at}`;
    };
    const next = async () => {
      if (busy) return;
      busy = true;
      try {
        for (let id; (id = waiting.shift()); ) {
          try {
            await check(id);
          } catch (e) {
            console.error(`check of school work ${id} failed:`, e);
          }
        }
      } finally {
        busy = false;
      }
    };
    return {
      add(id: string) {
        if (!waiting.includes(id)) waiting.push(id);
        void next();
      },
      async resume() {
        await mkdir(dir, { recursive: true });
        for (const { id } of await sql`select id from public.works where checked = 'waiting' order by handed`) this.add(id);
      },
    };
  })();

  return { app, resume: () => checks.resume() };
}
