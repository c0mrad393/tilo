import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Sql } from "postgres";

/* /api/visit: the app says a page was opened (src/data/visits.ts), and this adds it to the
   day's totals (migrations/0016_visits.sql). Nothing about the person is kept: the address
   and browser only become a hash with the day's salt, to tell today's visitors apart, and the
   salt and hashes go when the day ends. No cookie; the browser keeps nothing but a flag for
   the tab (sessionStorage) so a reload isn't a new arrival.
   An invite link opened (/account?invite=CODE) is noted on the code, for the admin panel's
   "where do invited people stop". */

/** days are Tbilisi days: the team is there */
export const TZ = "Asia/Tbilisi";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

/** a kind of page, never one person's or one piece's; admin pages aren't counted */
const PAGES: [RegExp, string][] = [
  [/^\/$/, "/"],
  [/^\/gallery$/, "/gallery"],
  [/^\/piece\/[^/]+$/, "/piece"],
  [/^\/studio$/, "/studio"],
  [/^\/wall$/, "/wall"],
  [/^\/wall\/(past|\d+)$/, "/wall/past"],
  [/^\/library$/, "/library"],
  [/^\/account$/, "/account"],
  [/^\/join$/, "/join"],
  [/^\/u\/[^/]+$/, "/u"],
  [/^\/(terms|privacy|takedown|support|proof|schools)$/, ""],
  [/^\/demo(\/.*)?$/, "/demo"],
  [/^\/teach(\/.*)?$/, "/teach"],
  [/^\/class(\/.*)?$/, "/class"],
  [/^\/show\/[^/]+$/, "/show"],
];
const NOT_COUNTED = /^\/(admin|mod)(\/|$)/;
export function pageOf(path: string) {
  for (const [re, name] of PAGES) if (re.test(path)) return name || path;
  return "other";
}

/** a site a visit came from, by the name people know it by */
const SITES: [RegExp, string][] = [
  [/(^|\.)(mail\.google\.com|outlook\.(live|office)\.com)$/, "email"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "facebook"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(t\.co|x\.com|twitter\.com)$/, "x"],
  [/(^|\.)threads\.(net|com)$/, "threads"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)(t\.me|telegram\.org)$/, "telegram"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)pinterest\.[a-z.]+$/, "pinterest"],
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)yandex\.[a-z.]+$/, "yandex"],
];
const UTM: Record<string, string> = { ig: "instagram", insta: "instagram", fb: "facebook", tt: "tiktok", twitter: "x" };
export function sourceOf(ref: unknown, utm: unknown, site: string) {
  if (typeof utm === "string") {
    const u = utm.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 30);
    if (u) return UTM[u] ?? u;
  }
  if (typeof ref !== "string" || !ref) return "direct";
  const host = ref.trim().toLowerCase().replace(/^(www|m|l|lm|mobile)\./, "").slice(0, 100);
  if (!/^[a-z0-9.-]+$/.test(host)) return "other";
  if (host === site) return "direct";
  for (const [re, name] of SITES) if (re.test(host)) return name;
  return host.slice(0, 60);
}

const BOT = /(bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|uptime|curl|wget|python|node-fetch)/i;
const PHONE = /(Mobi|Android|iPhone|iPad|iPod)/;
/** distinct sources a day; past this, new ones count as "other" */
const MAX_SOURCES = 150;

