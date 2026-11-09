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
const terms = await call("/rest/v1/rpc/terms_version", { method: "POST", json: {} });
check(terms.status === 200 && /^\d{4}-\d{2}-\d{2}$/.test(terms.body), "anyone can ask which terms are current", terms);
const claim = (h: string, invite: string, agreed = terms.body) =>
  call("/rest/v1/rpc/claim_handle", { method: "POST", token, json: { handle: h, name: "Smoke Test", invite, agreed } });
const unagreed = await claim(handle, "NOPE-0000", "");
check(unagreed.status === 400 && unagreed.body.hint === "agreed", "a handle needs the age and terms confirmed", unagreed);
check((await claim(handle, "NOPE-0000", "2020-01-01")).body?.hint === "agreed", "and the current terms, not old ones");
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
check(psql(`select terms from public.agreements where member = '${userId}'`) === terms.body, "what they agreed to is kept");
check((await call(`/rest/v1/agreements?select=terms`)).status >= 400, "and nobody signed out can read it");

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
const notMod = await mod(`pieces/live${tag}`, { action: "hide" }, token);
check(notMod.status === 403, "only mods can moderate", notMod);

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
// pixel art (format 4): a pixel sheet on plain paper, which the server draws cell by cell
const pixels: Stroke[] = [
  { tool: "pixel", c: "#B13E53", w: 40, p: [20, 20, 50, 220, 100, 50], t: t0, g: 32 },
  { tool: "pixelfill", c: "#41A6F6", w: 40, p: [620, 620, 50], t: t0 + 20_000, g: 32 },
  { tool: "pixelerase", c: "#B13E53", w: 40, p: [60, 20, 50], t: t0 + 40_000, g: 32 },
];
const pixelPiece = await publish(token, { title: "Pixel smoke", paper: "plain", shape: "px32", layers: [] }, encode(pixels));
check(pixelPiece.status === 201, "a pixel piece is published", pixelPiece);
const pxid: string = pixelPiece.body?.id ?? "";
check((await settled(pxid)) === "held:new-member" && psql(`select shape || ' ' || paper || ' ' || format from public.pieces where id = '${pxid}'`) === "px32 plain 4", "the server checks it and keeps its grid, paper and format");
check((await publish(token, { shape: "px24" }, encode(pixels))).status === 400, "a grid Tilo doesn't have is refused");

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
check((await mod(`pieces/${remixed.body?.id}`, { action: "hide" })).status === 200, "a mod hides their own piece");
check((await mod(`pieces/${remixed.body?.id}`, { action: "approve" })).status === 403, "but another mod has to let it back in");
psql(`update public.profiles set role = 'admin' where id = '${other.id}'`);
check((await mod(`pieces/${remixed.body?.id}`, { action: "approve" })).status === 200, "or an admin, who has nobody above them");
psql(`update public.profiles set role = 'mod' where id = '${other.id}'`);
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

// the admin panel: only admins, who see members with their email addresses
const adm = (path: string, init: { method?: string; json?: unknown } = {}, as = token2) => call(`/api/admin/${path}`, { ...init, token: as });
check((await adm("stats")).status === 403, "a mod can't open the admin panel");
psql(`update public.profiles set role = 'admin' where id = '${other.id}'`);
const stats = await adm("stats");
check(stats.status === 200 && stats.body.members >= 2 && stats.body.days?.length === 14, "an admin sees the numbers, with 14 days of publishing", stats.body);
const found = await adm(`members?q=smoke_${tag}`);
check(found.body?.members?.length === 2 && found.body.members.some((m: { email: string }) => m.email === `smoke-${tag}@tilo.test`), "an admin finds members by handle, with their email", found.body);
const first = found.body?.members?.find((m: { id: string }) => m.id === userId);
check(first?.invite === `SMOKE-${tag.toUpperCase()}` && first.live >= 1, "and sees the invite they joined with and their pieces", first);
check((await adm(`members?q=smoke-${tag}@`)).body?.members?.length === 1, "searching by email works too");
check((await adm(`members/${userId}`, { method: "POST", json: { role: "mod" } })).status === 200 && psql(`select role from public.profiles where id = '${userId}'`) === "mod", "an admin makes a member a mod");
check((await adm(`members/${userId}`, { method: "POST", json: { role: "member" } })).status === 200, "and a member again");
check((await adm(`members/${other.id}`, { method: "POST", json: { role: "member" } })).status === 400, "an admin can't change their own role");
check((await adm(`members/${userId}`, { method: "POST", json: { role: "owner" } })).status === 400, "roles are member, mod or admin");
const made = await adm("invites", { method: "POST", json: { count: 3, note: `smoke ${tag}` } });
const codes: string[] = made.body?.codes ?? [];
check(made.status === 201 && codes.length === 3 && codes.every((c) => /^TILO-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c)), "an admin makes invite codes", made.body);
const unused = await adm("invites?used=no");
check(codes.every((c) => unused.body?.invites?.some((i: { code: string; note: string }) => i.code === c && i.note === `smoke ${tag}`)), "they are listed as unused, with their note");
check((await adm("invites?used=yes")).body?.invites?.some((i: { code: string; used_by: string }) => i.code === `SMOKE-${tag.toUpperCase()}` && i.used_by === handle), "used codes say who used them");
check((await adm(`invites/${codes[0]}`, { method: "DELETE" })).status === 204, "an admin withdraws an unused code");
check((await adm(`invites/SMOKE-${tag.toUpperCase()}`, { method: "DELETE" })).status === 404, "but not one that was used");
check((await adm("invites", { method: "POST", json: { count: 0 } })).status === 400, "codes come 1 to 50 at a time");
psql(`delete from public.invites where note = 'smoke ${tag}'`);
check((await adm("settings")).body?.invites_required === "true", "an admin reads the settings");
check((await adm("settings", { method: "PUT", json: { invites_required: "maybe" } })).status === 400, "a setting only takes its own values");
check((await adm("settings", { method: "PUT", json: { invites_required: false } })).status === 200 && psql(`select value from tilo_meta.settings where key = 'invites_required'`) === "false", "an admin opens sign-up without invites");
await adm("settings", { method: "PUT", json: { invites_required: true } });
check(psql(`select value from tilo_meta.settings where key = 'invites_required'`) === "true", "and closes it again");
check((await adm("stats", {}, token)).status === 403, "a member can't open the admin panel");

