// End-to-end check of the running stack, through Caddy as the app will reach it: sign in
// with an emailed link (read from Mailpit), pick a handle with an invite, edit the profile,
// follow, stamp, publish, report, moderate, export, delete the account, and make sure the
// access rules hold.
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
const samples = await call("/rest/v1/pieces?owner=eq.71100000-0000-4000-8000-000000000001&select=id");
check(env.SAMPLES === "false" || samples.body?.length >= 1, "the sample pieces are published as @tilo", samples.body?.length);
const invites = await call("/rest/v1/invites?select=code", { token });
check(invites.status === 401 || invites.status === 403, "members can't read invite codes", invites);
const forge = await call("/rest/v1/pieces", { method: "POST", token, json: { id: "forged01", owner: userId, title: "x", strokes: 1, format: 2, bytes: 1 } });
check(forge.status === 401 || forge.status === 403, "members can't write pieces past tilo-api", forge);

// stamps on two pieces (written as tilo-api would): one live, one held
psql(`insert into public.pieces (id, owner, title, strokes, format, bytes, status, checked) values
  ('live${tag}', '${userId}', 'Smoke', 3, 3, 100, 'live', now()), ('held${tag}', '${userId}', 'Held', 3, 3, 100, 'held', now());`);
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

// the second member is a mod from here on
psql(`update public.profiles set role = 'mod' where id = '${other.id}'`);
const mod = (path: string, json: unknown, as = token2) => call(`/api/mod/${path}`, { method: "POST", token: as, json });
check((await mod(`pieces/live${tag}`, { action: "hide" }, token)).status === 403, "only mods can moderate");

// publishing through tilo-api: a form with the recording and what the studio knows; the
// server draws the picture itself and checks it before the piece goes anywhere
const LAYERS = [0, 1, 2].map((id) => ({ id, name: `Layer ${id + 1}`, blend: "source-over", opacity: 1 }));
const publish = (as: string | undefined, meta: Record<string, unknown>, recording: Uint8Array = encode(strokes)) => {
  const form = new FormData();
  form.set("meta", JSON.stringify({ title: "Smoke piece", paper: "cold", shape: "square", layers: LAYERS, minutes: 1.5, ...meta }));
  form.set("rec", new Blob([recording as Uint8Array<ArrayBuffer>]), "piece.tl");
  return call("/api/pieces", { method: "POST", token: as, body: form });
};
/** waits for the server's check, then says where the piece is: "live:", "held:new-member", ... */
const settled = async (id: string) => {
  for (let i = 0; i < 240; i++) {
    const s = psql(`select status || ':' || coalesce(why, '') from public.pieces where id = '${id}' and checked is not null`);
    if (s) return s;
    await sleep(250);
  }
  return "still checking";
};
const letIn = async (id: string) => (await settled(id), (await mod(`pieces/${id}`, { action: "approve" })).status);

const anonymous = await publish(undefined, {});
check(anonymous.status === 401, "publishing needs a session", anonymous);
check((await publish(token, { layers: LAYERS.slice(0, 2) })).status === 422, "a stroke on a layer the piece doesn't have is refused");
check((await publish(token, { subject: 312, minutes: 14 })).status === 422, "a piece past the 10:00 clock can't be entered for a subject");
check((await publish(token, {}, new Uint8Array([84, 76, 3, 9, 9]))).status === 422, "a broken recording is refused");
// proof of hand: a recording that couldn't have been drawn is refused
const retimed = (f: (s: Stroke, i: number) => number) => encode(strokes.map((s, i) => ({ ...s, t: f(s, i) })));
const old = await publish(token, {}, retimed((s) => s.t! - 20 * 365 * 864e5));
check(old.status === 422 && /before Tilo/.test(old.body.error), "a recording timed before Tilo existed is refused", old);
check((await publish(token, {}, retimed((s) => s.t! + 864e5))).status === 422, "a recording timed in the future is refused");
const backwards = await publish(token, {}, retimed((_, i) => t0 - i * 120_000));
check(backwards.status === 422 && /out of order/.test(backwards.body.error), "a recording whose strokes go back in time is refused", backwards);
const flick = Array.from({ length: 5 }, (_, i): Stroke => ({ tool: "ink", c: "#000000", w: 4, p: [0, i * 10, 50, 1500, i * 10, 50], t: t0 + i }));
const fast = await publish(token, { layers: [] }, encode(flick));
check(fast.status === 422 && /faster than a hand/.test(fast.body.error), "strokes faster than a hand are refused", fast);

