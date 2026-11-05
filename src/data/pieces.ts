import { decode, encode } from "../engine/codec";
import type { PaperId } from "../engine/paper";
import { layersOf, type LayerDef, type Piece, type ShapeId, type Stroke } from "../engine/stroke";
import { call, request } from "./account";
import { library } from "./library";
import { pieceById, unpinPiece } from "./local";
import { publishedSample } from "./prompt";

/* Published pieces, from Stage 2.3. The rows come from PostgREST; each live piece's recording
   and picture are files under /files, which never change once written. A list only fetches
   rows and pictures: a recording is fetched when its piece is opened or a card starts to
   replay. A piece that isn't live (being checked, waiting for a mod, hidden) is only seen by
   its artist and the mods, and its files come from /api/pieces/{id}, signed in. */

export interface Published extends Omit<Piece, "strokes"> {
  owner: string;
  /** the picture of the finished sheet */
  picture: string;
  created: string;
  status: "live" | "held" | "hidden" | "removed";
  /** how many strokes the recording holds, known before it is fetched */
  count: number;
  stampTotal: number;
  /** whether others may remix it; the artist can switch it */
  remixable: boolean;
  /** why a piece that isn't live is out of the gallery */
  why: Why | null;
  /** passed proof of hand v1: it gets the "Recorded on Tilo" badge */
  proof: boolean;
  /** the server has drawn its picture and checked it */
  checked: boolean;
}
export type Why = "check" | "new-member" | "flagged" | "reports" | "mod" | "suspended";
export type Full = Published & { strokes: Stroke[] };

interface Row {
  id: string;
  title: string;
  paper: PaperId;
  shape: ShapeId;
  layers: LayerDef[];
  strokes: number;
  minutes: number;
  subject: number | null;
  remix_of: string | null;
  remixable: boolean;
  status: Published["status"];
  why: Why | null;
  proof: boolean;
  checked: string | null;
  stamps: Record<string, number>;
  stamp_total: number;
  picture: "webp" | "jpg";
  ai: boolean;
  created: string;
  owner: { id: string; handle: string };
}

// pieces has two links to profiles (its owner, and profiles.avatar_piece), so the embed names one
export const SELECT = "id,title,paper,shape,layers,strokes,minutes,subject,remix_of,remixable,status,why,proof,checked,stamps,stamp_total,picture,ai,created,owner:profiles!pieces_owner_fkey(id,handle)";

export const fromRow = (r: Row): Published => ({
  id: r.id,
  title: r.title,
  by: r.owner.handle,
  owner: r.owner.id,
  minutes: r.minutes,
  layers: r.layers.length ? r.layers : undefined,
  paper: r.paper,
  shape: r.shape === "land" ? undefined : r.shape,
  prompt: r.subject ?? undefined,
  remixOf: r.remix_of ?? undefined,
  remixable: r.remixable,
  stamps: r.stamps,
  stampTotal: r.stamp_total,
  picture: r.status === "live" ? `/files/img/${r.id}.${r.picture}` : `/api/pieces/${r.id}/img`,
  created: r.created,
  status: r.status,
  why: r.why,
  // proof of hand is for hands: an AI piece never shows it
  proof: r.proof && !r.ai,
  ai: r.ai || undefined,
  checked: !!r.checked,
  count: r.strokes,
});

export type Sort = "new" | "stamped" | "prompt" | "remix" | "following";
export const PAGE = 24;

/** One page of the gallery, newest first unless sorted otherwise. */
export async function listPieces(q: { sort?: Sort; subject?: number; owner?: string; remixOf?: string; page?: number; size?: number; me?: string }) {
  const size = q.size ?? PAGE;
  const p = new URLSearchParams({ select: SELECT, limit: String(size + 1), offset: String((q.page ?? 0) * size) });
  if (q.sort === "following") {
    // the people `me` follows, then their pieces; fine at beta size (a few hundred at most)
    if (!q.me) return { items: [], more: false };
    const ids = (await call<{ followee: string }[]>(`/rest/v1/follows?follower=eq.${q.me}&select=followee&limit=500`)).map((f) => f.followee);
    if (!ids.length) return { items: [], more: false, none: true };
    p.set("owner", `in.(${ids.join(",")})`);
  }
  // someone looking at their own profile also sees pieces held for review
  if (!q.owner) p.set("status", "eq.live");
  if (q.owner) p.set("owner", `eq.${q.owner}`);
  if (q.remixOf) p.set("remix_of", `eq.${q.remixOf}`);
  if (q.sort === "prompt" && q.subject) p.set("subject", `eq.${q.subject}`);
  if (q.sort === "remix") p.set("remix_of", "not.is.null");
  if (q.sort === "stamped") {
    p.set("created", `gte.${new Date(Date.now() - 7 * 864e5).toISOString()}`);
    p.set("order", "stamp_total.desc,created.desc");
  } else p.set("order", "created.desc");
  const rows = await call<Row[]>(`/rest/v1/pieces?${p}`);
  return { items: rows.slice(0, size).map(fromRow), more: rows.length > size };
}

const recordings = new Map<string, Promise<Stroke[]>>();
/** A published piece's strokes, fetched once per page load; one that isn't live comes signed in. */
export function loadStrokes(id: string, live = true) {
  let r = recordings.get(id);
  if (!r) {
    r = (live ? fetch(`/files/rec/${id}.tl`) : request(`/api/pieces/${id}/rec`)).then(async (res) => {
      if (!res.ok) throw new Error(`The recording didn't arrive (${res.status}).`);
      return decode(new Uint8Array(await res.arrayBuffer()));
    });
    r.catch(() => recordings.delete(id));
    recordings.set(id, r);
  }
  return r;
}

