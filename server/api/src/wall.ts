import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import type { Row, Sql } from "postgres";
import {
  markBox,
  overlaps,
  themeById,
  themeFor,
  WALL_BURST,
  WALL_DAYS,
  WALL_PER_MEMBER,
  wallStroke,
  wallStrokeProblem,
  type WallStroke,
} from "../../../src/data/wall.ts";
import type { AuthEnv } from "./auth.ts";
import type { Purge } from "./files.ts";
import type { PainterThread } from "./screen.ts";
import type { Tile, WallJob, WallResult } from "./screen/worker.ts";

/* /api/wall: the shared wall on the home page. One wall is up at a time. Members add marks
   to it (POST /marks); anyone can look. The worker thread keeps the live wall drawn: every
   little while it adds the new marks, checks the parts of the wall they touched with the same
   image check pieces get, and writes the wall's picture, which new visitors load before the
   marks made since. Marks in a part the check flags are held for a mod, and the wall is drawn
   again without them. Every WALL_DAYS days, at midnight in Tbilisi, the wall closes: its
   last picture goes into the archive (/past) and the next subject goes up.
   Its pictures are files/wall/{no}.webp and {no}-s.webp (small), served from here. */

interface Options {
  member: MiddlewareHandler<AuthEnv>;
  filesDir: string;
  thread: PainterThread;
  site: string;
  purge: Purge;
}

/** how long new marks wait before the wall is drawn and checked; a burst goes in one go */
const SETTLE_MS = Number(process.env.WALL_SETTLE_MS ?? 30_000);
const TICK_MS = 5_000;
/** marks on one wall in all; past this it's full until the next one */
const WALL_MAX = 60_000;
/** the scores that hold a part of the wall: a piece's (screen.ts), and clearly more than the
    subject's own outline scores there, so a busy outline doesn't hold everyone's marks */
const flagged = (t: Tile) => (t.explicit >= 0.25 && t.explicit - t.base.explicit >= 0.12) || (t.sexy >= 0.4 && t.sexy - t.base.sexy >= 0.15);

type Mark = { id: number; s: WallStroke };
const imgUrl = (no: number, small = false) => `/api/wall/img/${no}${small ? "-s" : ""}.webp`;