// invite codes members hand out: a few each, made one at a time, taken back while unused
const myInv = (init: { method?: string } = {}, path = "", as = token) => call(`/api/me/invites${path}`, { ...init, token: as });
const myCodes = await myInv();
check(myCodes.status === 200 && myCodes.body.per === 3 && myCodes.body.left === 3 && myCodes.body.codes.length === 0 && myCodes.body.open === false, "a member has 3 invite codes to hand out", myCodes.body);
const handedOut: string[] = [];
for (let i = 0; i < 3; i++) handedOut.push((await myInv({ method: "POST" })).body?.code);
check(handedOut.every((c) => /^TILO-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c ?? "")), "they make them one at a time", handedOut);
const fourth = await myInv({ method: "POST" });
check(fourth.status === 429 && (await myInv()).body?.left === 0, "a fourth is refused", fourth);
check((await myInv({ method: "DELETE" }, `/${handedOut[0]}`)).status === 204 && (await myInv()).body?.left === 1, "taking back an unused code frees its place");
check((await myInv({ method: "DELETE" }, `/${handedOut[1]}`, token2)).status === 404, "nobody else can take it back");
check((await myInv({}, "", token2)).body?.admin === true && (await myInv({ method: "POST" }, "", token2)).status === 400, "admins make theirs in the admin panel instead");
check((await adm("settings", { method: "PUT", json: { invites_per_member: "11" } })).status === 400, "codes per member go from 0 to 10");
check((await adm("settings", { method: "PUT", json: { invites_per_member: "0" } })).status === 200 && (await myInv({ method: "POST" })).status === 429, "with none per member, members make no codes");
await adm("settings", { method: "PUT", json: { invites_per_member: "3" } });
check((await adm("invites?used=no")).body?.invites?.some((i: { code: string; made_by: string }) => i.code === handedOut[1] && i.made_by === handle), "the admin panel shows who handed a code out");
psql(`update public.invites set used_at = now() where code = '${handedOut[2]}'`);
check(!!(await myInv()).body?.codes?.find((c: { code: string }) => c.code === handedOut[2])?.used_at && (await myInv({ method: "DELETE" }, `/${handedOut[2]}`)).status === 404, "a used code stays on the list and can't be taken back");

// the feedback box: members send it, admins and mods read it and tick it off
const fb = await call("/rest/v1/feedback", { method: "POST", token, headers: { prefer: "return=minimal" }, json: { kind: "problem", text: "The eraser skips.", page: "/studio", device: "Smoke 1 · Test · 390×844" } });
check(fb.status === 201, "a member sends feedback", fb);
check((await call("/rest/v1/feedback", { method: "POST", json: { kind: "idea", text: "Hi" } })).status >= 400, "signed out, feedback can't be sent");
check((await call("/rest/v1/feedback", { method: "POST", token, json: { kind: "rant", text: "Hi" } })).status === 400, "feedback is a problem, an idea or something else");
check((await call("/rest/v1/feedback?select=id", { token })).body?.length === 0, "members can't read feedback, not even their own");
const fbRow = await call(`/rest/v1/feedback?select=id,kind,page,device,done&member=eq.${userId}`, { token: token2 });
const fbId = fbRow.body?.[0]?.id;
check(fbRow.body?.[0]?.kind === "problem" && fbRow.body[0].page === "/studio" && fbRow.body[0].device.startsWith("Smoke") && fbRow.body[0].done === false, "an admin reads it, with the page and the device", fbRow.body);
const ticked = await call(`/rest/v1/feedback?id=eq.${fbId}`, { method: "PATCH", token: token2, headers: { prefer: "return=representation" }, json: { done: true } });
check(ticked.body?.[0]?.done === true, "and ticks it off", ticked.body);
const memberTick = await call(`/rest/v1/feedback?id=eq.${fbId}`, { method: "PATCH", token, headers: { prefer: "return=representation" }, json: { done: false } });
check(Array.isArray(memberTick.body) && memberTick.body.length === 0, "a member can't", memberTick.body);
check((await call(`/rest/v1/feedback?id=eq.${fbId}`, { method: "PATCH", token: token2, json: { text: "Changed" } })).status >= 400, "nobody rewrites what was sent");
psql(`insert into public.feedback (member, text) select '${userId}', 'filler' from generate_series(1, 19)`);
const tooMuch = await call("/rest/v1/feedback", { method: "POST", token, json: { text: "One more" } });
check(tooMuch.status === 400 && tooMuch.body?.hint === "limit", "the 21st message in a day is refused", tooMuch);
psql(`delete from public.feedback where member = '${userId}' and text = 'filler'`);

