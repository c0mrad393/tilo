import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Hono, type MiddlewareHandler } from "hono";
import type { Sql } from "postgres";
import type { AuthEnv } from "./auth.ts";

/* /api/me: the signed-in member's own account. Everything here acts only on whoever the
   session belongs to, so there is no id in any path. */

interface Options {
  member: MiddlewareHandler<AuthEnv>;
  filesDir: string;
  /** Supabase Auth inside the compose network, and the key for its admin API */
  authUrl: string;
  serviceKey: string;
}

export function account(sql: Sql, { member, filesDir, authUrl, serviceKey }: Options) {
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
      pieces: await sql`select * from public.pieces where owner = ${id} order by created`,
      stamps_given: await sql`select piece, kind, created from public.stamps where member = ${id} order by created`,
      following: await sql`select p.handle, f.created from public.follows f join public.profiles p on p.id = f.followee where f.follower = ${id}`,
      followers: await sql`select p.handle, f.created from public.follows f join public.profiles p on p.id = f.follower where f.followee = ${id}`,
      reports_filed: await sql`select piece, profile, reason, note, status, created from public.reports where reporter = ${id}`,
      feedback_sent: await sql`select page, text, created from public.feedback where member = ${id}`,
      invite_used: (await sql`select code, used_at from public.invites where used_by = ${id}`)[0] ?? null,
      invites_made: await sql`select code, used_at from public.invites where made_by = ${id}`,
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
    const pieces = await sql<{ id: string }[]>`select id from public.pieces where owner = ${id}`;
    const res = await admin(id, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`Auth didn't delete the user: ${res.status} ${await res.text()}`);
    await Promise.all(
      pieces.flatMap((p) => [
        rm(join(filesDir, "rec", `${p.id}.tl`), { force: true }),
        rm(join(filesDir, "img", `${p.id}.webp`), { force: true }),
      ]),
    );
    return c.body(null, 204);
  });

  return app;
}