export function wall(sql: Sql, { member, filesDir, thread, site, purge }: Options) {
  const dir = join(filesDir, "wall");
  const file = (no: number, small = false) => join(dir, `${no}${small ? "-s" : ""}.webp`);
  const app = new Hono<AuthEnv>();

  /* ---- the worker's copy of the live wall ---- */

  // every change to the wall's picture goes through here, one at a time
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>) => {
    const p = chain.then(fn);
    chain = p.catch(() => {});
    return p;
  };
  /** the wall the worker has drawn, and the last mark in it; null: it has none */
  let drawn: { no: number; upto: number } | null = null;
  let jobs = 0;
  /** when the oldest mark not yet drawn arrived */
  let waitingSince = 0;

  const job = async (j: Omit<WallJob, "kind" | "id">) => {
    const full: WallJob = { kind: "wall", id: `wall-${++jobs}`, ...j };
    const r = await thread.run<WallResult>(full);
    if ("error" in r) throw new Error(`the wall didn't draw: ${r.error}`);
    return r.tiles;
  };
  const live = async () => (await sql<{ no: number; theme: string; rev: number }[]>`select no, theme, rev from public.walls where status = 'live'`)[0];
  const marksOf = (no: number, after = 0) =>
    sql<Mark[]>`select id::int, stroke as s from public.wall_marks where wall = ${no} and status = 'live' and id > ${after} order by id`;

  /** Draws a wall again from its outline and its live marks, and writes its pictures. With
      `check`, the whole wall is checked too, and what the check flags is held. */
  const redraw = async (no: number, theme: string, check = false): Promise<number> => {
    const marks = await marksOf(no);
    await mkdir(dir, { recursive: true });
    // the worker keeps one wall; drawing another one means the live wall starts again later
    drawn = null;
    const tiles = await job({ no, theme, reset: true, strokes: marks.map((m) => m.s), check: false, checkAll: check, out: file(no), thumb: file(no, true) });
    if (check && (await hold(no, marks, tiles))) return redraw(no, theme);
    return marks.at(-1)?.id ?? 0;
  };

  /** Holds the marks in the parts of the wall the check flagged; says whether there were any. */
  const hold = async (no: number, marks: Mark[], tiles: Tile[]) => {
    const bad = tiles.filter(flagged);
    const held = bad.length ? marks.filter((m) => bad.some((t) => overlaps(markBox(m.s), t.x, t.y, t.w, t.h))).map((m) => m.id) : [];
    if (!held.length) return false;
    await sql`update public.wall_marks set status = 'held' where id in ${sql(held)} and status = 'live'`;
    await sql`update public.walls set rev = rev + 1 where no = ${no}`;
    console.log(`wall ${no}: held ${held.length} marks the image check flagged`);
    return true;
  };
  const pictured = (no: number, upto: number) => sql`update public.walls set snapshot = ${`${no}.webp`}, snapshot_upto = ${upto} where no = ${no}`;

  /** Adds the live wall's new marks to its picture, checks them and holds what the check flags. */
  const settle = () =>
    serial(async () => {
      const w = await live();
      if (!w) return;
      waitingSince = 0;
      if (!drawn || drawn.no !== w.no) {
        // after a restart, or after another wall was drawn: all of it, and all of it checked,
        // since nothing says the newest marks were
        const upto = await redraw(w.no, w.theme, true);
        drawn = { no: w.no, upto };
        await pictured(w.no, upto);
        return;
      }
      const marks = await marksOf(w.no, drawn.upto);
      if (!marks.length) return;
      const tiles = await job({ no: w.no, theme: w.theme, reset: false, strokes: marks.map((m) => m.s), check: true, out: file(w.no), thumb: file(w.no, true) });
      drawn = { no: w.no, upto: marks.at(-1)!.id };
      // the picture has the held marks in it: draw it again without them (open pages start
      // over, since the wall's rev went up)
      if (await hold(w.no, marks, tiles)) drawn = { no: w.no, upto: await redraw(w.no, w.theme) };
      await pictured(w.no, drawn.upto);
    });

  /** After marks left a wall: draws it again; on the live wall, open pages start over. */
  const rebuild = (no: number) =>
    serial(async () => {
      const [w] = await sql<{ theme: string; status: string }[]>`select theme, status from public.walls where no = ${no}`;
      if (!w) return;
      const upto = await redraw(no, w.theme);
      if (w.status === "live") drawn = { no, upto };
      await sql`update public.walls set rev = rev + 1 where no = ${no}`;
      await pictured(no, upto);
      if (w.status !== "live") {
        // the archive's counts follow what is left on it
        await sql`
          update public.walls set
            marks = (select count(*) from public.wall_marks where wall = ${no} and status = 'live'),
            artists = (select count(distinct member) from public.wall_marks where wall = ${no} and status = 'live')
          where no = ${no}`;
        await purge([site + imgUrl(no), site + imgUrl(no, true)]);
      }
    });

  /** Closes the wall whose time is up and puts up the next one; puts up the first one. */
  const turn = () =>
    serial(async () => {
      const [w] = await sql<{ no: number; theme: string; ends: Date }[]>`select no, theme, ends from public.walls where status = 'live'`;
      if (w && w.ends > new Date()) return;
      if (w) {
        // the archive keeps the wall as it was at the end, every mark checked
        const upto = await redraw(w.no, w.theme, true);
        await sql`
          update public.walls set status = 'closed', closed_at = now(), snapshot = ${`${w.no}.webp`}, snapshot_upto = ${upto},
            marks = (select count(*) from public.wall_marks where wall = ${w.no} and status = 'live'),
            artists = (select count(distinct member) from public.wall_marks where wall = ${w.no} and status = 'live')
          where no = ${w.no}`;
        console.log(`wall ${w.no} closed`);
      }
      const [last] = await sql<{ no: number }[]>`select no from public.walls order by no desc limit 1`;
      const no = (last?.no ?? 0) + 1;
      // the midnight in Tbilisi (UTC+4, no summer time) that comes WALL_DAYS days from now: a
      // wall that closed on time lasts exactly that long, and the first one a little less
      await sql`
        insert into public.walls (no, theme, ends) values (${no}, ${themeFor(no).id},
          date_trunc('day', (now() + make_interval(days => ${WALL_DAYS})) at time zone 'Asia/Tbilisi') at time zone 'Asia/Tbilisi')`;
      drawn = null;
      console.log(`wall ${no} (${themeFor(no).id}) is up`);
    });

  const tick = async () => {
    try {
      await turn();
      if (waitingSince && Date.now() - waitingSince >= SETTLE_MS) await settle();
      else if (!drawn) await settle();
    } catch (e) {
      console.error("the wall:", e);
    }
  };

  /* ---- what anyone can see ---- */

  const about = (w: Row) => ({
    no: w.no,
    theme: w.theme,
    title: themeById(w.theme).title,
    started: w.started,
    ends: w.ends,
  });

  // the live wall: its picture, and the marks made since. With ?no=&rev=&after= (what the page
  // already has) only the newer marks, unless marks left the wall or it changed.
  app.get("/", async (c) => {
    const [w] = await sql`select no, theme, started, ends, rev, snapshot, snapshot_upto::int as upto from public.walls where status = 'live'`;
    c.header("cache-control", "no-store");
    if (!w) return c.json({ error: "The wall isn't up yet. Try again in a minute." }, 503);
    const q = c.req.query();
    const same = Number(q.no) === w.no && Number(q.rev) === w.rev && Number.isInteger(Number(q.after));
    const after = same ? Math.max(Number(q.after), 0) : w.snapshot ? w.upto : 0;
    const marks = await marksOf(w.no, after);
    const [{ n, artists }] = await sql`
      select count(*)::int as n, count(distinct member)::int as artists from public.wall_marks where wall = ${w.no} and status = 'live'`;
    return c.json({
      ...about(w),
      rev: w.rev,
      // a page that has the wall gets only what's new
      fresh: !same,
      picture: !same && w.snapshot ? `${imgUrl(w.no)}?v=${w.rev}-${w.upto}` : null,
      after,
      marks,
      count: n,
      artists,
    });
  });

  // the archive, newest first
  app.get("/past", async (c) => {
    const rows = await sql`
      select no, theme, started, ends, marks, artists from public.walls where status = 'closed' order by no desc limit 200`;
    c.header("cache-control", "public, max-age=300");
    return c.json(rows.map((w) => ({ ...about(w), marks: w.marks, artists: w.artists, picture: `${imgUrl(w.no)}?v=${w.marks}`, small: `${imgUrl(w.no, true)}?v=${w.marks}` })));
  });

  // one wall from the archive, with who drew on it
  app.get("/past/:no", async (c) => {
    const no = Number(c.req.param("no"));
    const [w] = Number.isInteger(no) ? await sql`select no, theme, started, ends, marks, artists from public.walls where no = ${no} and status = 'closed'` : [];
    if (!w) return c.json({ error: "There's no wall with that number in the archive." }, 404);
    const people = await sql`
      select p.handle, count(*)::int as marks from public.wall_marks m join public.profiles p on p.id = m.member
      where m.wall = ${no} and m.status = 'live' and not p.suspended group by p.handle order by marks desc, p.handle limit 100`;
    const [prev] = await sql`select no from public.walls where status = 'closed' and no < ${no} order by no desc limit 1`;
    const [next] = await sql`select no from public.walls where status = 'closed' and no > ${no} order by no limit 1`;
    c.header("cache-control", "public, max-age=300");
    return c.json({ ...about(w), marks: w.marks, artists: w.artists, picture: `${imgUrl(no)}?v=${w.marks}`, people, prev: prev?.no ?? null, next: next?.no ?? null });
  });

  // the pictures: the live wall's changes, so it's cached by its ?v=; a hidden wall's are gone
  app.get("/img/:name", async (c) => {
    const m = /^(\d+)(-s)?\.webp$/.exec(c.req.param("name"));
    if (!m) return c.json({ error: "No such picture." }, 404);
    const no = Number(m[1]);
    const [w] = await sql`select status from public.walls where no = ${no}`;
    if (!w || w.status === "hidden") return c.json({ error: "No such picture." }, 404);
    const path = file(no, !!m[2]);
    const bytes = await readFile(path).catch(() => null);
    if (!bytes) return c.json({ error: "No such picture." }, 404);
    c.header("content-type", "image/webp");
    c.header("cache-control", c.req.query("v") ? "public, max-age=31536000, immutable" : "public, max-age=60");
    c.header("last-modified", (await stat(path)).mtime.toUTCString());
    return c.body(bytes);
  });

  /* ---- drawing on it: members only ---- */

  app.post(
    "/marks",
    member,
    bodyLimit({ maxSize: 512 * 1024, onError: (c) => c.json({ error: "Send fewer marks at once." }, 413) }),
    async (c) => {
      const { id: me } = c.get("member");
      const body = await c.req.json().catch(() => null);
      const strokes: unknown[] = Array.isArray(body?.strokes) ? body.strokes : [];
      if (!strokes.length || strokes.length > 20) return c.json({ error: "Send 1 to 20 marks." }, 400);
      for (const s of strokes) {
        const why = wallStrokeProblem(s);
        if (why) return c.json({ error: why }, 422);
      }
      const [who] = await sql`select suspended from public.profiles where id = ${me}`;
      if (!who) return c.json({ error: "Pick your handle before you draw on the wall." }, 403);
      if (who.suspended) return c.json({ error: "This account is suspended." }, 403);
      const [w] = await sql`select no from public.walls where status = 'live'`;
      if (!w || (body.no !== undefined && body.no !== w.no)) return c.json({ error: "That wall has closed. Here's the new one.", closed: true }, 409);
      const [{ burst, mine, all }] = await sql`
        select count(*) filter (where member = ${me} and created > now() - interval '10 minutes')::int as burst,
               count(*) filter (where member = ${me})::int as mine,
               count(*)::int as "all"
        from public.wall_marks where wall = ${w.no}`;
      if (all + strokes.length > WALL_MAX) return c.json({ error: "The wall is full. A new one goes up soon." }, 429);
      if (mine + strokes.length > WALL_PER_MEMBER) return c.json({ error: "You've drawn a lot on this wall. Leave some room for the others until the next one." }, 429);
      if (burst + strokes.length > WALL_BURST) return c.json({ error: "That's a lot of marks at once. Take a breath and carry on in a few minutes." }, 429);
      const rows = strokes.map((s) => ({ wall: w.no, member: me, stroke: sql.json(wallStroke(s as WallStroke) as never) }));
      const made = await sql<{ id: number }[]>`insert into public.wall_marks ${sql(rows)} returning id::int`;
      waitingSince ||= Date.now();
      return c.json({ no: w.no, ids: made.map((m) => m.id) }, 201);
    },
  );

  /* ---- mods ---- */

  const mods = new Hono<AuthEnv & { Variables: { role: string } }>();
  mods.use(
    "*",
    member,
    createMiddleware<AuthEnv & { Variables: { role: string } }>(async (c, next) => {
      const [me] = await sql`select role from public.profiles where id = ${c.get("member").id} and not suspended`;
      if (!me || me.role === "member") return c.json({ error: "Only mods can do that." }, 403);
      c.set("role", me.role);
      await next();
    }),
  );
  const log = (mod: string, action: string, no: number, text: string, profile?: string) =>
    sql`insert into public.mod_log (mod, action, wall, profile, note) values (${mod}, ${action}, ${no}, ${profile ?? null}, ${text.slice(0, 500)})`;
  const closeReports = (no: number, status: "actioned" | "dismissed", by: string) =>
    sql`update public.reports set status = ${status}, closed_by = ${by}, closed_at = now() where status = 'open' and wall = ${no}`;

  // what the image check held, with who drew it, for the queue
  mods.get("/held", async (c) => {
    const rows = await sql`
      select m.id::int, m.wall, m.stroke as s, m.created, p.handle, p.id as member
      from public.wall_marks m join public.profiles p on p.id = m.member
      where m.status = 'held' order by m.id limit 500`;
    return c.json(rows);
  });

  // the marks in a part of a wall, for a mod about to rub them out
  mods.get("/:no/marks", async (c) => {
    const no = Number(c.req.param("no"));
    const [x, y, w, h] = ["x", "y", "w", "h"].map((k) => Number(c.req.query(k)));
    if (![no, x, y, w, h].every(Number.isFinite)) return c.json({ error: "Say which wall and which part: ?x=&y=&w=&h=" }, 400);
    const rows = await sql`
      select m.id::int, m.stroke as s, m.created, p.handle from public.wall_marks m join public.profiles p on p.id = m.member
      where m.wall = ${no} and m.status = 'live' order by m.id`;
    return c.json(rows.filter((m) => overlaps(markBox(m.s), x, y, w, h)).slice(0, 2000));
  });

  // { action: "erase", ids } rubs marks out; { action: "restore" | "erase", ids } on held ones
  // lets them back or removes them; { action: "hide" | "show" } takes a closed wall out of the
  // archive or puts it back
  mods.post("/:no", async (c) => {
    const { id: me } = c.get("member");
    const no = Number(c.req.param("no"));
    const body = await c.req.json().catch(() => null);
    const [w] = Number.isInteger(no) ? await sql`select status from public.walls where no = ${no}` : [];
    if (!w) return c.json({ error: "No such wall." }, 404);
    const action = body?.action;
    const note = String(body?.note ?? "").trim();
    if (action === "hide" || action === "show") {
      if (w.status === "live") return c.json({ error: "The live wall stays up; rub out what's wrong instead." }, 409);
      await sql`update public.walls set status = ${action === "hide" ? "hidden" : "closed"} where no = ${no}`;
      if (action === "hide") {
        await closeReports(no, "actioned", me);
        await purge([site + imgUrl(no), site + imgUrl(no, true)]);
      }
      await log(me, action, no, note);
      return c.json({ ok: true });
    }
    if (action !== "erase" && action !== "restore") return c.json({ error: "The action is erase, restore, hide or show." }, 400);
    const ids: number[] = Array.isArray(body?.ids) ? body.ids.filter(Number.isInteger).slice(0, 5000) : [];
    if (!ids.length) return c.json({ error: "Say which marks: { ids: [...] }." }, 400);
    const done = await sql<{ member: string }[]>`
      update public.wall_marks set status = ${action === "erase" ? "removed" : "live"}
      where wall = ${no} and id in ${sql(ids)} and status = any(${action === "erase" ? ["live", "held"] : ["held"]})
      returning member`;
    if (!done.length) return c.json({ error: "Those marks aren't there any more." }, 409);
    await rebuild(no);
    if (action === "erase") await closeReports(no, "actioned", me);
    const people = [...new Set(done.map((d) => d.member))];
    await log(me, action, no, `${done.length} mark${done.length === 1 ? "" : "s"}${note ? `: ${note}` : ""}`, people.length === 1 ? people[0] : undefined);
    return c.json({ ok: true, marks: done.length });
  });

  app.route("/mod", mods);

  /** When a member is suspended or deletes their account: their marks leave every wall. */
  const forget = async (profile: string, { remove }: { remove: boolean }) => {
    const walls = remove
      ? await sql<{ wall: number }[]>`
          update public.wall_marks set status = 'removed' where member = ${profile} and status <> 'removed'
          returning wall`
      : await sql<{ wall: number }[]>`select distinct wall from public.wall_marks where member = ${profile} and status <> 'removed'`;
    return [...new Set(walls.map((w) => w.wall))];
  };

  return {
    app,
    async start() {
      await mkdir(dir, { recursive: true });
      await tick();
      setInterval(() => void tick(), TICK_MS).unref();
    },
    /** a suspended member's marks are rubbed out */
    async suspended(profile: string) {
      for (const no of await forget(profile, { remove: true })) await rebuild(no);
    },
    /** before an account goes: the walls its marks are on, to draw again once it has */
    walls: (profile: string) => forget(profile, { remove: false }),
    rebuild,
  };
}
export type Wall = ReturnType<typeof wall>;