export function visits(sql: Sql, { site }: { site: string }) {
  const app = new Hono();
  const siteHost = new URL(site).hostname.replace(/^www\./, "");

  // the day's salt: made once a day, kept in the database so a restart doesn't count
  // everyone twice; a new day deletes the old salt and every hash made with it
  let current: { day: string; salt: Buffer } | null = null;
  async function saltFor(day: string) {
    if (current?.day === day) return current.salt;
    await sql.begin(async (tx) => {
      const old = await tx`delete from public.visit_salt where day <> ${day} returning day`;
      if (old.length) await tx`delete from public.visit_seen`;
      await tx`insert into public.visit_salt (day, salt) values (${day}, ${randomBytes(32)}) on conflict (day) do nothing`;
    });
    const [row] = await sql<{ salt: Buffer }[]>`select salt from public.visit_salt where day = ${day}`;
    current = { day, salt: row.salt };
    return row.salt;
  }

  // in memory, as for error reports: one address can't flood the counts
  const sent = new Map<string, number[]>();
  const PER_IP = 60;

  app.post("/", bodyLimit({ maxSize: 2048, onError: (c) => c.body(null, 413) }), async (c) => {
    const ua = c.req.header("user-agent") ?? "";
    if (!ua || BOT.test(ua)) return c.body(null, 204);
    const ip = c.req.header("x-tilo-client-ip") || c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0].trim() || "?";
    const now = Date.now();
    const mine = (sent.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (mine.length >= PER_IP) return c.body(null, 429);
    if (sent.size > 20_000) sent.clear();
    sent.set(ip, [...mine, now]);

    const b = await c.req.json().catch(() => null);
    const path = typeof b?.path === "string" ? b.path.split(/[?#]/)[0].slice(0, 200) : "";
    if (!path.startsWith("/") || NOT_COUNTED.test(path)) return c.body(null, 204);
    const arrived = b.first === true;

    const day = today();
    const salt = await saltFor(day);
    const hash = createHash("sha256").update(salt).update(`${ip}\n${ua}`).digest().subarray(0, 16);
    const fresh = (await sql`insert into public.visit_seen (hash) values (${hash}) on conflict do nothing returning 1`).length > 0;
    const phone = fresh && PHONE.test(ua);

    await sql`
      insert into public.visit_days (day, views, visitors, visits, mobile)
      values (${day}, 1, ${fresh ? 1 : 0}, ${arrived ? 1 : 0}, ${phone ? 1 : 0})
      on conflict (day) do update set
        views = visit_days.views + 1, visitors = visit_days.visitors + excluded.visitors,
        visits = visit_days.visits + excluded.visits, mobile = visit_days.mobile + excluded.mobile`;

    const counts: [string, string][] = [["page", pageOf(path)]];
    if (arrived) {
      let source = sourceOf(b.ref, b.utm, siteHost);
      if (!SITES.some(([, n]) => n === source) && !["direct", "other"].includes(source)) {
        const [{ n }] = await sql`select count(*)::int as n from public.visit_counts where day = ${day} and kind = 'source'`;
        const [known] = await sql`select 1 from public.visit_counts where day = ${day} and kind = 'source' and key = ${source}`;
        if (!known && n >= MAX_SOURCES) source = "other";
      }
      counts.push(["source", source]);
    }
    if (fresh) {
      const country = (c.req.header("x-tilo-country") || c.req.header("cf-ipcountry") || "").toUpperCase();
      // XX: unknown, T1: Tor
      if (/^[A-Z]{2}$/.test(country) && country !== "XX" && country !== "T1") counts.push(["country", country]);
    }
    for (const [kind, key] of counts)
      await sql`
        insert into public.visit_counts (day, kind, key, n) values (${day}, ${kind}, ${key}, 1)
        on conflict (day, kind, key) do update set n = visit_counts.n + 1`;

    // an invite link opened: the first time is noted on the code
    if (path === "/account" && typeof b.invite === "string") {
      const code = b.invite.trim().toUpperCase();
      if (/^[A-Z0-9-]{6,24}$/.test(code)) await sql`update public.invites set opened_at = now() where code = ${code} and opened_at is null`;
    }
    return c.body(null, 204);
  });
  return app;
}

/** what the admin panel shows for the last `range` days (admin.ts GET /visits) */
export async function visitReport(sql: Sql, range: number) {
  const days = await sql`
    with t as (select (now() at time zone ${TZ})::date as d)
    select to_char(g, 'YYYY-MM-DD') as day,
      coalesce(v.views, 0) as views, coalesce(v.visitors, 0) as visitors, coalesce(v.visits, 0) as visits, coalesce(v.mobile, 0) as mobile,
      (select count(*)::int from public.waitlist w where (w.created at time zone ${TZ})::date = g::date) as waitlist
    from t, generate_series(t.d - ${range - 1}::int, t.d, interval '1 day') g
    left join public.visit_days v on v.day = g::date
    order by g`;
  const from = days[0].day as string;
  const top = (kind: string, limit: number) => sql`
    select key, sum(n)::int as n from public.visit_counts
    where kind = ${kind} and day >= ${from}::date
    group by key order by n desc, key limit ${limit}`;
  const [pages, sources, countries] = await Promise.all([top("page", 15), top("source", 15), top("country", 12)]);
  // invited from the waiting list: how far each one got
  const sent = await sql<{ email: string; invited_at: Date; opened_at: Date | null; used_at: Date | null }[]>`
    select lower(w.email) as email, w.invited_at, i.opened_at, i.used_at
    from public.waitlist w left join public.invites i on i.code = w.invite
    where w.invited_at is not null`;
  const signedIn = new Set(
    (await sql<{ email: string }[]>`select email from public.signed_in_emails(${sent.map((s) => s.email)}::text[]) where last_sign_in_at is not null`).map((r) => r.email),
  );
  // a link opened is only noted since this was added (15 Nov 2026); before that, signing in
  // or joining shows it was
  const funnel = {
    sent: sent.length,
    opened: sent.filter((s) => s.opened_at || signedIn.has(s.email) || s.used_at).length,
    signed_in: sent.filter((s) => signedIn.has(s.email) || s.used_at).length,
    joined: sent.filter((s) => s.used_at).length,
  };
  return { days, pages, sources, countries, funnel };
}