// error reports: from anyone, one row per distinct fault, read by admins through tilo-api
const fault = {
  message: `TypeError: smoke ${tag} is not a function`,
  stack: `TypeError: smoke ${tag} is not a function\n    at draw (https://tiloart.com/assets/Studio-x1.js:1:2345)`,
  page: "/piece/abcdef?secret=1#x",
  version: "0.8.0",
  browser: "Smoke 1 · Test",
};
const sendFault = (json: Record<string, unknown>, ip = `smoke-${tag}`) => call("/api/errors", { method: "POST", headers: { "cf-connecting-ip": ip }, json });
check((await sendFault(fault)).status === 204, "anyone sends an error report, without signing in");
await sendFault({ ...fault, browser: "Smoke 2 · Test" });
const faultRow = psql(`select count || ' ' || page || ' ' || browser from public.errors where message = '${fault.message}'`);
check(faultRow === "2 /piece/abcdef Smoke 2 · Test", "the same fault twice is one row, counted twice, with no query string", faultRow);
check((await sendFault({ message: " " })).status === 400, "a report has to say what broke");
const flood: number[] = [];
for (let i = 0; i < 11; i++) flood.push((await sendFault({ message: `flood ${tag} ${i}` }, `flood-${tag}`)).status);
check(flood.slice(0, 10).every((st) => st === 204) && flood[10] === 429, "one sender gets 10 reports a minute", flood);
check(psql(`select count(*) || ' ' || max(count) from public.errors where message like 'flood ${tag} %'`) === "1 10", "faults differing only in numbers are one row");
const faults = await adm("errors");
const ours = faults.body?.errors?.find((e: { message: string }) => e.message === fault.message);
check(ours?.count === 2 && ours.source === "app" && ours.version === "0.8.0" && ours.stack.includes("Studio-x1.js"), "an admin sees it, with its count and where in the code", ours);
check((await adm("stats")).body?.errors >= 2, "and counts this week's on the overview");
check((await adm("errors", {}, token)).status === 403, "a member doesn't see error reports");
check((await call("/rest/v1/errors?select=sig", { token: token2 })).status >= 400, "the table isn't reachable through PostgREST, even by an admin");
check((await adm(`errors/${ours?.sig}`, { method: "DELETE" })).status === 204 && psql(`select count(*) from public.errors where sig = '${ours?.sig}'`) === "0", "an admin marks it fixed");
psql(`delete from public.errors where message like 'flood ${tag} %'`);

// takedown claims: anyone may send one, about a piece or profile on Tilo; admins answer
const site = env.PUBLIC_URL.replace(/\/$/, "");
const sendClaim = (json: Record<string, unknown>, as?: string) =>
  // each run as its own sender, so the hourly limit per address doesn't trip on reruns
  call("/api/claims", { method: "POST", token: as, headers: { "cf-connecting-ip": `smoke-${tag}` }, json: { kind: "abuse", name: "Smoke Claimant", email: `claim-${tag}@tilo.test`, details: "This piece is aimed at a person.", ...json } });
check((await sendClaim({ url: "https://example.com/piece/abcdef" })).body?.field === "url", "a claim must be about something on Tilo");
check((await sendClaim({ url: `${site}/gallery` })).body?.field === "url", "a piece or a profile, that is");
check((await sendClaim({ url: `${site}/piece/zzzzzz9` })).status === 404, "one that exists");
check((await sendClaim({ url: `/u/${handle}`, email: "nope" })).body?.field === "email", "with an address to answer");
check((await sendClaim({ url: `/u/${handle}`, kind: "copyright" })).body?.field === "sworn", "a copyright claim needs the statement");
const sentClaim = await sendClaim({ url: `${site}/piece/${pid}`, kind: "copyright", sworn: true });
check(sentClaim.status === 201 && typeof sentClaim.body.id === "number", "someone without an account sends a claim", sentClaim);
const memberClaim = await sendClaim({ url: `/u/smoke_${tag}_b` }, token);
check(memberClaim.status === 201 && psql(`select member from public.claims where id = ${memberClaim.body.id}`) === userId, "a member's claim says who sent it", memberClaim);
check((await call(`/rest/v1/claims?select=id`, { token: token2 })).status >= 400, "claims can't be read through PostgREST, even by an admin");
const open = await adm("claims");
const mine = open.body?.claims?.find((k: { id: number }) => k.id === sentClaim.body.id);
check(mine?.piece === pid && mine?.about === handle && mine?.email === `claim-${tag}@tilo.test`, "an admin sees the open claim, with what it's about", open.body);
check((await adm("stats")).body?.claims >= 2, "and counts them on the overview");
check((await adm(`claims/${sentClaim.body.id}`, { method: "POST", json: {} })).status === 400, "answering says what was done");
check((await adm(`claims/${sentClaim.body.id}`, { method: "POST", json: { outcome: "Not theirs to claim; kept." } })).status === 200, "an admin answers a claim");
check(psql(`select count(*) from public.mod_log where claim = ${sentClaim.body.id} and action = 'claim'`) === "1", "the answer is in the log");
check((await adm("claims?status=closed")).body?.claims?.some((k: { id: number }) => k.id === sentClaim.body.id), "answered claims are listed apart");
check((await adm("claims", {}, token)).status === 403, "a member can't read claims");
check((await call(`/rest/v1/agreements?select=terms`, { token: token2 })).body?.length === 0, "nor another member, what someone agreed to");
psql(`update public.profiles set role = 'mod' where id = '${other.id}'`);

