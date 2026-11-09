import { randomBytes } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Sql } from "postgres";
import type { AuthEnv } from "./auth.ts";
import { imgPath, makeDirs, publicUrls, recPath, removeFiles, type Purge } from "./files.ts";
import { proofOf } from "./proof.ts";
import { decode, FORMAT, MAX_BYTES } from "./recording.ts";
import type { Screener } from "./screen.ts";

/* /api/pieces: publishing. The studio sends the recording and what it knows about the
   piece; the server reads the recording before anything is kept. The piece starts out held,
   with its recording in private/, until the screener has drawn its picture and checked it.
   Its file goes to disk first and the row last, so a row never points at a missing file. */

interface Options {
  member: MiddlewareHandler<AuthEnv>;
  filesDir: string;
  /** pieces one member may publish in 24 hours */
  perDay: number;
  screener: Screener;
  site: string;
  purge: Purge;
}

// kept in step with the studio's lists (src/engine/paper.ts and stroke.ts)
export const PAPERS = new Set(["smooth", "cold", "newsprint", "kraft", "grey", "black", "plain", "plaindark"]);
export const SHAPES = new Set(["land", "port", "square", "px16", "px32", "px64", "px128", "pxland"]);
const BLENDS = new Set(["source-over", "multiply", "screen", "overlay", "darken", "lighten", "soft-light", "color-burn"]);
const OPS = new Set(["move", "dup", "merge"]);
/** a subject piece is drawn against a 10:00 clock; the recording may run a little past it */
const SUBJECT_SECONDS = 11 * 60;

export class Refused extends Error {
  status: 400 | 413 | 422 | 429;
  constructor(message: string, status: Refused["status"] = 422) {
    super(message);
    this.status = status;
  }
}

export interface Layer {
  id: number;
  name: string;
  blend: string;
  opacity: number;
  hidden?: boolean;
  gone?: boolean;
}

/** The layer stack as the studio sent it, reduced to the fields the app reads. */
export function layersFrom(v: unknown): Layer[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 64) throw new Refused("The layers don't make sense.", 400);
  return v.map((l) => {
    if (!l || typeof l !== "object" || !Number.isInteger(l.id) || l.id < 0 || l.id > 1e6) throw new Refused("The layers don't make sense.", 400);
    const out: Layer = {
      id: l.id,
      name: String(l.name ?? "").slice(0, 40),
      blend: BLENDS.has(l.blend) ? l.blend : "source-over",
      opacity: typeof l.opacity === "number" ? Math.min(1, Math.max(0, l.opacity)) : 1,
    };
    if (l.hidden === true) out.hidden = true;
    if (l.gone === true) out.gone = true;
    return out;
  });
}

export interface Draft {
  title: string;
  paper: string;
  shape: string;
  layers: Layer[];
  minutes: number;
  subject: number | null;
  remix_of: string | null;
  remixable: boolean;
  format: number;
  bytes: number;
  strokes: number;
}

/** Reads what the studio sent and says what would be stored, or why it can't be. */
export function check(meta: Record<string, unknown>, rec: Uint8Array): Draft & { decoded: ReturnType<typeof decode> } {
  if (rec.length > MAX_BYTES) throw new Refused("A recording can be 2 MB at most.", 413);
  let strokes;
  try {
    strokes = decode(rec);
  } catch (e) {
    throw new Refused(`That isn't a Tilo recording: ${e instanceof Error ? e.message.toLowerCase() : "it doesn't read"}.`);
  }
  const format = rec[2];
  if (format > FORMAT) throw new Refused("The recording is newer than this server. Reload Tilo and try again.");
  const drawn = strokes.filter((s) => !OPS.has(s.tool));
  if (!drawn.length) throw new Refused("There's nothing drawn on the sheet.");

  const title = String(meta.title ?? "").trim().replace(/\s+/g, " ").slice(0, 80) || "Untitled";
  const paper = String(meta.paper ?? "smooth");
  const shape = String(meta.shape ?? "land");
  if (!PAPERS.has(paper) || !SHAPES.has(shape)) throw new Refused("Unknown paper or sheet shape.", 400);

  // every stroke has to land on a layer the piece has, or its replay would lose it
  const layers = layersFrom(meta.layers);
  const ids = new Set(layers.length ? layers.map((l) => l.id) : [0]);
  if (strokes.some((s) => !ids.has(s.l ?? 0) || (s.src !== undefined && !ids.has(s.src))))
    throw new Refused("A stroke sits on a layer the piece doesn't have.");

  const minutes = Number(meta.minutes);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 100 * 60) throw new Refused("The drawing time doesn't make sense.", 400);

  const remix_of = meta.remix_of == null ? null : String(meta.remix_of);
  let subject: number | null = null;
  if (meta.subject != null) {
    subject = Number(meta.subject);
    if (!Number.isInteger(subject) || subject < 1 || subject > 1e6) throw new Refused("Unknown subject.", 400);
    // the clock is part of a subject: a remix can't be entered, and the strokes must fit the time
    const times = strokes.map((s) => s.t).filter((t): t is number => t !== undefined);
    const span = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 1000 : 0;
    if (remix_of || span > SUBJECT_SECONDS || minutes > SUBJECT_SECONDS / 60)
      throw new Refused("This piece went past the 10:00 clock, so it can't be entered for the subject.");
  }

  const remixable = meta.remixable !== false;

  return { title, paper, shape, layers, minutes: Math.round(minutes * 100) / 100, subject, remix_of, remixable, format, bytes: rec.length, strokes: strokes.length, decoded: strokes };
}

