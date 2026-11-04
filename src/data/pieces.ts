import { decode, encode } from "../engine/codec";
import type { PaperId } from "../engine/paper";
import type { LayerDef, Piece, ShapeId, Stroke } from "../engine/stroke";
import { call, request } from "./account";
import { pieceById } from "./local";

/* Published pieces, from Stage 2.3. The rows come from PostgREST; each piece's recording and
   picture are files under /files, which never change once written. A list only fetches rows
   and pictures: a recording is fetched when its piece is opened or a card starts to replay. */

export interface Published extends Omit<Piece, "strokes"> {
  owner: string;
  /** the picture of the finished sheet */
  picture: string;
  created: string;
  status: "live" | "held" | "hidden" | "removed";
  /** how many strokes the recording holds, known before it is fetched */
  count: number;
  stampTotal: number;
}
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
  status: Published["status"];
  stamps: Record<string, number>;
  stamp_total: number;
  picture: "webp" | "jpg";
  created: string;
  owner: { id: string; handle: string };
}

// pieces has two links to profiles (its owner, and profiles.avatar_piece), so the embed names one
const SELECT = "id,title,paper,shape,layers,strokes,minutes,subject,remix_of,status,stamps,stamp_total,picture,created,owner:profiles!pieces_owner_fkey(id,handle)";

const fromRow = (r: Row): Published => ({
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
  stamps: r.stamps,
  stampTotal: r.stamp_total,
  picture: `/files/img/${r.id}.${r.picture}`,
  created: r.created,
  status: r.status,
  count: r.strokes,
});

export type Sort = "new" | "stamped" | "prompt" | "remix";
export const PAGE = 24;

/** One page of the gallery, newest first unless sorted otherwise. */
export async function listPieces(q: { sort?: Sort; subject?: number; owner?: string; remixOf?: string; page?: number; size?: number }) {
  const size = q.size ?? PAGE;
  const p = new URLSearchParams({ select: SELECT, limit: String(size + 1), offset: String((q.page ?? 0) * size) });
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
/** A published piece's strokes, fetched once per page load. */
export function loadStrokes(id: string) {
  let r = recordings.get(id);
  if (!r) {
    r = fetch(`/files/rec/${id}.tl`).then(async (res) => {
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
  const full = { ...fromRow(row), strokes: await loadStrokes(id) };
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
}

/** Sends a piece to the gallery. The server reads the recording before it keeps anything. */
export async function publish(d: Draft, picture: Blob) {
  const form = new FormData();
  form.set(
    "meta",
    JSON.stringify({ title: d.title, paper: d.paper, shape: d.shape, layers: d.layers, minutes: d.minutes, subject: d.subject ?? null, remix_of: d.remixOf ?? null }),
  );
  form.set("rec", new Blob([encode(d.strokes) as Uint8Array<ArrayBuffer>], { type: "application/octet-stream" }), "piece.tl");
  form.set("img", picture, picture.type === "image/webp" ? "piece.webp" : "piece.jpg");
  const res = await request("/api/pieces", { method: "POST", body: form });
  const row = (await res.json()) as Omit<Row, "owner"> & { owner: string };
  return row.id;
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