// the shared wall: anyone looks, members draw, the server draws and checks it, mods rub out
const ink = (x = 400, y = 300) => ({ tool: "ink", c: "#2B37D4", w: 6, p: [x, y, 50, x + 40, y + 10, 60, x + 80, y + 30, 55] });
const draw = (strokes: unknown[], as: string | null | undefined = token, no?: number) => call("/api/wall/marks", { method: "POST", token: as ?? undefined, json: { strokes, no } });
const live = await call("/api/wall");
const wallNo: number = live.body?.no;
check(live.status === 200 && Number.isInteger(wallNo) && typeof live.body.title === "string" && Array.isArray(live.body.marks), "anyone sees the live wall", live.body?.error ?? live.status);
check(new Date(live.body.ends) > new Date() && new Date(live.body.ends).getUTCHours() === 20, "it ends at midnight in Tbilisi", live.body.ends);
check((await draw([ink()], null)).status === 401, "drawing on the wall needs a session");
check((await draw([{ ...ink(), c: "#00FF00" }])).status === 422, "only the wall's inks");
check((await draw([{ ...ink(), tool: "spray" }])).status === 422, "only the wall's tools");
check((await draw([{ ...ink(), p: [5000, 5000, 50] }])).status === 422, "only on the wall");
check((await draw(Array.from({ length: 21 }, () => ink()))).status === 400, "20 marks at a time at most");
const drew = await draw([ink(), ink(420, 330)], token, wallNo);
const myMarks: number[] = drew.body?.ids ?? [];
check(drew.status === 201 && myMarks.length === 2, "a member draws on the wall", drew);
const since = await call(`/api/wall?no=${wallNo}&rev=${live.body.rev}&after=${live.body.marks.at(-1)?.id ?? live.body.after}`);
check(since.body?.fresh === false && myMarks.every((id) => since.body.marks.some((m: { id: number }) => m.id === id)), "a page that has the wall gets only the new marks", since.body);
check(!JSON.stringify(since.body).includes(userId!), "the wall doesn't say who drew what");
let upto = 0;
for (let i = 0; i < 200 && upto < myMarks[1]; i++) {
  upto = Number(psql(`select snapshot_upto from public.walls where no = ${wallNo}`));
  if (upto < myMarks[1]) await sleep(250);
}
check(upto >= myMarks[1], "the server draws the new marks into the wall's picture", upto);
const pic = await fetch(`${BASE}/api/wall/img/${wallNo}.webp?v=smoke`);
check(pic.status === 200 && pic.headers.get("content-type") === "image/webp" && /immutable/.test(pic.headers.get("cache-control") ?? ""), "the picture is served, and cached by its version", pic.status);
check(psql(`select string_agg(status, ',' order by id) from public.wall_marks where id in (${myMarks})`) === "live,live", "the image check leaves plain marks up");
check((await call("/rest/v1/wall_marks?select=id", { token: token2 })).status >= 400, "the wall's tables aren't reachable through PostgREST");
// limits: the burst, and suspended members
psql(`insert into public.wall_marks (wall, member, stroke) select ${wallNo}, '${userId}', '{"tool":"ink","c":"#2B37D4","w":6,"p":[1,1,50]}' from generate_series(1, 149)`);
check((await draw([ink(), ink()])).status === 429, "150 marks in ten minutes is the most");
psql(`delete from public.wall_marks where member = '${userId}' and stroke->'p' = '[1,1,50]'`);
// reports and mods
check((await report({ wall: wallNo, reason: "nsfw", note: "top left" })).status === 201, "a member reports the wall");
check((await report({ wall: 99999, reason: "nsfw" })).status === 404, "only a wall there is");
check((await report({ wall: wallNo, piece: pid, reason: "spam" })).status === 400, "a report is about one thing");
check((await call(`/api/wall/mod/${wallNo}/marks?x=380&y=280&w=200&h=100`, { token })).status === 403, "only mods look up who drew what");
const there = await call(`/api/wall/mod/${wallNo}/marks?x=380&y=280&w=200&h=100`, { token: token2 });
check(myMarks.every((id) => there.body?.some((m: { id: number; handle: string }) => m.id === id && m.handle === handle)), "a mod sees the marks in a part of the wall, and who drew them", there.body);
const wallMod = (no: number, json: unknown, as = token2) => call(`/api/wall/mod/${no}`, { method: "POST", token: as, json });
const revBefore = Number(psql(`select rev from public.walls where no = ${wallNo}`));
const erased = await wallMod(wallNo, { action: "erase", ids: [myMarks[0]], note: "smoke" });
check(erased.status === 200 && erased.body.marks === 1, "a mod rubs a mark out", erased);
check(psql(`select status from public.wall_marks where id = ${myMarks[0]}`) === "removed" && Number(psql(`select rev from public.walls where no = ${wallNo}`)) > revBefore, "it's off the wall, and open pages draw it again", revBefore);
check((await call(`/api/wall?no=${wallNo}&rev=${revBefore}&after=0`)).body?.fresh === true, "a page with the old wall gets it all again");
check(psql(`select count(*) from public.mod_log where wall = ${wallNo} and action = 'erase' and profile = '${userId}'`) === "1", "the log says which wall and whose marks");
check(psql(`select string_agg(distinct status, ',') from public.reports where wall = ${wallNo} and reporter = '${other.id}'`) === "actioned", "rubbing out closes the wall's reports");
psql(`update public.wall_marks set status = 'held' where id = ${myMarks[1]}`);
const held = await call("/api/wall/mod/held", { token: token2 });
check(held.body?.some?.((m: { id: number; handle: string }) => m.id === myMarks[1] && m.handle === handle), "mods see the marks the image check held", held.body);
check((await wallMod(wallNo, { action: "restore", ids: [myMarks[1]] })).status === 200 && psql(`select status from public.wall_marks where id = ${myMarks[1]}`) === "live", "a mod lets a held mark back");
check((await wallMod(wallNo, { action: "hide" })).status === 409, "the live wall can't be hidden");
// Undo: a member takes back their own mark, nobody else's
const oops = await draw([ink(1500, 800)], token, wallNo);
const oopsId = oops.body?.ids?.[0];
check((await call(`/api/wall/marks/${oopsId}`, { method: "DELETE", token: token2 })).status === 404, "nobody takes back someone else's mark");
const revUndo = Number(psql(`select rev from public.walls where no = ${wallNo}`));
check((await call(`/api/wall/marks/${oopsId}`, { method: "DELETE", token })).status === 204 && psql(`select status from public.wall_marks where id = ${oopsId}`) === "removed", "a member takes back their own mark");
check(Number(psql(`select rev from public.walls where no = ${wallNo}`)) > revUndo, "and the wall is drawn again without it");
check((await call(`/api/wall/marks/${oopsId}`, { method: "DELETE", token })).status === 404, "a mark goes only once");
// the admin panel's wall tab: every wall, who drew on one, one member's marks, all of them out
const allW = await call("/api/wall/mod/walls", { token: token2 });
check(allW.body?.some?.((w: { no: number; status: string }) => w.no === wallNo && w.status === "live"), "mods list every wall", allW.body);
check((await call("/api/wall/mod/walls", { token })).status === 403, "members don't");
const ppl = await call(`/api/wall/mod/${wallNo}/people`, { token: token2 });
const meOnWall = ppl.body?.find?.((p: { handle: string }) => p.handle === handle);
check(meOnWall?.marks >= 1 && meOnWall.member === userId, "mods see who drew on a wall, and how much", ppl.body);
const theirs = await call(`/api/wall/mod/${wallNo}/people/${userId}`, { token: token2 });
check(Array.isArray(theirs.body) && theirs.body.length === meOnWall?.marks, "and one member's marks on their own", theirs.body?.length);
const extra = await draw([ink(1200, 700), ink(1250, 720)], token, wallNo);
const wipe = await wallMod(wallNo, { action: "erase", member: userId, note: "smoke" });
check(wipe.status === 200 && wipe.body.marks === (meOnWall?.marks ?? 0) + 2, "a mod rubs out everything one member drew on a wall", wipe.body);
check(psql(`select count(*) from public.wall_marks where wall = ${wallNo} and member = '${userId}' and status = 'live'`) === "0", "none of their marks are left on it", extra.status);
check(psql(`select status from public.wall_marks where id = ${myMarks[1]}`) === "removed", "the earlier ones included");
check((await draw([ink(450, 350)], token, wallNo)).status === 201, "they can still draw after that");
// the wall turns: the old one goes into the archive and the next subject goes up
psql(`update public.walls set ends = now() where no = ${wallNo}`);
let next: any = null;
for (let i = 0; i < 160 && !(next?.no > wallNo); i++) {
  next = (await call("/api/wall")).body;
  if (!(next?.no > wallNo)) await sleep(250);
}
check(next?.no === wallNo + 1 && next.theme !== live.body.theme && next.marks.length === 0, "when its time is up a new wall goes up, with the next subject", next);
check(psql(`select status || ':' || marks || ':' || artists from public.walls where no = ${wallNo}`).startsWith("closed:"), "the old one is closed, with its count");
check((await draw([ink()], token, wallNo)).body?.closed === true, "marks for the old wall are refused");
const past = await call("/api/wall/past");
const archived = past.body?.find?.((w: { no: number }) => w.no === wallNo);
check(!!archived && (await fetch(BASE + archived.small)).status === 200, "the archive lists it, with its picture", past.body);
const onePast = await call(`/api/wall/past/${wallNo}`);
check(onePast.body?.people?.some((p: { handle: string }) => p.handle === handle) && onePast.body.next === null, "a past wall says who drew on it", onePast.body);
check((await wallMod(wallNo, { action: "hide" })).status === 200 && (await call(`/api/wall/past/${wallNo}`)).status === 404, "a mod takes a wall out of the archive");
check((await fetch(`${BASE}/api/wall/img/${wallNo}.webp`)).status === 404, "and its picture goes");
check((await wallMod(wallNo, { action: "show" })).status === 200 && (await call(`/api/wall/past/${wallNo}`)).status === 200, "and puts it back");
// a suspended member's marks leave the walls
const onNew = await draw([ink(700, 500)], token, wallNo + 1);
check(onNew.status === 201, "members draw on the new wall", onNew);
check((await mod(`members/${userId}`, { action: "suspend", note: "smoke wall" })).status === 200, "a mod suspends the member again");
check(psql(`select count(*) from public.wall_marks where member = '${userId}' and status <> 'removed'`) === "0", "their marks are rubbed off every wall");
check((await draw([ink()], token)).status === 403, "a suspended member can't draw");
check((await mod(`members/${userId}`, { action: "unsuspend" })).status === 200, "the suspension is lifted again");
const kept = await draw([ink(900, 600)], token);
check(kept.status === 201, "and they draw again", kept);

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

