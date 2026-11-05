import { createHash } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Sql } from "postgres";

/* /api/errors: what broke in someone's browser, sent by the app on its own (src/data/errors.ts),
   from anyone, signed in or not. tilo-api's own faults go in the same table. Each distinct
   fault is one row with a count, so a fault that hits everyone is still one row. Nothing
   about the person is kept: no account, no IP address (the address only counts towards the
   rate limit, in memory). */

/** how many distinct faults the table holds; when full, it only counts the ones it has */
const MAX_ROWS = 2000;
/** reports one address may send in a minute, and all addresses together */
const PER_IP = 10;
const PER_MINUTE = 120;

export interface Fault {
  source: "app" | "api";
  message: unknown;
  stack?: unknown;
  page?: unknown;
  version?: unknown;
  browser?: unknown;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Counts a fault: a new row the first time, one more on its row after that. */
export async function record(sql: Sql, f: Fault, { known = false } = {}) {
  const message = text(f.message, 500);
  if (!message) return;
  const stack = text(f.stack, 4000);
  // the same fault has the same message (numbers aside) and the same first place in the code
  const where = stack.split("\n").map((l) => l.trim()).find((l) => /:\d+:\d+\)?$/.test(l)) ?? "";
  const sig = createHash("sha256").update(`${f.source}\n${message.replace(/\d+/g, "#")}\n${where}`).digest("hex").slice(0, 24);
  if (known) {
    await sql`update public.errors set count = count + 1, last_seen = now() where sig = ${sig}`;
    return;
  }
  // the path only: a query or fragment could carry something personal
  const page = text(f.page, 200).split(/[?#]/)[0];
  const row = { sig, source: f.source, message, stack, page, version: text(f.version, 40), browser: text(f.browser, 160) };
  await sql`
    insert into public.errors ${sql(row)}
    on conflict (sig) do update set count = errors.count + 1, last_seen = now(),
      page = excluded.page, version = excluded.version, browser = excluded.browser`;
}

export function errors(sql: Sql) {
  const app = new Hono();
  // in memory: a restart forgets, which is fine for keeping one sender from flooding
  const sent = new Map<string, number[]>();
  let all: number[] = [];

  app.post("/", bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.body(null, 413) }), async (c) => {
    // the Worker passes the visitor's address on; Caddy lets nothing else in on the server
    const ip = c.req.header("x-tilo-client-ip") || c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0].trim() || "?";
    const now = Date.now();
    const mine = (sent.get(ip) ?? []).filter((t) => now - t < 60_000);
    all = all.filter((t) => now - t < 60_000);
    if (mine.length >= PER_IP || all.length >= PER_MINUTE) return c.body(null, 429);
    if (sent.size > 5000) sent.clear();
    sent.set(ip, [...mine, now]);
    all.push(now);

    const b = await c.req.json().catch(() => null);
    if (typeof b?.message !== "string" || !b.message.trim()) return c.json({ error: "Send { message, stack, page, version, browser }." }, 400);
    const [{ n }] = await sql`select count(*)::int as n from public.errors`;
    await record(sql, { source: "app", message: b.message, stack: b.stack, page: b.page, version: b.version, browser: b.browser }, { known: n >= MAX_ROWS });
    return c.body(null, 204);
  });
  return app;
}
