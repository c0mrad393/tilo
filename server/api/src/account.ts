import { Hono, type MiddlewareHandler } from "hono";
import type { Sql } from "postgres";
import type { AuthEnv } from "./auth.ts";
import { publicUrls, removeFiles, type Purge } from "./files.ts";
import { newCode } from "./invites.ts";
import type { Wall } from "./wall.ts";

/* /api/me: the signed-in member's own account. Everything here acts only on whoever the
   session belongs to, so there is no id in any path. */

interface Options {
  member: MiddlewareHandler<AuthEnv>;
  filesDir: string;
  /** Supabase Auth inside the compose network, and the key for its admin API */
  authUrl: string;
  serviceKey: string;
  site: string;
  purge: Purge;
  wall: Wall;
}

export function account(sql: Sql, { member, filesDir, authUrl, serviceKey, site, purge, wall }: Options) {
  const app = new Hono<AuthEnv>();
  app.use("*", member);
  const admin = (path: string, init: RequestInit = {}) =>
    fetch(`${authUrl}/admin/users/${path}`, { ...init, headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey } });

  // who is signed in, and their profile once they have picked a handle
  app.get("/", async (c) => {
    const { id, email } = c.get("member");
    const [profile] = await sql`select handle, name, role from public.profiles where id = ${id}`;
    return c.json({ id, email, profile: profile ?? null });
  });

  // Invite codes the member hands out: a few each (invites_per_member), made one at a time,
  // so nobody holds codes they haven't given anyone. An unused one can be taken back, which
  // frees its place. Admins make theirs in the admin panel, with no limit.
  const beta = async () => {
    const rows = await sql<{ key: string; value: string }[]>`select key, value from tilo_meta.settings where key in ('invites_required', 'invites_per_member')`;
    const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return { open: v.invites_required !== "true", per: Number(v.invites_per_member ?? 0) };
  };
  const mine = (id: string) => sql`
    select i.code, i.created, i.used_at, taker.handle as used_by
    from public.invites i left join public.profiles taker on taker.id = i.used_by
    where i.made_by = ${id} order by i.created`;

  app.get("/invites", async (c) => {
    const { id } = c.get("member");
    const [p] = await sql`select role from public.profiles where id = ${id}`;
    if (!p) return c.json({ error: "Pick a handle first." }, 403);
    const { open, per } = await beta();
    if (p.role === "admin") return c.json({ open, per, admin: true, left: 0, codes: [] });
    const codes = await mine(id);
    return c.json({ open, per, admin: false, left: Math.max(0, per - codes.length), codes });
  });

  app.post("/invites", async (c) => {
    const { id } = c.get("member");
    return sql.begin(async (tx) => {
      // one at a time per member, so two taps can't both take the last place
      await tx`select pg_advisory_xact_lock(hashtext(${"invites:" + id}))`;
      const [p] = await tx`select role, suspended from public.profiles where id = ${id}`;
      if (!p) return c.json({ error: "Pick a handle first." }, 403);
      if (p.suspended) return c.json({ error: "A suspended account can't invite anyone." }, 403);
      if (p.role === "admin") return c.json({ error: "Admins make codes in the admin panel." }, 400);
      const { open, per } = await beta();
      if (open) return c.json({ error: "Tilo is open just now: anyone can join without a code." }, 409);
      const [{ n }] = await tx`select count(*)::int as n from public.invites where made_by = ${id}`;
      if (n >= per) return c.json({ error: per ? `You've handed out all ${per} of your codes.` : "Members can't hand out codes just now." }, 429);
      const [made] = await tx`insert into public.invites (code, made_by) values (${newCode()}, ${id}) returning code, created, used_at`;
      return c.json({ ...made, used_by: null }, 201);
    });
  });

  app.delete("/invites/:code", async (c) => {
    const { id } = c.get("member");
    const gone = await sql`delete from public.invites where code = ${c.req.param("code").toUpperCase()} and made_by = ${id} and used_at is null returning code`;
    if (!gone.length) return c.json({ error: "No unused code of yours like that." }, 404);
    return c.body(null, 204);
  });

  // everything Tilo keeps about the member, as one JSON file (GDPR article 20)
  app.get("/export", async (c) => {
    const { id } = c.get("member");
    const user = await admin(id).then((r) => (r.ok ? r.json() : null));
    const [profile] = await sql`select * from public.profiles where id = ${id}`;
    const data = {
      exported: new Date().toISOString(),
      account: user && {
        id: user.id,
        email: user.email,
        created: user.created_at,
        last_sign_in: user.last_sign_in_at,
        sign_in_with: user.app_metadata?.providers ?? [],
      },
      profile: profile ?? null,
      agreed_to: (await sql`select terms, at from public.agreements where member = ${id}`)[0] ?? null,
      pieces: await sql`select * from public.pieces where owner = ${id} order by created`,
      stamps_given: await sql`select piece, kind, created from public.stamps where member = ${id} order by created`,
      following: await sql`select p.handle, f.created from public.follows f join public.profiles p on p.id = f.followee where f.follower = ${id}`,
      followers: await sql`select p.handle, f.created from public.follows f join public.profiles p on p.id = f.follower where f.followee = ${id}`,
      reports_filed: await sql`select piece, profile, reason, note, status, created from public.reports where reporter = ${id}`,
      claims_sent: await sql`select kind, url, name, email, details, status, outcome, created from public.claims where member = ${id}`,
      feedback_sent: await sql`select kind, page, text, device, created from public.feedback where member = ${id}`,
      invite_used: (await sql`select code, used_at from public.invites where used_by = ${id}`)[0] ?? null,
      invites_made: await sql`select code, used_at from public.invites where made_by = ${id}`,
      wall_marks: await sql`select wall, stroke, status, created from public.wall_marks where member = ${id} and status <> 'removed' order by id`,
    };
    const name = `tilo-${profile?.handle ?? "account"}-${data.exported.slice(0, 10)}.json`;
    c.header("content-disposition", `attachment; filename="${name}"`);
    return c.json(data);
  });

  // deletes the account for good: Auth drops the user, Postgres cascades every row that
  // hangs off them, and their recordings and pictures leave the disk
  app.delete("/", async (c) => {
    const { id } = c.get("member");
    const body = await c.req.json().catch(() => null);
    if (body?.confirm !== true) return c.json({ error: "Send { \"confirm\": true } to delete the account." }, 400);
    const pieces = await sql<{ id: string; status: string; picture: "webp" | "jpg" }[]>`select id, status, picture from public.pieces where owner = ${id}`;
    const walls = await wall.walls(id);
    const res = await admin(id, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`Auth didn't delete the user: ${res.status} ${await res.text()}`);
    await Promise.all(pieces.map((p) => removeFiles(filesDir, p.id)));
    await purge(pieces.filter((p) => p.status === "live").flatMap((p) => publicUrls(site, p.id, p.picture)));
    // their marks went with the account; the walls they were on are drawn without them
    for (const no of walls) await wall.rebuild(no);
    return c.body(null, 204);
  });

  return app;
}