// Tilo for schools: a teacher registers a school, an admin lets it in, a colleague joins;
// a class gets pupils and a task; a pupil signs in with pictures, draws, hands in; the image
// check passes it; the teacher reviews it and shows it, in the class and by a link
const sch = (path: string, init: { method?: string; json?: unknown; body?: BodyInit } = {}, as: string | null | undefined = token) => call(`/api/school${path}`, { ...init, token: as ?? undefined });
const asPupil = (path: string, ptoken: string | null | undefined, init: { method?: string; json?: unknown; body?: BodyInit } = {}) => sch(path, init, ptoken ?? null);
const recOf = (work: string, as?: string) => fetch(`${BASE}/api/school/works/${work}/rec`, { headers: as ? { authorization: `Bearer ${as}` } : {} });
check((await sch("/mine")).body?.schools?.length === 0, "a member teaches nowhere yet");
check((await sch("/mine", {}, null)).status === 401, "the teachers' side needs an account");
const reg = await sch("/schools", { method: "POST", json: { name: `Smoke School ${tag}`, city: "Tbilisi" } });
const sid: string = reg.body?.id;
check(reg.status === 201 && !!sid, "a teacher registers a school", reg);
const s1 = (await sch("/mine")).body?.schools?.[0];
check(s1?.status === "pending" && s1.me === "active" && /^TEACH-[A-Z2-9]{6}$/.test(s1.code), "it waits for Tilo's check, with a teacher code", s1);
check((await sch("/classes", { method: "POST", json: { school: sid, name: "3B Art", ages: "6-8" } })).status === 403, "no classes before Tilo has checked the school");
psql(`update public.profiles set role = 'admin' where id = '${other.id}'`);
check((await adm("schools", {}, token)).status === 403, "only admins see the schools waiting");
const waitingSchools = await adm("schools?status=pending");
check(waitingSchools.body?.schools?.some((x: { id: string; by: string; email: string }) => x.id === sid && x.by === handle && x.email === email), "an admin sees it waiting, with who registered it", waitingSchools.body);
check((await adm(`schools/${sid}`, { method: "POST", json: { action: "approve" } })).status === 200 && psql(`select status from public.schools where id = '${sid}'`) === "active", "an admin lets it in");
check(psql(`select count(*) from public.mod_log where school = '${sid}' and action = 'school'`) === "1", "which is logged");
psql(`update public.profiles set role = 'mod' where id = '${other.id}'`);