/** a piece's id: ten letters and digits, too many to guess (52 bits) */
export const newId = () => {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  return [...randomBytes(10)].map((b) => abc[b % 36]).join("");
};

export function pieces(sql: Sql, { member, filesDir, perDay, screener, site, purge }: Options) {
  const app = new Hono<AuthEnv>();

  // multipart form: "meta" (JSON) and "rec" (the recording); the server draws the picture
  app.post(
    "/",
    member,
    bodyLimit({ maxSize: MAX_BYTES + 64 * 1024, onError: (c) => c.json({ error: "That's more than a piece can be." }, 413) }),
    async (c) => {
      const { id: owner } = c.get("member");
      try {
        const [profile] = await sql`select handle, suspended from public.profiles where id = ${owner}`;
        if (!profile) throw new Refused("Pick a handle before you publish.", 400);
        if (profile.suspended) throw new Refused("This account is suspended.", 400);
        const [{ n }] = await sql`select count(*)::int as n from public.pieces where owner = ${owner} and created > now() - interval '1 day'`;
        if (n >= perDay) throw new Refused(`You've published ${perDay} pieces today, which is the most for a day. Try again tomorrow.`, 429);

        const form = await c.req.formData().catch(() => null);
        const rec = form?.get("rec"), meta = form?.get("meta");
        if (!(rec instanceof File) || typeof meta !== "string") throw new Refused("Send meta and rec as a form.", 400);
        let fields: Record<string, unknown>;
        try {
          fields = JSON.parse(meta);
        } catch {
          throw new Refused("meta isn't JSON.", 400);
        }
        const recBytes = new Uint8Array(await rec.arrayBuffer());
        const d = check(fields, recBytes);
        let base = 0;
        if (d.remix_of) {
          const [src] = await sql`select owner, remixable, strokes from public.pieces where id = ${d.remix_of} and status = 'live'`;
          if (!src) throw new Refused("The piece this remixes isn't in the gallery any more.");
          // an artist may always remix their own piece
          if (!src.remixable && src.owner !== owner) throw new Refused("The artist has turned remixing off for that piece.");
          base = src.strokes;
        }
        const proof = proofOf(d.decoded, { base });
        if (proof.refuse) throw new Refused(proof.refuse);

        const id = newId();
        const path = recPath(filesDir, id, false);
        await makeDirs(filesDir);
        await writeFile(`${path}.part`, recBytes);
        await rename(`${path}.part`, path);
        try {
          const [row] = await sql`
            insert into public.pieces (id, owner, title, paper, shape, layers, strokes, minutes, format, bytes, subject, remix_of, remixable,
                                       status, why, proof, screen)
            values (${id}, ${owner}, ${d.title}, ${d.paper}, ${d.shape}, ${sql.json(d.layers as never)}, ${d.strokes}, ${d.minutes},
                    ${d.format}, ${d.bytes}, ${d.subject}, ${d.remix_of}, ${d.remixable},
                    'held', 'check', ${proof.badge}, ${sql.json({ proof: proof.notes })})
            returning *`;
          screener.add(id);
          return c.json(row, 201);
        } catch (e) {
          await rm(path, { force: true });
          throw e;
        }
      } catch (e) {
        if (e instanceof Refused) return c.json({ error: e.message }, e.status);
        throw e;
      }
    },
  );

  // takes your own piece down for good: the row, its stamps, and its files
  app.delete("/:id", member, async (c) => {
    const { id: owner } = c.get("member");
    const id = c.req.param("id");
    const gone = await sql`delete from public.pieces where id = ${id} and owner = ${owner} returning status, picture`;
    if (!gone.length) return c.json({ error: "No piece of yours has that id." }, 404);
    await removeFiles(filesDir, id);
    if (gone[0].status === "live") await purge(publicUrls(site, id, gone[0].picture));
    return c.body(null, 204);
  });

  // a piece that isn't live, for its artist and the mods; live ones are under /files
  for (const kind of ["rec", "img"] as const) {
    app.get(`/:id/${kind}`, member, async (c) => {
      const { id: me } = c.get("member");
      const id = c.req.param("id");
      const [p] = await sql`
        select p.status, p.picture from public.pieces p
        where p.id = ${id} and (p.owner = ${me} or exists (select 1 from public.profiles where id = ${me} and role in ('mod', 'admin')))`;
      if (!p || p.status === "removed") return c.json({ error: "No such piece, or it isn't yours to see." }, 404);
      const live = p.status === "live";
      const bytes = await readFile(kind === "rec" ? recPath(filesDir, id, live) : imgPath(filesDir, id, live, p.picture)).catch(() => null);
      if (!bytes) return c.json({ error: kind === "img" ? "The picture isn't drawn yet." : "The recording is missing." }, 404);
      c.header("cache-control", "private, no-store");
      c.header("content-type", kind === "rec" ? "application/octet-stream" : `image/${p.picture === "jpg" ? "jpeg" : "webp"}`);
      return c.body(bytes);
    });
  }

  return app;
}
