// End-to-end check of the running stack, through Caddy as the app will reach it: sign in
// with an emailed link (read from Mailpit), pick a handle with an invite, edit the profile,
// follow, stamp, export, delete the account, and make sure the access rules hold.
// Needs `npm run server:up` with COMPOSE_PROFILES=local (Mailpit).
// Usage: npm run server:smoke   (TILO_SERVER overrides http://localhost:8000)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { encode } from "../../src/engine/codec.ts";
import type { Stroke } from "../../src/engine/stroke.ts";

const BASE = process.env.TILO_SERVER ?? "http://localhost:8000";
const MAILPIT = "http://localhost:8025";
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
const call = async (path: string, init: RequestInit & { token?: string; json?: unknown } = {}) => {
  const headers = new Headers(init.headers);
  headers.set("apikey", env.ANON_KEY);
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  const body = init.json !== undefined ? JSON.stringify(init.json) : init.body;
  const res = await fetch(BASE + path, { ...init, headers, body });
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, body: data, headers: res.headers };
};
const psql = (query: string) =>
  execFileSync("docker", ["compose", "-f", COMPOSE, "exec", "-T", "db", "psql", "-U", "postgres", "-qtAc", query], { encoding: "utf8" }).trim();
const tag = Date.now().toString(36).slice(-6);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const health = await call("/api/health");
check(health.status === 200 && health.body.ok === true, "tilo-api is up and reaches the database", health);

// sign in the way a person does: ask for a link, open the email, follow the link
const email = `smoke-${tag}@tilo.test`;
const otp = await call("/auth/v1/otp", { method: "POST", json: { email, create_user: true } });
check(otp.status === 200, "Auth sends a sign-in link", otp);
let mail: { Subject: string; HTML: string } | null = null;
for (let i = 0; i < 20 && !mail; i++) {
  const found = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((r) => r.json());
  const id = found.messages?.[0]?.ID;
  if (id) mail = await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json());
  else await sleep(250);
}
check(/Your link to join Tilo/.test(mail?.Subject ?? ""), "the email arrives, and it is Tilo's own", mail?.Subject);
const link = /href="([^"]+\/auth\/v1\/verify[^"]+)"/.exec(mail?.HTML ?? "")?.[1]?.replaceAll("&amp;", "&") ?? "";
check(!!link, "the email's link goes through /auth/v1", /href="([^"]+)"/.exec(mail?.HTML ?? "")?.[1]);
if (!link) process.exit(1);
const verified = await fetch(link.replace(/^https?:\/\/[^/]+/, BASE), { redirect: "manual" });
const fragment = new URLSearchParams(verified.headers.get("location")?.split("#")[1] ?? "");
const token = fragment.get("access_token") ?? undefined;
check(verified.status >= 300 && verified.status < 400 && !!token, "following the link signs in", verified.headers.get("location"));

const me = await call("/api/me", { token });
const userId: string | undefined = me.body?.id;
check(me.status === 200 && me.body.email === email && me.body.profile === null, "tilo-api knows who is asking, before a handle", me);
check((await call("/api/me")).status === 401, "tilo-api refuses a request with no session");
check((await call("/api/me", { token: env.ANON_KEY })).status === 401, "tilo-api refuses the public anon key");
check((await call("/api/me", { token: token?.slice(0, -4) + "AAAA" })).status === 401, "tilo-api refuses a forged token");