const madeClass = await sch("/classes", { method: "POST", json: { school: sid, name: "3B Art", ages: "6-8" } });
const cid: string = madeClass.body?.id;
check(madeClass.status === 201 && !!cid, "the teacher makes a class", madeClass);
const joined = await sch("/schools/join", { method: "POST", json: { code: s1.code.toLowerCase() } }, token2);
check(joined.status === 201, "a colleague asks to join with the teacher code", joined);
const colleague = (await sch("/mine", {}, token2)).body?.schools?.[0];
check(colleague?.me === "pending" && colleague.code === "" && colleague.teachers.length === 0, "until approved they see neither the code nor who teaches there", colleague);
check((await sch(`/classes/${cid}`, {}, token2)).status === 404, "nor the classes");
check((await sch(`/schools/${sid}/teachers/${other.id}`, { method: "POST", json: { ok: true } }, token2)).status === 400, "nobody approves themselves");
check((await sch(`/schools/${sid}/teachers/${other.id}`, { method: "POST", json: { ok: true } })).status === 204, "a teacher there approves them");
check((await sch(`/classes/${cid}`, {}, token2)).status === 200, "and then they open the school's classes");

check((await sch(`/classes/${cid}/pupils`, { method: "POST", json: { names: ["Nino B.", "Luka K.", "   "] } })).status === 201, "the teacher adds pupils, one name a line");
const classPage = (await sch(`/classes/${cid}`)).body;
const nino = classPage?.pupils?.find((p: { name: string }) => p.name === "Nino B.");
const luka = classPage?.pupils?.find((p: { name: string }) => p.name === "Luka K.");
check(classPage?.pupils?.length === 2 && nino?.pictures?.length === 3 && new Set(nino.pictures).size === 3, "each gets three different pictures for ages 6 to 8", classPage?.pupils);
const code: string = classPage?.cls?.code ?? "";
check(/^[A-Z]+-\d{4}$/.test(code), "the class has a code to sign in with", code);
const door = await sch(`/door/${code}`, {}, null);
check(door.status === 200 && door.body.pupils.length === 2 && door.body.pupils.every((p: object) => !("pictures" in p)), "the class's door lists the names, never the pictures", door.body);
check((await sch("/door/NOPE-0000", {}, null)).status === 404, "a wrong code opens no class");
const signIn = (pupil: { id: string }, pictures: number[], c = code) => sch("/signin", { method: "POST", json: { code: c, pupil: pupil.id, pictures } }, null);
check((await signIn(nino, [...nino.pictures].reverse())).status === 403, "the wrong pictures don't sign in");
const good = await signIn(nino, nino.pictures, code.toLowerCase());
const ninoTok: string | undefined = good.body?.token;
check(good.status === 200 && !!ninoTok && good.body.name === "Nino B.", "the right ones do", good);
check((await call("/api/me", { token: ninoTok })).status === 401, "a pupil's token isn't a member's");
check((await call("/rest/v1/profiles?limit=1", { token: ninoTok })).status === 401, "and PostgREST refuses it");
for (let i = 0; i < 5; i++) await signIn(luka, [...luka.pictures].reverse());
check((await signIn(luka, luka.pictures)).status === 429, "five wrong tries lock a pupil, even with the right pictures after");
check((await sch(`/pupils/${luka.id}`, { method: "PATCH", json: { newPictures: true } })).status === 204, "the teacher gives them new pictures");
const luka2 = (await sch(`/classes/${cid}`)).body?.pupils?.find((p: { id: string }) => p.id === luka.id);
const lukaIn = await signIn(luka, luka2?.pictures ?? []);
const lukaTok: string | undefined = lukaIn.body?.token;
check(lukaIn.status === 200 && !!lukaTok, "which lifts the lock", lukaIn);

