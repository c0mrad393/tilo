import { Hono } from "hono";
import { verify } from "hono/jwt";
import type { Sql } from "postgres";

/* /api/claims: takedown claims, for copyright, abuse or privacy, from anyone, including
   people without an account. Admins answer them in the admin panel; the terms promise an
   answer within two working days. The claimant's name and address are kept for that only. */

const KINDS = new Set(["copyright", "abuse", "privacy", "other"]);
/** claims one address may send in an hour, and all addresses together in a day */
const PER_HOUR = 5;
const PER_DAY = 200;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export function claims(sql: Sql, { jwtSecret, site }: { jwtSecret: string; site: string }) {
  const app = new Hono();
  const host = new URL(site).host;
  // in memory: a restart forgets, which is fine for keeping one sender from flooding
  const sent = new Map<string, number[]>();

  app.post("/", async (c) => {
    const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "?";
    const now = Date.now();
    const recent = (sent.get(ip) ?? []).filter((t) => now - t < 3600_000);
    if (recent.length >= PER_HOUR) return c.json({ error: "Too many claims from here in an hour. Write to legal@tiloart.com instead." }, 429);
    const [{ n }] = await sql`select count(*)::int as n from public.claims where created > now() - interval '1 day'`;
    if (n >= PER_DAY) return c.json({ error: "The form is busy. Write to legal@tiloart.com instead." }, 429);

    const body = await c.req.json().catch(() => null);
    const kind = body?.kind;
    if (!KINDS.has(kind)) return c.json({ error: "Say what kind of claim it is.", field: "kind" }, 400);
    const name = text(body?.name, 120);
    if (!name) return c.json({ error: "Give your name.", field: "name" }, 400);
    const email = text(body?.email, 254);
    if (!EMAIL.test(email)) return c.json({ error: "Give an email address we can answer.", field: "email" }, 400);
    const details = text(body?.details, 4000);
    if (details.length < 10) return c.json({ error: "Say what's wrong, in a sentence or more.", field: "details" }, 400);
    if (kind === "copyright" && body?.sworn !== true)
      return c.json({ error: "A copyright claim needs the statement ticked.", field: "sworn" }, 400);

    // the address of what the claim is about: a piece or a profile on Tilo
    const raw = text(body?.url, 500);
    let path: string;
    try {
      const u = new URL(raw, site);
      if (u.host !== host) throw new Error("elsewhere");
      path = u.pathname;
    } catch {
      return c.json({ error: `Paste the address of a piece or profile on ${host}.`, field: "url" }, 400);
    }
    const pieceId = /^\/piece\/([a-z0-9]{6,16})\/?$/.exec(path)?.[1];
    const handle = /^\/u\/([a-z0-9_]{3,20})\/?$/.exec(path)?.[1];
    if (!pieceId && !handle) return c.json({ error: `Paste the address of a piece or profile on ${host}.`, field: "url" }, 400);
    const [target] = pieceId
      ? await sql`select id as piece, owner as profile from public.pieces where id = ${pieceId}`
      : await sql`select null as piece, id as profile from public.profiles where handle = ${handle!}`;
    if (!target) return c.json({ error: "There's nothing at that address. It may already be gone.", field: "url" }, 404);

    // signed in or not; a member's claim says who sent it
    let member: string | null = null;
    const auth = c.req.header("authorization") ?? "";
    if (auth.startsWith("Bearer ")) {
      const t = await verify(auth.slice(7), jwtSecret, { alg: "HS256", aud: "authenticated" }).catch(() => null);
      if (t?.role === "authenticated" && typeof t.sub === "string") member = t.sub;
    }
    if (member) [{ member }] = await sql`select (select id from public.profiles where id = ${member}) as member`;

    const [claim] = await sql`
      insert into public.claims (kind, url, piece, profile, name, email, details, sworn, member)
      values (${kind}, ${`${site}${path}`}, ${target.piece}, ${target.profile}, ${name}, ${email}, ${details}, ${body?.sworn === true}, ${member})
      returning id::int`;
    sent.set(ip, [...recent, now]);
    return c.json({ id: claim.id }, 201);
  });

  return app;
}