// picking a handle, through the invite gate
const handle = `smoke_${tag}`;
const claim = (h: string, invite: string) => call("/rest/v1/rpc/claim_handle", { method: "POST", token, json: { handle: h, name: "Smoke Test", invite } });
const badInvite = await claim(handle, "NOPE-0000");
check(badInvite.status === 400 && badInvite.body.hint === "invite", "a wrong invite code is refused", badInvite);
psql(`insert into public.invites (code) values ('SMOKE-${tag.toUpperCase()}')`);
const reserved = await claim("admin", `SMOKE-${tag}`);
check(reserved.status === 400 && reserved.body.hint === "handle", "a reserved handle is refused", reserved);
const problem = await call("/rest/v1/rpc/handle_problem", { method: "POST", token, json: { handle: "No Spaces" } });
check(problem.status === 200 && typeof problem.body === "string", "the app can ask what's wrong with a handle", problem);
const claimed = await claim(handle, `smoke-${tag}`);
check(claimed.status === 200 && claimed.body.handle === handle, "the member picks a handle with a good invite", claimed);
const again = await claim(`${handle}x`, `SMOKE-${tag}`);
check(again.status === 400, "a handle can only be picked once", again);
const used = psql(`select used_by from public.invites where code = 'SMOKE-${tag.toUpperCase()}'`);
check(used === userId, "the invite is used up by this member", used);

// editing the profile
const edit = await call(`/rest/v1/profiles?id=eq.${userId}`, {
  method: "PATCH",
  token,
  headers: { prefer: "return=representation" },
  json: { name: "Smoke", bio: "Draws for tests." },
});
check(edit.status === 200 && edit.body?.[0]?.bio === "Draws for tests.", "the member edits their name and bio", edit);
const badRename = await call(`/rest/v1/profiles?id=eq.${userId}`, { method: "PATCH", token, json: { handle: "studio" } });
check(badRename.status === 400 && badRename.body.hint === "handle", "renaming to a reserved handle is refused", badRename);
const role = await call(`/rest/v1/profiles?id=eq.${userId}`, { method: "PATCH", token, json: { role: "admin" } });
check(role.status === 401 || role.status === 403, "members can't make themselves admin", role);

// a second member, made with the admin key, who follows the first
const other = await fetch(`${BASE}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: env.SERVICE_ROLE_KEY, authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({ email: `smoke-${tag}-b@tilo.test`, password: `pw-${crypto.randomUUID()}`, email_confirm: true }),
}).then((r) => r.json());
psql(`insert into public.profiles (id, handle) values ('${other.id}', 'smoke_${tag}_b')`);
// signed in through a link made by the admin API, so no second email is needed
const genLink = await fetch(`${BASE}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: env.SERVICE_ROLE_KEY, authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: `smoke-${tag}-b@tilo.test` }),
}).then((r) => r.json());
const otherVerify = await fetch(genLink.action_link.replace(/^https?:\/\/[^/]+/, BASE), { redirect: "manual" });
const token2 = new URLSearchParams(otherVerify.headers.get("location")?.split("#")[1] ?? "").get("access_token") ?? undefined;
check(!!token2, "a second member signs in");
const follow = await call("/rest/v1/follows", { method: "POST", token: token2, json: { followee: userId } });
check(follow.status === 201, "the second member follows the first", follow);
const page = await call("/rest/v1/rpc/profile_page", { method: "POST", token: token2, json: { handle } });
check(page.body?.handle === handle && page.body.followers === 1 && page.body.followed === true, "the profile page counts the follower", page);
const anonPage = await call("/rest/v1/rpc/profile_page", { method: "POST", json: { handle: handle.toUpperCase() } });
check(anonPage.body?.bio === "Draws for tests." && anonPage.body.followed === false, "anyone can open a profile page", anonPage);
const nobody = await call("/rest/v1/rpc/profile_page", { method: "POST", json: { handle: "no_such_handle" } });
check(nobody.status === 200 && nobody.body === null, "an unknown handle has no page", nobody);

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
const forge = await call("/rest/v1/pieces", { method: "POST", token, json: { id: "forged01", owner: userId, title: "x", strokes: 1, format: 2, bytes: 1 } });
check(forge.status === 401 || forge.status === 403, "members can't write pieces past tilo-api", forge);

// stamps on two pieces (written as tilo-api would): one live, one held
psql(`insert into public.pieces (id, owner, title, strokes, format, bytes, status) values
  ('live${tag}', '${userId}', 'Smoke', 3, 3, 100, 'live'), ('held${tag}', '${userId}', 'Held', 3, 3, 100, 'held');`);