const published = await publish(token, { title: "  Smoke   piece  ", subject: 312 });
const pid: string = published.body?.id ?? "";
check(
  published.status === 201 && /^[a-z0-9]{10}$/.test(pid) && published.body.title === "Smoke piece" && published.body.strokes === 4 && published.body.subject === 312 && published.body.minutes === 1.5,
  "a member publishes a piece",
  published,
);
check(published.body?.status === "held" && published.body.why === "check", "it waits for the server's check");
check(published.body?.proof === true, "a recording drawn in time earns the proof-of-hand badge", published.body?.proof);
check((await settled(pid)) === "held:new-member", "a new member's piece waits for a mod after the check");
const screened = JSON.parse(psql(`select screen from public.pieces where id = '${pid}'`) || "{}");
check(screened.frames >= 2 && screened.explicit < 0.25 && screened.sexy < 0.4, "the image check looked at frames along the replay and passed them", screened);
check((await fetch(`${BASE}/files/rec/${pid}.tl`)).status === 404, "a held piece's files aren't public");
check((await fetch(`${BASE}/files/private/rec/${pid}.tl`)).status === 404, "and the private folder isn't served");
const ownCopy = await fetch(`${BASE}/api/pieces/${pid}/rec`, { headers: { authorization: `Bearer ${token}` } });
check(ownCopy.ok && (await ownCopy.arrayBuffer()).byteLength === encode(strokes).length, "its artist still fetches the recording");
const ownPicture = await fetch(`${BASE}/api/pieces/${pid}/img`, { headers: { authorization: `Bearer ${token}` } });
check(ownPicture.ok && ownPicture.headers.get("content-type") === "image/webp", "and the picture the server drew");
const peek = await fetch(`${BASE}/api/pieces/held${tag}/rec`, { headers: { authorization: `Bearer ${token}` } });
check(peek.status === 404, "a piece's private files have to exist to be fetched");
psql(`update public.profiles set role = 'member' where id = '${other.id}'`);
check((await fetch(`${BASE}/api/pieces/${pid}/rec`, { headers: { authorization: `Bearer ${token2}` } })).status === 404, "nobody else can fetch them");
psql(`update public.profiles set role = 'mod' where id = '${other.id}'`);
check((await fetch(`${BASE}/api/pieces/${pid}/rec`, { headers: { authorization: `Bearer ${token2}` } })).ok, "a mod can");
const approved = await mod(`pieces/${pid}`, { action: "approve", note: "smoke" });
check(approved.status === 200 && psql(`select status || ' ' || (reviewed_by = '${other.id}') from public.pieces where id = '${pid}'`) === "live true", "a mod lets it into the gallery", approved);
check(psql(`select count(*) from public.mod_log where piece = '${pid}' and action = 'approve'`) === "1", "the action is logged");
const oneStroke = await publish(token, { title: "One stroke", layers: [] }, encode([strokes[0]]));
check(oneStroke.status === 201 && oneStroke.body.proof === false, "a piece with one stroke is published, without the badge", oneStroke.body?.proof);