const loaded = new Map<string, Full>();
/** A published piece with its recording, or null when there's no such piece (or it isn't public). */
export async function loadPiece(id: string): Promise<Full | null> {
  if (loaded.has(id)) return loaded.get(id)!;
  if (!/^[a-z0-9]{6,16}$/.test(id)) return null;
  const [row] = await call<Row[]>(`/rest/v1/pieces?id=eq.${id}&select=${SELECT}`);
  if (!row) return null;
  const full = { ...fromRow(row), strokes: await loadStrokes(id, row.status === "live") };
  loaded.set(id, full);
  return full;
}

/** The piece again from the server, after its status may have changed. */
export async function reloadPiece(id: string) {
  const had = loaded.get(id);
  loaded.delete(id);
  const [row] = await call<Row[]>(`/rest/v1/pieces?id=eq.${id}&select=${SELECT}`);
  if (!row) return null;
  // the recording never changes, only where it is kept
  const full = { ...fromRow(row), strokes: had?.strokes ?? (await loadStrokes(id, row.status === "live")) };
  loaded.set(id, full);
  return full;
}

/** A piece by id from this device (samples, pins) or from a published piece already loaded. */
export const findPiece = (id: string): Piece | Full | undefined => pieceById(id) ?? loaded.get(id);
/** The same, fetching a published piece when it isn't here yet. */
export const getPiece = async (id: string) => findPiece(id) ?? (await loadPiece(id).catch(() => null)) ?? undefined;
export const isPublished = (p: Piece | Published | undefined): p is Full => !!p && "owner" in p;

export interface Draft {
  title: string;
  strokes: Stroke[];
  layers: LayerDef[];
  paper: PaperId;
  shape: ShapeId;
  minutes: number;
  subject?: number;
  remixOf?: string;
  /** missing means yes */
  remixable?: boolean;
}

/** Sends a piece to the gallery. The server reads the recording before it keeps anything,
    then draws the picture and checks it; the piece is held until that is done. */
export async function publish(d: Draft) {
  const form = new FormData();
  form.set(
    "meta",
    JSON.stringify({ title: d.title, paper: d.paper, shape: d.shape, layers: d.layers, minutes: d.minutes, subject: d.subject ?? null, remix_of: d.remixOf ?? null, remixable: d.remixable ?? true }),
  );
  form.set("rec", new Blob([encode(d.strokes) as Uint8Array<ArrayBuffer>], { type: "application/octet-stream" }), "piece.tl");
  const res = await request("/api/pieces", { method: "POST", body: form });
  const row = (await res.json()) as Omit<Row, "owner"> & { owner: string };
  return row.id;
}

/** Publishes a piece pinned on this device before there was an account, then lets the pin
    go: its sheet in the library now points at the published piece. */
export async function publishPin(p: Piece) {
  const layers = layersOf(p);
  // a pin's remix credit points at a sample (published as @tilo), a published piece, or
  // another pin of this device, which has no page anyone else can open
  const src = p.remixOf && !p.remixOf.startsWith("mine-") ? (pieceById(p.remixOf)?.sample ? publishedSample(p.remixOf) : p.remixOf) : undefined;
  const id = await publish({
    title: p.title, strokes: p.strokes, layers, paper: p.paper ?? "smooth", shape: p.shape ?? "land", minutes: p.minutes, subject: src ? undefined : p.prompt, remixOf: src,
  });
  unpinPiece(p.id);
  try {
    for (const meta of await library.list()) {
      if (meta.pinned !== p.id) continue;
      const sheet = await library.get(meta.id);
      if (sheet) await library.put({ ...sheet, pinned: id });
    }
  } catch {
    // no library on this device: nothing points at the pin
  }
  return id;
}

/** Lets others remix your piece, or stops them (remixes already made stay). */
export async function setRemixable(id: string, on: boolean) {
  await call(`/rest/v1/pieces?id=eq.${id}`, { method: "PATCH", json: { remixable: on } });
  const had = loaded.get(id);
  if (had) loaded.set(id, { ...had, remixable: on });
}

/** Takes your own piece down for good. */
export async function takeDown(id: string) {
  await request(`/api/pieces/${id}`, { method: "DELETE" });
  loaded.delete(id);
  recordings.delete(id);
}

// ---- stamps on published pieces ----

export const myStamps = async (piece: string, member: string) =>
  new Set((await call<{ kind: string }[]>(`/rest/v1/stamps?piece=eq.${piece}&member=eq.${member}&select=kind`)).map((s) => s.kind));

export async function setStamp(piece: string, kind: string, on: boolean, member: string) {
  if (on) await call("/rest/v1/stamps", { method: "POST", json: { piece, kind } });
  else await call(`/rest/v1/stamps?piece=eq.${piece}&kind=eq.${encodeURIComponent(kind)}&member=eq.${member}`, { method: "DELETE" });
  loaded.delete(piece);
}

// ---- reports and moderation ----

export type Reason = "nsfw" | "not-hand-made" | "copied" | "abuse" | "spam" | "other";

/** Reports a piece or a member to the mods. */
export const report = (target: { piece: string } | { profile: string }, reason: Reason, note: string) =>
  request("/api/reports", { method: "POST", json: { ...target, reason, note } });

export type ModAction = "approve" | "hide" | "remove" | "dismiss" | "suspend" | "unsuspend";
/** A mod's decision on a piece, a report or a member. */
export async function moderate(kind: "pieces" | "reports" | "members", id: string | number, action: ModAction, note = "") {
  await request(`/api/mod/${kind}/${id}`, { method: "POST", json: { action, note } });
  if (kind === "pieces") loaded.delete(String(id));
}