const stamp = (piece: string) => call("/rest/v1/stamps", { method: "POST", token: token2, json: { piece, kind: "Bold" } });
check((await stamp(`live${tag}`)).status === 201, "a member stamps a live piece");
const counted = await call(`/rest/v1/pieces?id=eq.live${tag}&select=stamps`);
check(counted.body?.[0]?.stamps?.Bold === 1, "the stamp count on the piece goes up", counted);
check([401, 403].includes((await stamp(`held${tag}`)).status), "a held piece can't be stamped");
check((await call(`/rest/v1/pieces?id=eq.held${tag}&select=id`)).body?.length === 0, "a held piece isn't public");
check((await call(`/rest/v1/pieces?id=eq.held${tag}&select=id`, { token })).body?.length === 1, "its owner still sees it");
await call(`/rest/v1/stamps?piece=eq.live${tag}&kind=eq.Bold`, { method: "DELETE", token: token2 });
const uncounted = await call(`/rest/v1/pieces?id=eq.live${tag}&select=stamps`);
check(JSON.stringify(uncounted.body?.[0]?.stamps) === "{}", "taking the stamp back counts it down", uncounted);
const filed = await call("/rest/v1/reports", { method: "POST", token: token2, json: { piece: `live${tag}`, reason: "spam" } });
check(filed.status === 201, "a member files a report", filed);
const reports = await call("/rest/v1/reports?select=id", { token: token2 });
check(reports.status === 200 && Array.isArray(reports.body) && reports.body.length === 0, "only mods read reports", reports);

// publishing through tilo-api: a form with the recording, a picture and what the studio knows
const WEBP = new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8 "), 0, 0, 0, 0]);
const LAYERS = [0, 1, 2].map((id) => ({ id, name: `Layer ${id + 1}`, blend: "source-over", opacity: 1 }));
const publish = (as: string | undefined, meta: Record<string, unknown>, recording: Uint8Array = encode(strokes), picture: Uint8Array = WEBP) => {
  const form = new FormData();
  form.set("meta", JSON.stringify({ title: "Smoke piece", paper: "cold", shape: "square", layers: LAYERS, minutes: 1.5, ...meta }));
  form.set("rec", new Blob([recording as Uint8Array<ArrayBuffer>]), "piece.tl");
  form.set("img", new Blob([picture as Uint8Array<ArrayBuffer>]), "piece.webp");
  return call("/api/pieces", { method: "POST", token: as, body: form });
};
const anonymous = await publish(undefined, {});
check(anonymous.status === 401, "publishing needs a session", anonymous);
check((await publish(token, { layers: LAYERS.slice(0, 2) })).status === 422, "a stroke on a layer the piece doesn't have is refused");
check((await publish(token, {}, encode(strokes), new TextEncoder().encode("<svg/>"))).status === 422, "a picture that isn't WebP or JPEG is refused");
check((await publish(token, { subject: 312, minutes: 14 })).status === 422, "a piece past the 10:00 clock can't be entered for a subject");
check((await publish(token, {}, new Uint8Array([84, 76, 3, 9, 9]))).status === 422, "a broken recording is refused");
const published = await publish(token, { title: "  Smoke   piece  ", subject: 312 });
const pid: string = published.body?.id ?? "";
check(
  published.status === 201 && /^[a-z0-9]{10}$/.test(pid) && published.body.title === "Smoke piece" && published.body.strokes === 4 && published.body.subject === 312 && published.body.minutes === 1.5,
  "a member publishes a piece",
  published,
);
// what another device sees: the row through PostgREST, the files through Caddy
const listed = await call(`/rest/v1/pieces?id=eq.${pid}&select=id,title,shape,paper,layers,picture,owner:profiles!pieces_owner_fkey(handle)`);
check(listed.body?.[0]?.owner?.handle === handle && listed.body[0].layers.length === 3 && listed.body[0].shape === "square", "anyone reads the published piece with its artist", listed);
const recFile = await fetch(`${BASE}/files/rec/${pid}.tl`);
const recBack = new Uint8Array(await recFile.arrayBuffer());
check(recFile.ok && recBack.length === encode(strokes).length && recBack.every((b, i) => b === encode(strokes)[i]), "the recording comes back byte for byte");
check(/immutable/.test(recFile.headers.get("cache-control") ?? ""), "recordings are cached for good");
const imgFile = await fetch(`${BASE}/files/img/${pid}.webp`);
check(imgFile.ok && imgFile.headers.get("content-type") === "image/webp", "the picture is served as WebP", imgFile.headers.get("content-type"));
const remixed = await publish(token2, { title: "After smoke", remix_of: pid });
check(remixed.status === 201 && remixed.body.remix_of === pid, "another member publishes a remix that credits it", remixed);
check((await publish(token2, { remix_of: `held${tag}` })).status === 422, "a held piece can't be remixed");
check((await call(`/api/pieces/${pid}`, { method: "DELETE", token: token2 })).status === 404, "nobody else can take a piece down");
const retitle = await call(`/rest/v1/pieces?id=eq.${pid}`, { method: "PATCH", token, headers: { prefer: "return=representation" }, json: { title: "Smoke, retitled" } });
check(retitle.body?.[0]?.title === "Smoke, retitled", "the artist retitles it", retitle);
// the daily limit counts every piece of the last 24 hours: one published above, two from the stamp checks
psql(`insert into public.pieces (id, owner, title, strokes, format, bytes)
  select 'fill${tag}' || n, '${userId}', 'Filler', 1, 3, 1 from generate_series(1, 17) n`);