// what another device sees: the row through PostgREST, the files through Caddy
const listed = await call(`/rest/v1/pieces?id=eq.${pid}&select=id,title,shape,paper,layers,picture,owner:profiles!pieces_owner_fkey(handle)`);
check(listed.body?.[0]?.owner?.handle === handle && listed.body[0].layers.length === 3 && listed.body[0].shape === "square", "anyone reads the published piece with its artist", listed);
const recFile = await fetch(`${BASE}/files/rec/${pid}.tl`);
const recBack = new Uint8Array(await recFile.arrayBuffer());
check(recFile.ok && recBack.length === encode(strokes).length && recBack.every((b, i) => b === encode(strokes)[i]), "the recording comes back byte for byte");
check(/immutable/.test(recFile.headers.get("cache-control") ?? ""), "recordings are cached for good");
const imgFile = await fetch(`${BASE}/files/img/${pid}.webp`);
const imgBytes = new Uint8Array(await imgFile.arrayBuffer());
check(imgFile.ok && imgFile.headers.get("content-type") === "image/webp" && new TextDecoder().decode(imgBytes.subarray(8, 12)) === "WEBP", "the picture is served as WebP", imgFile.headers.get("content-type"));
const remixed = await publish(token2, { title: "After smoke", remix_of: pid });
check(remixed.status === 201 && remixed.body.remix_of === pid, "another member publishes a remix that credits it", remixed);
check((await settled(remixed.body?.id)) === "live:", "a mod's own piece goes live after the check");
check((await publish(token2, { remix_of: `held${tag}` })).status === 422, "a held piece can't be remixed");
// remixing across accounts: the artist can switch it off, for others but not for themself
const closedPiece = await publish(token, { title: "Not for remixing", remixable: false });
check(closedPiece.status === 201 && closedPiece.body.remixable === false, "an artist publishes a piece others may not remix", closedPiece);
check((await letIn(closedPiece.body?.id)) === 200, "a mod lets that one in too");
const refusedRemix = await publish(token2, { remix_of: closedPiece.body?.id });
check(refusedRemix.status === 422 && /remixing off/.test(refusedRemix.body.error), "remixing it is refused for anyone else", refusedRemix);
const ownRemix = await publish(token, { title: "My own remix", remix_of: closedPiece.body?.id });
check(ownRemix.status === 201, "the artist can still remix their own piece", ownRemix);
await call(`/rest/v1/pieces?id=eq.${closedPiece.body?.id}`, { method: "PATCH", token: token2, json: { remixable: true } });
check(psql(`select remixable from public.pieces where id = '${closedPiece.body?.id}'`) === "f", "nobody else can switch remixing back on");
const reopened = await call(`/rest/v1/pieces?id=eq.${closedPiece.body?.id}`, { method: "PATCH", token, headers: { prefer: "return=representation" }, json: { remixable: true } });
check(reopened.body?.[0]?.remixable === true, "the artist switches remixing back on", reopened);
check((await publish(token2, { remix_of: closedPiece.body?.id })).status === 201, "and then others can remix it");
// the third piece a mod lets in makes the artist trusted: the next one goes straight live
check((await letIn(ownRemix.body?.id)) === 200, "a mod lets in a third piece");
const trustedPiece = await publish(token, { title: "Trusted now" });
check((await settled(trustedPiece.body?.id)) === "live:", "after three, the artist's pieces go live after the check alone");
// the gallery's Following tab: who the second member follows, then their pieces
const followees = (await call(`/rest/v1/follows?follower=eq.${other.id}&select=followee`)).body.map((f: { followee: string }) => f.followee);
const feed = await call(`/rest/v1/pieces?owner=in.(${followees.join(",")})&status=eq.live&select=id&order=created.desc`);
check(followees.includes(userId) && feed.body?.some((p: { id: string }) => p.id === pid), "the second member's Following feed has the first member's pieces", feed.body?.length);
check((await call("/rest/v1/follows", { method: "POST", token, json: { followee: userId } })).status >= 400, "nobody can follow themself");
check((await call(`/api/pieces/${pid}`, { method: "DELETE", token: token2 })).status === 404, "nobody else can take a piece down");
const retitle = await call(`/rest/v1/pieces?id=eq.${pid}`, { method: "PATCH", token, headers: { prefer: "return=representation" }, json: { title: "Smoke, retitled" } });
check(retitle.body?.[0]?.title === "Smoke, retitled", "the artist retitles it", retitle);
// link previews: crawlers get Open Graph tags, browsers get the app
const asCrawler = await fetch(`${BASE}/piece/${pid}`, { headers: { "user-agent": "facebookexternalhit/1.1" } }).then((r) => r.text());
check(asCrawler.includes(`<meta property="og:title" content="Smoke, retitled by @${handle}">`) && asCrawler.includes(`/files/img/${pid}.webp`), "a link preview shows the title and the picture");
const asBrowser = await fetch(`${BASE}/piece/${pid}`, { headers: { "user-agent": "Mozilla/5.0 Safari/605" } }).then((r) => r.text());
check(asBrowser.includes('id="root"') && !asBrowser.includes("og:title"), "a browser still gets the app");
check((await fetch(`${BASE}/piece/held${tag}`, { headers: { "user-agent": "Slackbot" } })).status === 404, "a held piece has no preview");