const task = await sch(`/classes/${cid}/tasks`, { method: "POST", json: { title: "My house", brief: "Draw it.", shape: "land", palette: null, due: "2026-12-01" } });
check(task.status === 201, "the teacher sets a task", task);
check((await sch(`/classes/${cid}/tasks`, { method: "POST", json: { title: "Bad", shape: "land", palette: ["red"] } })).status === 400, "a task's colours are colours");
const home = await asPupil("/pupil", ninoTok);
check(home.status === 200 && home.body.tasks[0]?.title === "My house" && home.body.tasks[0].due === "2026-12-01" && home.body.cls.name === "3B Art", "the pupil sees it", home.body);
const started = await asPupil("/pupil/works", ninoTok, { method: "POST", json: { task: task.body?.id } });
const wid: string = started.body?.id;
check(started.status === 201 && !!wid, "the pupil starts on it", started);
check((await asPupil("/pupil/works", ninoTok, { method: "POST", json: { task: task.body?.id } })).body?.id === wid, "starting again opens the same drawing");
check((await asPupil(`/pupil/works/${wid}/hand-in`, ninoTok, { method: "POST" })).status === 422, "an empty sheet can't be handed in");
const saveWork = (as: string | undefined, rec: Uint8Array = encode(strokes)) => {
  const form = new FormData();
  form.set("meta", JSON.stringify({ title: "Our house", layers: LAYERS, paper: "smooth", minutes: 3.2 }));
  form.set("rec", new Blob([rec as Uint8Array<ArrayBuffer>]), "rec.tl");
  return asPupil(`/pupil/works/${wid}`, as, { method: "PUT", body: form });
};
check((await saveWork(lukaTok)).status === 422, "a classmate can't save over it");
check((await saveWork(ninoTok)).status === 204, "the drawing saves to the server as they draw");
check((await recOf(wid, lukaTok)).status === 404, "a classmate can't see it before it is shown");
check((await recOf(wid, token)).status === 200, "its teacher can");
check((await recOf(wid)).status === 401 && (await fetch(`${BASE}/files/school/${wid}.tl`)).status === 404, "nobody else, and Caddy never serves it");
check((await asPupil(`/pupil/works/${wid}/hand-in`, ninoTok, { method: "POST" })).status === 204, "the pupil hands it in");
check((await saveWork(ninoTok)).status === 409, "a handed-in drawing can't change");
let checked = "";
for (let i = 0; i < 240 && !["ok", "held"].includes(checked); i++) {
  checked = psql(`select checked from public.works where id = '${wid}'`);
  if (!["ok", "held"].includes(checked)) await sleep(250);
}
check(checked === "ok", "the image check passes it", checked);
check((await sch(`/works/${wid}/review`, { method: "POST", json: { status: "reviewed", stamps: ["Bold colours", "Not a stamp"], note: "Lovely!", shown: true } })).status === 204, "the teacher reviews it and shows it to the class");
check(psql(`select array_to_string(stamps, ',') || ':' || shown from public.works where id = '${wid}'`) === "Bold colours:true" || psql(`select array_to_string(stamps, ',') || ':' || shown from public.works where id = '${wid}'`) === "Bold colours:t", "only real stamps are kept");
const classmate = await asPupil("/pupil", lukaTok);
check(classmate.body?.gallery?.some((w: { id: string; by: string }) => w.id === wid && w.by === "Nino B."), "classmates see it in the class gallery", classmate.body?.gallery);
check((await recOf(wid, lukaTok)).status === 200, "and replay it");
const own = await asPupil("/pupil/works", lukaTok, { method: "POST", json: { task: null, shape: "px32" } });
check(own.status === 201 && psql(`select shape || ' ' || paper from public.works where id = '${own.body?.id}'`) === "px32 plain", "a pupil starts a pixel drawing of their own", own);
check((await sch(`/classes/${cid}/shows`, { method: "POST", json: { title: "Mixed", works: [wid, own.body?.id] } })).status === 400, "only reviewed drawings go in a show");
const show = await sch(`/classes/${cid}/shows`, { method: "POST", json: { title: "Our houses!", about: "For parents.", works: [wid], names: false } });
check(show.status === 201 && /^our-houses-[a-z0-9]{8}$/.test(show.body?.token ?? ""), "the teacher makes a show with a link", show);
const shown = await sch(`/shows/${show.body?.token}`, {}, null);
check(shown.status === 200 && shown.body.works.length === 1 && shown.body.works[0].by === null && shown.headers.get("x-robots-tag") === "noindex", "anyone with the link sees it, without names when the teacher says so", shown.body);
check((await fetch(`${BASE}/api/school/shows/${show.body?.token}/rec/${wid}`)).status === 200 && (await fetch(`${BASE}/api/school/shows/${show.body?.token}/rec/${own.body?.id}`)).status === 404, "and replays the drawings in it, and only those");

