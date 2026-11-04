// End-to-end check of the running stack, through Caddy as the app will reach it:
// sign up, call tilo-api as that member, send it a recording, and make sure the access
// rules hold. Removes its test member afterwards. Needs `npm run server:up` first.
// Usage: npm run server:smoke   (TILO_SERVER overrides http://localhost:8000)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { encode } from "../../src/engine/codec.ts";
import type { Stroke } from "../../src/engine/stroke.ts";

const BASE = process.env.TILO_SERVER ?? "http://localhost:8000";
const COMPOSE = fileURLToPath(new URL("../docker-compose.yml", import.meta.url));
const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

let failed = 0;
const check = (ok: boolean, what: string, detail?: unknown) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok || detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};
const call = async (path: string, init: RequestInit & { token?: string } = {}) => {
  const headers = new Headers(init.headers);
  headers.set("apikey", env.ANON_KEY);
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  const res = await fetch(BASE + path, { ...init, headers });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body };
};

const health = await call("/api/health");
check(health.status === 200 && health.body.ok === true, "tilo-api is up and reaches the database", health);

// a new member; on this computer Auth confirms the address straight away
const email = `smoke-${Date.now()}@tilo.test`;
const signup = await call("/auth/v1/signup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password: crypto.randomUUID() }),
});
const token: string | undefined = signup.body?.access_token;
const userId: string | undefined = signup.body?.user?.id;
check(signup.status === 200 && !!token && !!userId, "a test member signs up", signup);

const me = await call("/api/me", { token });
check(me.status === 200 && me.body.id === userId && me.body.email === email, "tilo-api knows who is asking", me);
check((await call("/api/me")).status === 401, "tilo-api refuses a request with no session");
check((await call("/api/me", { token: env.ANON_KEY })).status === 401, "tilo-api refuses the public anon key");
check((await call("/api/me", { token: token?.slice(0, -4) + "AAAA" })).status === 401, "tilo-api refuses a forged token");

// a small recording, written by the studio's own codec
const t0 = Date.now() - 90_000;
const strokes: Stroke[] = [
  { tool: "pencil", c: "#1B1E1D", w: 4, p: [100, 100, 40, 160, 130, 55, 220, 170, 60], t: t0 },
  { tool: "ink", c: "#2D4BB3", w: 6, p: [300, 300, 50, 340, 360, 70], t: t0 + 30_000, l: 1 },
  { tool: "dup", c: "#000000", w: 0, p: [], t: t0 + 60_000, l: 2, src: 1 },
  { tool: "wash", c: "#EE3A8C", w: 30, p: [500, 500, 50, 620, 540, 50], t: t0 + 90_000, l: 2, a: 0.6 },
];
const rec = await call("/api/check", { method: "POST", token, body: encode(strokes) as Uint8Array<ArrayBuffer> });
check(
  rec.status === 200 && rec.body.strokes === 4 && rec.body.drawn === 3 && rec.body.layers === 3 && rec.body.seconds === 90,
  "tilo-api decodes a recording with the shared codec",
  rec,
);
const junk = await call("/api/check", { method: "POST", token, body: new Uint8Array([1, 2, 3]) });
check(junk.status === 422, "tilo-api turns away bytes that aren't a recording", junk);
const big = await call("/api/check", { method: "POST", token, body: new Uint8Array(2 * 1024 * 1024 + 1) });
check(big.status === 413, "tilo-api turns away anything over 2 MB", big.status);

// the access rules, through PostgREST
const pieces = await call("/rest/v1/pieces?select=id");
check(pieces.status === 200 && Array.isArray(pieces.body), "anyone can list live pieces", pieces);
const invites = await call("/rest/v1/invites?select=code", { token });
check(invites.status === 401 || invites.status === 403, "members can't read invite codes", invites);
const forge = await call("/rest/v1/pieces", {
  method: "POST",
  token,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id: "forged01", owner: userId, title: "x", strokes: 1, format: 2, bytes: 1 }),
});
check(forge.status === 401 || forge.status === 403, "members can't write pieces past tilo-api", forge);
const role = await call(`/rest/v1/profiles?id=eq.${userId}`, {
  method: "PATCH",
  token,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ role: "admin" }),
});
check(role.status === 401 || role.status === 403, "members can't make themselves admin", role);
// stamps: give the member a profile and two pieces (as tilo-api would), then stamp them
const psql = (query: string) =>
  execFileSync("docker", ["compose", "-f", COMPOSE, "exec", "-T", "db", "psql", "-U", "postgres", "-qtAc", query], { encoding: "utf8" });
const tag = Date.now().toString(36).slice(-6);
psql(`insert into public.profiles (id, handle) values ('${userId}', 'smoke_${tag}');
  insert into public.pieces (id, owner, title, strokes, format, bytes, status) values
    ('live${tag}', '${userId}', 'Smoke', 3, 3, 100, 'live'), ('held${tag}', '${userId}', 'Held', 3, 3, 100, 'held');`);
const stamp = (piece: string) =>
  call("/rest/v1/stamps", { method: "POST", token, headers: { "content-type": "application/json" }, body: JSON.stringify({ piece, kind: "Bold" }) });
check((await stamp(`live${tag}`)).status === 201, "a member stamps a live piece");
const counted = await call(`/rest/v1/pieces?id=eq.live${tag}&select=stamps`);
check(counted.body?.[0]?.stamps?.Bold === 1, "the stamp count on the piece goes up", counted);
check([401, 403].includes((await stamp(`held${tag}`)).status), "a held piece can't be stamped");
check((await call(`/rest/v1/pieces?id=eq.held${tag}&select=id`)).body?.length === 0, "a held piece isn't public");
check((await call(`/rest/v1/pieces?id=eq.held${tag}&select=id`, { token })).body?.length === 1, "its owner still sees it");
await call(`/rest/v1/stamps?piece=eq.live${tag}&kind=eq.Bold`, { method: "DELETE", token });
const uncounted = await call(`/rest/v1/pieces?id=eq.live${tag}&select=stamps`);
check(JSON.stringify(uncounted.body?.[0]?.stamps) === "{}", "taking the stamp back counts it down", uncounted);

const filed = await call("/rest/v1/reports", {
  method: "POST",
  token,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ piece: `live${tag}`, reason: "spam" }),
});
check(filed.status === 201, "a member files a report", filed);
const report = await call("/rest/v1/reports?select=id", { token });
check(report.status === 200 && Array.isArray(report.body) && report.body.length === 0, "only mods read reports", report);

// tidy up: remove the test member with the admin key
if (userId) {
  const res = await fetch(`${BASE}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: env.SERVICE_ROLE_KEY, authorization: `Bearer ${env.SERVICE_ROLE_KEY}` },
  });
  check(res.ok, "the test member is removed again", res.status);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