const limited = await publish(token, {});
check(limited.status === 429, "the 21st piece in a day waits until tomorrow", limited);
psql(`delete from public.pieces where id like 'fill${tag}%'`);
const tidy = await publish(token, { title: "To take down" });
check((await call(`/api/pieces/${tidy.body?.id}`, { method: "DELETE", token })).status === 204, "the artist takes a piece down");
check((await fetch(`${BASE}/files/rec/${tidy.body?.id}.tl`)).status === 404, "its files go with it");

// export, then delete the account for good
const exported = await call("/api/me/export", { token });
check(
  exported.status === 200 && exported.body.profile?.handle === handle && exported.body.pieces.length === 3 && exported.body.followers[0]?.handle === `smoke_${tag}_b`,
  "the member exports everything Tilo keeps about them",
  exported.status,
);
check(/attachment; filename="tilo-smoke_/.test(exported.headers.get("content-disposition") ?? ""), "the export downloads as a file");
check((await call("/api/me", { token, method: "DELETE", json: {} })).status === 400, "deleting needs an explicit confirm");
const gone = await call("/api/me", { token, method: "DELETE", json: { confirm: true } });
check(gone.status === 204, "the member deletes their account", gone);
check((await call("/rest/v1/rpc/profile_page", { method: "POST", json: { handle } })).body === null, "their profile is gone");
check(psql(`select count(*) from public.pieces where owner = '${userId}'`) === "0", "their pieces are gone");
check(psql(`select count(*) from public.follows where followee = '${userId}'`) === "0", "follows of them are gone");
check((await fetch(`${BASE}/files/img/${pid}.webp`)).status === 404, "their published files are gone");
check(psql(`select remix_of is null from public.pieces where id = '${remixed.body?.id}'`) === "t", "a remix of theirs stays, without the link");
check(psql(`select count(*) from public.invites where used_by = '${userId}'`) === "0", "the invite no longer points at them");
check(psql(`select used_at is not null from public.invites where code = 'SMOKE-${tag.toUpperCase()}'`) === "t", "their invite stays used up");
psql(`delete from public.invites where code = 'SMOKE-${tag.toUpperCase()}'`);

// tidy up the second member
const removed = await fetch(`${BASE}/auth/v1/admin/users/${other.id}`, {
  method: "DELETE",
  headers: { apikey: env.SERVICE_ROLE_KEY, authorization: `Bearer ${env.SERVICE_ROLE_KEY}` },
});
check(removed.ok, "the second test member is removed again", removed.status);

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