check((await sch(`/pupils/${nino.id}`, { method: "PATCH", json: { newPictures: true } })).status === 204 && (await asPupil("/pupil", ninoTok)).status === 401, "new pictures sign the pupil out");
check((await sch(`/pupils/${nino.id}`, { method: "DELETE" })).status === 204, "the teacher removes a pupil");
check(psql(`select count(*) from public.works where id = '${wid}'`) === "0" && psql(`select coalesce(array_length(works, 1), 0) from public.shows where class = '${cid}'`) === "0", "their drawings go with them, out of the show too");
check((await sch(`/classes/${cid}`, { method: "PATCH", json: { archived: true } })).status === 204 && (await sch(`/door/${code}`, {}, null)).status === 404, "an archived class can't be signed in to");
check((await asPupil("/pupil", lukaTok)).status === 401, "and its pupils are signed out");
psql(`update public.profiles set role = 'admin' where id = '${other.id}'`);
check((await adm(`schools/${sid}`, { method: "POST", json: { action: "close" } })).status === 200 && (await sch(`/classes/${cid}`)).status === 404, "an admin closes a school, and its classes close");
psql(`update public.profiles set role = 'mod' where id = '${other.id}'`);

// export, then delete the account for good
const exported = await call("/api/me/export", { token });
check(
  exported.status === 200 && exported.body.profile?.handle === handle && exported.body.pieces.length === 8 && exported.body.followers[0]?.handle === `smoke_${tag}_b`,
  "the member exports everything Tilo keeps about them",
  exported.status,
);
check(exported.body.agreed_to?.terms === terms.body && exported.body.claims_sent?.length === 1, "the export has what they agreed to and the claims they sent", exported.body.agreed_to);
check(exported.body.invites_made?.length === 2 && exported.body.feedback_sent?.[0]?.kind === "problem", "and the codes they handed out and the feedback they sent", exported.body.invites_made);
check(exported.body.teaching?.length === 1 && exported.body.teaching[0].lead === true, "and the schools they teach in", exported.body.teaching);
check(exported.body.wall_marks?.length === 1 && exported.body.wall_marks[0].stroke?.tool === "ink", "and their marks on the wall", exported.body.wall_marks?.length);
check(/attachment; filename="tilo-smoke_/.test(exported.headers.get("content-disposition") ?? ""), "the export downloads as a file");
check((await call("/api/me", { token, method: "DELETE", json: {} })).status === 400, "deleting needs an explicit confirm");
const gone = await call("/api/me", { token, method: "DELETE", json: { confirm: true } });
check(gone.status === 204, "the member deletes their account", gone);
check((await call("/rest/v1/rpc/profile_page", { method: "POST", json: { handle } })).body === null, "their profile is gone");
check(psql(`select count(*) from public.pieces where owner = '${userId}'`) === "0", "their pieces are gone");
check(psql(`select count(*) from public.follows where followee = '${userId}'`) === "0", "follows of them are gone");
check(psql(`select count(*) from public.wall_marks where member = '${userId}'`) === "0", "their marks on the wall are gone");
check((await fetch(`${BASE}/files/img/${pid}.webp`)).status === 404, "their published files are gone");
check(psql(`select remix_of is null from public.pieces where id = '${remixed.body?.id}'`) === "t", "a remix of theirs stays, without the link");
check(psql(`select count(*) from public.invites where used_by = '${userId}'`) === "0", "the invite no longer points at them");
check(psql(`select used_at is not null from public.invites where code = 'SMOKE-${tag.toUpperCase()}'`) === "t", "their invite stays used up");
psql(`delete from public.invites where code = 'SMOKE-${tag.toUpperCase()}'`);
psql(`delete from public.invites where code in ('${handedOut.join("','")}')`);
psql(`delete from public.schools where id = '${sid}'`);

// tidy up the second member, and what they did as a mod
psql(`delete from public.mod_log where mod = '${other.id}'`);
psql(`delete from public.claims where email = 'claim-${tag}@tilo.test'`);
const removed = await fetch(`${BASE}/auth/v1/admin/users/${other.id}`, {
  method: "DELETE",
  headers: { apikey: env.SERVICE_ROLE_KEY, authorization: `Bearer ${env.SERVICE_ROLE_KEY}` },
});
check(removed.ok, "the second test member is removed again", removed.status);

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