// reports: filed through tilo-api; one "nsfw" report takes a piece out of the gallery
check([401, 403].includes((await call("/rest/v1/reports", { method: "POST", token: token2, json: { piece: pid, reason: "spam" } })).status), "reports can't go around tilo-api");
const report = (json: unknown, as = token2) => call("/api/reports", { method: "POST", token: as, json });
check((await report({ piece: pid, reason: "bored" })).status === 400, "a report needs a reason from the list");
check((await report({ piece: pid, reason: "spam" }, token)).status === 400, "nobody reports their own piece");
check((await report({ piece: pid, reason: "spam", note: "smoke" })).status === 201, "a member reports a piece");
check(psql(`select status from public.pieces where id = '${pid}'`) === "live", "one spam report leaves it in the gallery");
check((await report({ piece: pid, reason: "spam" })).status === 201 && psql(`select count(*) from public.reports where piece = '${pid}'`) === "1", "reporting it again adds nothing");
check((await report({ profile: userId, reason: "abuse" })).status === 201, "a member reports a profile");
check((await call("/rest/v1/reports?select=id", { token })).body?.length === 0, "only mods read reports");
check((await call(`/rest/v1/reports?piece=eq.${pid}&select=id,reason`, { token: token2 })).body?.length === 1, "mods read them");
check((await report({ piece: trustedPiece.body?.id, reason: "nsfw" })).status === 201, "a member reports a piece as not for all ages");
check(psql(`select status || ':' || why from public.pieces where id = '${trustedPiece.body?.id}'`) === "held:reports", "it waits for a mod at once");
check((await fetch(`${BASE}/files/rec/${trustedPiece.body?.id}.tl`)).status === 404, "and its files stop being public");
check((await mod(`pieces/${trustedPiece.body?.id}`, { action: "approve" })).status === 200, "a mod finds nothing wrong and lets it back");
check(psql(`select status from public.reports where piece = '${trustedPiece.body?.id}'`) === "dismissed", "which closes the report");
check((await fetch(`${BASE}/files/rec/${trustedPiece.body?.id}.tl`)).ok, "and its files are public again");
const openId = psql(`select id from public.reports where piece = '${pid}' and status = 'open'`);
check((await mod(`reports/${openId}`, { action: "dismiss" })).status === 200, "a mod dismisses a report");
// hide keeps the piece for its artist; remove deletes its files
check((await mod(`pieces/${trustedPiece.body?.id}`, { action: "hide", note: "smoke" })).status === 200, "a mod hides a piece");
check((await call(`/rest/v1/pieces?id=eq.${trustedPiece.body?.id}&select=id`)).body?.length === 0, "a hidden piece isn't public");
check((await call(`/rest/v1/pieces?id=eq.${trustedPiece.body?.id}&select=status,why`, { token })).body?.[0]?.why === "mod", "its artist sees why");
check((await mod(`pieces/${trustedPiece.body?.id}`, { action: "remove" })).status === 200, "a mod removes it");
check((await fetch(`${BASE}/api/pieces/${trustedPiece.body?.id}/rec`, { headers: { authorization: `Bearer ${token}` } })).status === 404, "a removed piece's files are gone");
check((await mod(`pieces/${trustedPiece.body?.id}`, { action: "approve" })).status === 409, "and it can't come back");

// suspending a member hides their pieces and bans the account; lifting it brings both back
check((await mod(`members/${other.id}`, { action: "suspend" })).status === 400, "a mod can't suspend themself");
const suspended = await mod(`members/${userId}`, { action: "suspend", note: "smoke" });
check(suspended.status === 200 && suspended.body.pieces >= 3, "a mod suspends a member", suspended);
check(psql(`select count(*) from public.pieces where owner = '${userId}' and status = 'live'`) === "0", "their pieces leave the gallery");
check((await publish(token, {})).status === 400, "a suspended member can't publish");
const bannedLink = await fetch(`${BASE}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: env.SERVICE_ROLE_KEY, authorization: `Bearer ${env.SERVICE_ROLE_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: `smoke-${tag}@tilo.test` }),
}).then((r) => r.json());
const bannedVerify = await fetch((bannedLink.action_link ?? `${BASE}/auth/v1/verify`).replace(/^https?:\/\/[^/]+/, BASE), { redirect: "manual" });
check(!/access_token=/.test(bannedVerify.headers.get("location") ?? ""), "and can't sign in");
check((await mod(`members/${userId}`, { action: "unsuspend" })).status === 200, "a mod lifts the suspension");
check(psql(`select count(*) from public.pieces where id = '${pid}' and status = 'live'`) === "1", "their pieces come back");
check((await fetch(`${BASE}/files/rec/${pid}.tl`)).ok, "with their files");

// the daily limit counts every piece of the last 24 hours, published or not
psql(`insert into public.pieces (id, owner, title, strokes, format, bytes, checked)
  select 'fill${tag}' || n, '${userId}', 'Filler', 1, 3, 1, now() from generate_series(1, 20) n`);
const limited = await publish(token, {});
check(limited.status === 429, "the 21st piece in a day waits until tomorrow", limited);
psql(`delete from public.pieces where id like 'fill${tag}%'`);
const tidy = await publish(token, { title: "To take down" });
await settled(tidy.body?.id);
check((await call(`/api/pieces/${tidy.body?.id}`, { method: "DELETE", token })).status === 204, "the artist takes a piece down");
check((await fetch(`${BASE}/api/pieces/${tidy.body?.id}/rec`, { headers: { authorization: `Bearer ${token}` } })).status === 404, "its files go with it");

// export, then delete the account for good
const exported = await call("/api/me/export", { token });
check(
  exported.status === 200 && exported.body.profile?.handle === handle && exported.body.pieces.length === 7 && exported.body.followers[0]?.handle === `smoke_${tag}_b`,
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
