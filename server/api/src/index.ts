import { statfs } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import postgres from "postgres";
import { account } from "./account.ts";
import { admin as adminRoutes } from "./admin.ts";
import { type AuthEnv, signedIn } from "./auth.ts";
import { claims } from "./claims.ts";
import { errors, record } from "./errors.ts";
import { makeDirs, purger } from "./files.ts";
import { moderation, reports } from "./mod.ts";
import { pieces } from "./pieces.ts";
import { preview } from "./preview.ts";
import { FORMAT, MAX_BYTES, summarise } from "./recording.ts";
import { school as schoolRoutes } from "./school.ts";
import { painterThread, screener } from "./screen.ts";
import { statuses } from "./status.ts";
import { wall as wallRoutes } from "./wall.ts";
import { mailer, waitlist } from "./waitlist.ts";

/* tilo-api: the part of the server that has to read what members send before it is stored,
   and everything that moves a piece's files. Simple writes (stamps, follows) go straight to
   Postgres through PostgREST.
   Caddy forwards /api/* here; the database is only reachable on the compose network. */

const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};

const sql = postgres(env("DATABASE_URL"), { max: 5, idle_timeout: 30 });
const member = signedIn(env("JWT_SECRET"));
const filesDir = env("FILES_DIR");
const site = env("PUBLIC_URL").replace(/\/$/, "");
// the Worker fetches files from the tunnel's address, so the edge caches them under that
// address as well as under the site's; a purge covers both
const edgeOrigin = process.env.EDGE_ORIGIN?.replace(/\/$/, "");
const purgeOne = purger(process.env.CF_ZONE_ID, process.env.CF_API_TOKEN);
const purge = (urls: string[]) => purgeOne(edgeOrigin ? [...urls, ...urls.map((u) => edgeOrigin + u.slice(site.length))] : urls);
const move = statuses(sql, { filesDir, site, purge });
const thread = painterThread();
const screen = screener(sql, { filesDir, move, trustAfter: Number(process.env.TRUST_AFTER ?? 3), thread });
const admin = { authUrl: env("AUTH_URL"), serviceKey: env("SERVICE_ROLE_KEY") };
const wall = wallRoutes(sql, { member, filesDir, thread, site, purge });
const school = schoolRoutes(sql, { member, jwtSecret: env("JWT_SECRET"), filesDir, thread });

const app = new Hono<AuthEnv>().basePath("/api");

// Docker's check: the process answers (a full disk mustn't stop the stack from starting)
app.get("/health/live", (c) => c.json({ ok: true }));

// the uptime check reads this: the database answers, and the disk isn't filling up
app.get("/health", async (c) => {
  await sql`select 1`;
  const disk = await statfs(filesDir);
  const free = disk.bavail / disk.blocks;
  const roomy = free > 0.1 && disk.bavail * disk.bsize > 2 ** 31;
  return c.json({ ok: roomy, format: FORMAT, disk_free: Math.round(free * 100) / 100 }, roomy ? 200 : 503);
});

app.route(
  "/me",
  account(sql, { member, filesDir, ...admin, site, purge, wall }),
);

// link previews; Caddy sends crawlers asking for /piece/{id} and /u/{handle} here
app.route("/og", preview(sql, { publicUrl: site }));

app.route("/pieces", pieces(sql, { member, filesDir, perDay: Number(process.env.PUBLISH_PER_DAY ?? 20), screener: screen, site, purge }));

const modOptions = { member, move, ...admin, holdAfter: Number(process.env.REPORTS_TO_HOLD ?? 3), perDay: 30, wall };
app.route("/reports", reports(sql, modOptions));
app.route("/mod", moderation(sql, modOptions));
app.route("/admin", adminRoutes(sql, { member, mail: mailer(process.env, site) }));
app.route("/waitlist", waitlist(sql));
app.route("/claims", claims(sql, { jwtSecret: env("JWT_SECRET"), site }));
app.route("/errors", errors(sql));
app.route("/wall", wall.app);
app.route("/school", school.app);

// reads a recording and says what is in it
app.post(
  "/check",
  member,
  bodyLimit({ maxSize: MAX_BYTES, onError: (c) => c.json({ error: "A recording can be 2 MB at most." }, 413) }),
  async (c) => {
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    try {
      return c.json(summarise(bytes));
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Not a Tilo recording" }, 422);
    }
  },
);

app.notFound((c) => c.json({ error: "No such endpoint." }, 404));
app.onError((e, c) => {
  console.error(e);
  // the route's pattern, not its path: /api/pieces/:id is one place however many pieces
  void record(sql, { source: "api", message: e.message || String(e), stack: e.stack, page: `${c.req.method} ${c.req.routePath}` }).catch(() => {});
  return c.json({ error: "The server hit a fault." }, 500);
});

await makeDirs(filesDir);
void screen.resume();
void wall.start();
void school.resume();

// what the privacy policy promises: Auth's sign-in log goes after 30 days, unused sessions
// after 90, answered takedown claims after three years, error reports 30 days after they
// were last seen, and a waiting-list address 90 days after its code went (a year if none did)
const prune = async () => {
  try {
    const [n] = await sql`select * from public.prune_sign_ins()`;
    const gone = await sql`delete from public.claims where status = 'closed' and closed_at < now() - interval '3 years' returning id`;
    const faults = await sql`delete from public.errors where last_seen < now() - interval '30 days' returning sig`;
    const waited = await sql`
      delete from public.waitlist
      where invited_at < now() - interval '90 days' or (invited_at is null and created < now() - interval '1 year')
      returning id`;
    if (n.log || n.sessions || gone.length || faults.length || waited.length)
      console.log(`pruned ${n.log} sign-in records, ${n.sessions} sessions, ${gone.length} claims, ${faults.length} error reports, ${waited.length} waiting-list addresses`);
  } catch (e) {
    console.error("pruning failed", e);
  }
};
void prune();
setInterval(prune, 24 * 3600_000).unref();

const server = serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8787) }, (info) =>
  console.log(`tilo-api on :${info.port}`),
);
// Caddy drops idle connections after 4 s (Caddyfile); Node waiting longer means Caddy
// always closes first and never sends a request down a connection Node is closing
if ("keepAliveTimeout" in server) server.keepAliveTimeout = 65_000;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close();
    void thread.stop();
    void sql.end({ timeout: 5 }).then(() => process.exit(0));
  });
}
