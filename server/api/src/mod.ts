import { Hono, type MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type { Sql } from "postgres";
import type { AuthEnv } from "./auth.ts";
import type { Move } from "./status.ts";

/* Reports and moderation. Members file reports here (/api/reports); mods act on pieces,
   reports and members here (/api/mod). Mods read the queue itself through PostgREST, which
   lets them see every piece and report. Every action is written to mod_log. */

interface Options {
  member: MiddlewareHandler<AuthEnv>;
  move: Move;
  authUrl: string;
  serviceKey: string;
  /** distinct members whose open reports take a live piece out of the gallery */
  holdAfter: number;
  /** reports one member may file in 24 hours */
  perDay: number;
}

const REASONS = new Set(["not-hand-made", "nsfw", "abuse", "spam", "copied", "other"]);
const note = (v: unknown) => String(v ?? "").trim().slice(0, 500);

export function reports(sql: Sql, { member, move, holdAfter, perDay }: Options) {
  const app = new Hono<AuthEnv>();

  // { piece } or { profile }, with a reason and a note
  app.post("/", member, async (c) => {
    const { id: me } = c.get("member");
    const body = await c.req.json().catch(() => null);
    const piece = typeof body?.piece === "string" ? body.piece : null;
    const profile = typeof body?.profile === "string" ? body.profile : null;
    if (!piece === !profile) return c.json({ error: "Report a piece or a profile." }, 400);
    if (!REASONS.has(body?.reason)) return c.json({ error: "Pick a reason." }, 400);
    const [who] = await sql`select suspended from public.profiles where id = ${me}`;
    if (!who) return c.json({ error: "Pick a handle before you report." }, 400);
    if (who.suspended) return c.json({ error: "This account is suspended." }, 400);
    const [{ n }] = await sql`select count(*)::int as n from public.reports where reporter = ${me} and created > now() - interval '1 day'`;
    if (n >= perDay) return c.json({ error: "That's a lot of reports for one day. The mods will get to them; try again tomorrow." }, 429);

    const [target] = piece
      ? await sql`select owner as id, status from public.pieces where id = ${piece} and status <> 'removed'`
      : await sql`select id from public.profiles where id = ${profile}`;
    if (!target) return c.json({ error: "There's nothing there to report." }, 404);
    if (target.id === me) return c.json({ error: "That's yours." }, 400);

    // one open report a member a thing: a second one adds nothing
    const [had] = await sql`
      select id from public.reports where reporter = ${me} and status = 'open'
        and ${piece ? sql`piece = ${piece}` : sql`profile = ${profile}`}`;
    if (!had)
      await sql`insert into public.reports (piece, profile, reporter, reason, note) values (${piece}, ${profile}, ${me}, ${body.reason}, ${note(body.note)})`;

    // Tilo is for all ages: one report that a piece isn't, and it waits for a mod
    if (piece && target.status === "live") {
      const [{ nsfw, people }] = await sql`
        select bool_or(reason = 'nsfw') as nsfw, count(distinct reporter)::int as people
        from public.reports where piece = ${piece} and status = 'open'`;
      if (nsfw || people >= holdAfter) await move(piece, { status: "held", why: "reports" });
    }
    return c.json({ ok: true }, 201);
  });

  return app;
}

export function moderation(sql: Sql, { member, move, authUrl, serviceKey }: Options) {
  const app = new Hono<AuthEnv & { Variables: { role: string } }>();
  app.use(
    "*",
    member,
    createMiddleware<AuthEnv & { Variables: { role: string } }>(async (c, next) => {
      const [me] = await sql`select role from public.profiles where id = ${c.get("member").id} and not suspended`;
      if (!me || me.role === "member") return c.json({ error: "Only mods can do that." }, 403);
      c.set("role", me.role);
      await next();
    }),
  );
  const log = (mod: string, action: string, ref: { piece?: string; profile?: string }, text: string) =>
    sql`insert into public.mod_log (mod, action, piece, profile, note) values (${mod}, ${action}, ${ref.piece ?? null}, ${ref.profile ?? null}, ${text})`;
  const close = (where: ReturnType<typeof sql>, status: "actioned" | "dismissed", by: string) =>
    sql`update public.reports set status = ${status}, closed_by = ${by}, closed_at = now() where status = 'open' and ${where}`;

  // approve: into the gallery; hide: out of it, the artist still sees it; remove: gone, files and all
  app.post("/pieces/:id", async (c) => {
    const { id: me } = c.get("member");
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const action = body?.action;
    const [p] = await sql`select p.status, pr.suspended from public.pieces p join public.profiles pr on pr.id = p.owner where p.id = ${id}`;
    if (!p) return c.json({ error: "No such piece." }, 404);
    if (p.status === "removed") return c.json({ error: "That piece was removed." }, 409);
    if (action === "approve") {
      if (p.suspended) return c.json({ error: "Its artist is suspended. Lift that first." }, 409);
      await move(id, { status: "live", by: me });
      await close(sql`piece = ${id}`, "dismissed", me);
    } else if (action === "hide" || action === "remove") {
      await move(id, action === "hide" ? { status: "hidden", why: "mod", by: me } : { status: "removed", by: me });
      await close(sql`piece = ${id}`, "actioned", me);
    } else return c.json({ error: "The action is approve, hide or remove." }, 400);
    await log(me, action, { piece: id }, note(body.note));
    return c.json({ ok: true });
  });

  // closes a report without acting on what it is about
  app.post("/reports/:id", async (c) => {
    const { id: me } = c.get("member");
    const body = await c.req.json().catch(() => null);
    if (body?.action !== "dismiss") return c.json({ error: "The action is dismiss." }, 400);
    const [r] = await sql`
      update public.reports set status = 'dismissed', closed_by = ${me}, closed_at = now()
      where id = ${Number(c.req.param("id")) || 0} and status = 'open' returning piece, profile`;
    if (!r) return c.json({ error: "No open report with that id." }, 404);
    await log(me, "dismiss", { piece: r.piece ?? undefined, profile: r.profile ?? undefined }, note(body.note));
    return c.json({ ok: true });
  });

  // suspend: Auth bans the account, so it can't sign in, and its live pieces are hidden;
  // unsuspend undoes both
  app.post("/members/:id", async (c) => {
    const { id: me } = c.get("member");
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const action = body?.action;
    if (action !== "suspend" && action !== "unsuspend") return c.json({ error: "The action is suspend or unsuspend." }, 400);
    const [m] = await sql`select role from public.profiles where id = ${id}`;
    if (!m) return c.json({ error: "No such member." }, 404);
    if (id === me) return c.json({ error: "Not your own account." }, 400);
    if (m.role !== "member" && c.get("role") !== "admin") return c.json({ error: "Only an admin can suspend a mod." }, 403);

    const on = action === "suspend";
    const res = await fetch(`${authUrl}/admin/users/${id}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "content-type": "application/json" },
      body: JSON.stringify({ ban_duration: on ? "876000h" : "none" }),
    });
    if (!res.ok) throw new Error(`Auth didn't ${action} the user: ${res.status} ${await res.text()}`);
    await sql`update public.profiles set suspended = ${on} where id = ${id}`;
    const pieces = on
      ? await sql`select id from public.pieces where owner = ${id} and status = 'live'`
      : await sql`select id from public.pieces where owner = ${id} and status = 'hidden' and why = 'suspended'`;
    for (const p of pieces) await move(p.id, on ? { status: "hidden", why: "suspended" } : { status: "live" });
    if (on) await close(sql`profile = ${id}`, "actioned", me);
    await log(me, action, { profile: id }, note(body.note));
    return c.json({ ok: true, pieces: pieces.length });
  });

  return app;
}
