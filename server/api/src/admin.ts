import { Hono, type MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type { Sql } from "postgres";
import type { AuthEnv } from "./auth.ts";
import { newCode } from "./invites.ts";
import { type Mailer, sendInvites, type WaitRow } from "./waitlist.ts";

/* /api/admin: what only admins do. The numbers at a glance, members with their email
   addresses (which only Auth keeps), roles, invite codes and settings. Pieces, reports,
   feedback and the log the panel reads through PostgREST, like the mods' queue. Every
   change is written to mod_log. */

const PAGE = 50;
const ROLES = new Set(["member", "mod", "admin"]);
/** settings an admin may change, with the values each may take */
const SETTINGS: Record<string, Set<string>> = {
  invites_required: new Set(["true", "false"]),
  invites_per_member: new Set(Array.from({ length: 11 }, (_, i) => String(i))),
};

export function admin(sql: Sql, { member, mail }: { member: MiddlewareHandler<AuthEnv>; mail: Mailer }) {
  const app = new Hono<AuthEnv>();
  app.use(
    "*",
    member,
    createMiddleware<AuthEnv>(async (c, next) => {
      const [me] = await sql`select 1 from public.profiles where id = ${c.get("member").id} and role = 'admin' and not suspended`;
      if (!me) return c.json({ error: "Only admins can do that." }, 403);
      await next();
    }),
  );
  const log = (mod: string, action: string, profile: string | null, note: string) =>
    sql`insert into public.mod_log (mod, action, profile, note) values (${mod}, ${action}, ${profile}, ${note.slice(0, 500)})`;

  app.get("/stats", async (c) => {
    const [s] = await sql`
      select
        (select count(*)::int from public.profiles) as members,
        (select count(*)::int from public.profiles where created > now() - interval '7 days') as new_members,
        (select count(*)::int from public.account_facts() where last_sign_in_at > now() - interval '7 days') as signed_in,
        (select count(*)::int from public.profiles where suspended) as suspended,
        (select count(*)::int from public.pieces where status = 'live') as live,
        (select count(*)::int from public.pieces where status = 'held' and why <> 'check') as waiting,
        (select count(*)::int from public.pieces where status = 'hidden') as hidden,
        (select count(*)::int from public.reports where status = 'open') as reports,
        (select count(*)::int from public.invites where used_at is null) as invites_left,
        (select count(*)::int from public.invites where used_at is not null) as invites_used,
        (select count(*)::int from public.feedback where not done) as feedback,
        (select count(*)::int from public.errors where last_seen > now() - interval '7 days') as errors,
        (select coalesce(sum(count), 0)::int from public.errors where last_seen > now() - interval '7 days') as error_count,
        (select count(*)::int from public.claims where status = 'open') as claims,
        (select count(*)::int from public.waitlist where invited_at is null) as waiting_list`;
    // pieces published on each of the last 14 days, oldest first, days without any included
    const days = await sql`
      select to_char(d, 'YYYY-MM-DD') as day, count(p.id)::int as n
      from generate_series(current_date - 13, current_date, interval '1 day') d
      left join public.pieces p on p.created >= d and p.created < d + interval '1 day'
      group by d order by d`;
    return c.json({ ...s, days });
  });

  // ?q= matches handle, name or email; ?role= narrows to one role; ?page= from 0
  app.get("/members", async (c) => {
    const q = (c.req.query("q") ?? "").trim().slice(0, 80);
    const role = c.req.query("role") ?? "";
    const page = Math.max(0, Number(c.req.query("page")) || 0);
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const rows = await sql`
      select p.id, p.handle, p.name, p.role, p.suspended, p.created, u.email, u.last_sign_in_at as last_sign_in,
        (select count(*)::int from public.pieces where owner = p.id and status = 'live') as live,
        (select count(*)::int from public.pieces where owner = p.id) as pieces,
        (select count(*)::int from public.reports where status = 'open' and (profile = p.id or piece in (select id from public.pieces where owner = p.id))) as reports,
        i.code as invite, maker.handle as invited_by
      from public.profiles p
      join public.account_facts() u on u.id = p.id
      left join public.invites i on i.used_by = p.id
      left join public.profiles maker on maker.id = i.made_by
      where (${q} = '' or p.handle ilike ${like} or p.name ilike ${like} or u.email ilike ${like})
        and (${role} = '' or p.role = ${role})
      order by p.created desc
      limit ${PAGE + 1} offset ${page * PAGE}`;
    return c.json({ members: rows.slice(0, PAGE), more: rows.length > PAGE });
  });

  app.post("/members/:id", async (c) => {
    const { id: me } = c.get("member");
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    if (!ROLES.has(body?.role)) return c.json({ error: "The role is member, mod or admin." }, 400);
    // so the last admin can't lock everyone out by accident
    if (id === me) return c.json({ error: "Another admin has to change your role." }, 400);
    const [p] = await sql`update public.profiles set role = ${body.role} where id = ${id} returning handle`;
    if (!p) return c.json({ error: "No such member." }, 404);
    await log(me, "role", id, `made ${body.role}`);
    return c.json({ ok: true });
  });

  // ?used=yes|no narrows the list
  app.get("/invites", async (c) => {
    const used = c.req.query("used");
    const where = used === "yes" ? sql`where i.used_at is not null` : used === "no" ? sql`where i.used_at is null` : sql``;
    const rows = await sql`
      select i.code, i.note, i.created, i.used_at, maker.handle as made_by, taker.handle as used_by
      from public.invites i
      left join public.profiles maker on maker.id = i.made_by
      left join public.profiles taker on taker.id = i.used_by
      ${where}
      order by i.created desc
      limit 500`;
    return c.json({ invites: rows });
  });

  // { count: 1-50, note } makes that many codes
  app.post("/invites", async (c) => {
    const { id: me } = c.get("member");
    const body = await c.req.json().catch(() => null);
    const count = Number(body?.count);
    if (!Number.isInteger(count) || count < 1 || count > 50) return c.json({ error: "Make 1 to 50 codes at a time." }, 400);
    const note = String(body?.note ?? "").trim().slice(0, 120);
    const codes = Array.from({ length: count }, newCode);
    await sql`insert into public.invites ${sql(codes.map((code) => ({ code, note, made_by: me })))}`;
    await log(me, "invite", null, `${count} code${count > 1 ? "s" : ""}${note ? ` for ${note}` : ""}`);
    return c.json({ codes }, 201);
  });

  // only a code nobody has used can be withdrawn
  app.delete("/invites/:code", async (c) => {
    const { id: me } = c.get("member");
    const code = c.req.param("code").toUpperCase();
    const gone = await sql`delete from public.invites where code = ${code} and used_at is null returning code`;
    if (!gone.length) return c.json({ error: "No unused code like that." }, 404);
    await log(me, "uninvite", null, code);
    return c.body(null, 204);
  });

  // the waiting list (waitlist.ts): ?show=waiting (the default, oldest first), sent or all
  app.get("/waitlist", async (c) => {
    const show = c.req.query("show") ?? "waiting";
    const where = show === "sent" ? sql`where w.invited_at is not null` : show === "all" ? sql`` : sql`where w.invited_at is null`;
    const rows = await sql<WaitRow[]>`
      select w.id::int, w.email, w.note, w.source, w.created, w.invite, w.invited_at, i.used_at, p.handle as used_by
      from public.waitlist w
      left join public.invites i on i.code = w.invite
      left join public.profiles p on p.id = i.used_by
      ${where}
      order by ${show === "waiting" ? sql`w.created` : sql`w.created desc`}
      limit 500`;
    return c.json({ waitlist: rows });
  });

  // { ids } emails each of them a code (a resend for one whose code is still unused)
  app.post("/waitlist/invite", async (c) => {
    const { id: me } = c.get("member");
    const body = await c.req.json().catch(() => null);
    const ids = Array.isArray(body?.ids) ? body.ids.filter((n: unknown) => Number.isSafeInteger(n)) : [];
    if (!ids.length || ids.length > 50) return c.json({ error: "Pick 1 to 50 people at a time." }, 400);
    const r = await sendInvites(sql, mail, me, ids);
    if (!r.sent && r.failed.length) return c.json({ error: `The email didn't go: ${r.fault}`, ...r }, 502);
    return c.json(r);
  });

  // someone asked to come off the list; an unused code they were sent is withdrawn too
  app.delete("/waitlist/:id", async (c) => {
    const { id: me } = c.get("member");
    const id = Number(c.req.param("id"));
    if (!Number.isSafeInteger(id)) return c.json({ error: "No one like that on the list." }, 404);
    const [w] = await sql`delete from public.waitlist where id = ${id} returning invite`;
    if (!w) return c.json({ error: "No one like that on the list." }, 404);
    if (w.invite) await sql`delete from public.invites where code = ${w.invite} and used_at is null`;
    await log(me, "waitlist", null, "took an address off the waiting list");
    return c.body(null, 204);
  });

  // error reports, the most recent first
  app.get("/errors", async (c) => {
    const rows = await sql`
      select sig, source, message, stack, page, version, browser, count, first_seen, last_seen
      from public.errors order by last_seen desc limit 200`;
    return c.json({ errors: rows });
  });

  // a fault that is fixed leaves the list; if it happens again it comes back as new
  app.delete("/errors/:sig", async (c) => {
    const gone = await sql`delete from public.errors where sig = ${c.req.param("sig")} returning sig`;
    if (!gone.length) return c.json({ error: "No such error." }, 404);
    return c.body(null, 204);
  });

  // takedown claims, oldest open ones first; ?status=closed for the answered ones
  app.get("/claims", async (c) => {
    const closed = c.req.query("status") === "closed";
    const rows = await sql`
      select k.id::int, k.kind, k.url, k.piece, k.name, k.email, k.details, k.sworn, k.status, k.outcome, k.created, k.closed_at,
        p.handle as about, m.handle as sent_by, cl.handle as closed_by, pc.title, pc.status as piece_status
      from public.claims k
      left join public.profiles p on p.id = k.profile
      left join public.profiles m on m.id = k.member
      left join public.profiles cl on cl.id = k.closed_by
      left join public.pieces pc on pc.id = k.piece
      where k.status = ${closed ? "closed" : "open"}
      order by ${closed ? sql`k.closed_at desc` : sql`k.created`}
      limit 200`;
    return c.json({ claims: rows });
  });

  // { outcome } answers a claim: what was done, said in a line for the log
  app.post("/claims/:id", async (c) => {
    const { id: me } = c.get("member");
    const id = Number(c.req.param("id"));
    if (!Number.isSafeInteger(id)) return c.json({ error: "No open claim like that." }, 404);
    const body = await c.req.json().catch(() => null);
    const outcome = String(body?.outcome ?? "").trim().slice(0, 500);
    if (!outcome) return c.json({ error: "Say what was done, for the log." }, 400);
    const [k] = await sql`
      update public.claims set status = 'closed', outcome = ${outcome}, closed_by = ${me}, closed_at = now()
      where id = ${id} and status = 'open' returning profile, piece`;
    if (!k) return c.json({ error: "No open claim like that." }, 404);
    await sql`insert into public.mod_log (mod, action, piece, profile, claim, note) values (${me}, 'claim', ${k.piece}, ${k.profile}, ${id}, ${outcome})`;
    return c.json({ ok: true });
  });

  app.get("/settings", async (c) => {
    const rows = await sql`select key, value from tilo_meta.settings where key in ${sql(Object.keys(SETTINGS))}`;
    return c.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  });

  app.put("/settings", async (c) => {
    const { id: me } = c.get("member");
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const changes = Object.entries(body ?? {}).map(([k, v]) => [k, String(v)] as const);
    if (!changes.length || changes.some(([k, v]) => !SETTINGS[k]?.has(v))) return c.json({ error: "Unknown setting or value." }, 400);
    for (const [k, v] of changes) {
      await sql`update tilo_meta.settings set value = ${v} where key = ${k}`;
      await log(me, "setting", null, `${k} = ${v}`);
    }
    return c.json({ ok: true });
  });

  // schools (docs/SCHOOLS.md): a new school waits until an admin has checked it is real
  app.get("/schools", async (c) => {
    const status = c.req.query("status");
    const schools = await sql`
      select s.id, s.name, s.city, s.status, s.created, s.decided_at, pr.handle as by, u.email,
        (select count(*)::int from public.teachers t where t.school = s.id and t.status = 'active') as teachers,
        (select count(*)::int from public.classes k where k.school = s.id) as classes,
        (select count(*)::int from public.pupils p join public.classes k on k.id = p.class where k.school = s.id) as pupils
      from public.schools s
      left join public.profiles pr on pr.id = s.created_by
      left join public.account_facts() u on u.id = s.created_by
      where ${status === "pending" || status === "active" || status === "closed" ? sql`s.status = ${status}` : sql`true`}
      order by s.status = 'pending' desc, s.created desc limit 200`;
    return c.json({ schools });
  });

  app.post("/schools/:id", async (c) => {
    const { id: me } = c.get("member");
    const id = c.req.param("id");
    const action = (await c.req.json().catch(() => null))?.action;
    const to = action === "approve" || action === "reopen" ? "active" : action === "close" ? "closed" : null;
    if (!to) return c.json({ error: "Approve, close or reopen." }, 400);
    const [s] = await sql`
      update public.schools set status = ${to}, decided_by = ${me}, decided_at = now()
      where id = ${id} and status <> ${to} returning name, created_by`;
    if (!s) return c.json({ error: "No school like that, or it is that already." }, 404);
    await sql`insert into public.mod_log (mod, action, profile, school, note) values (${me}, 'school', ${s.created_by}, ${id}, ${`${action}: ${s.name}`.slice(0, 500)})`;
    return c.json({ ok: true });
  });

  return app;
}
