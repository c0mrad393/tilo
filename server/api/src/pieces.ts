import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Sql } from "postgres";
import type { AuthEnv } from "./auth.ts";
import { decode, FORMAT, MAX_BYTES } from "./recording.ts";

/* /api/pieces: publishing. The studio sends the recording, a picture of the finished sheet
   and what it knows about the piece; the server reads the recording before anything is kept.
   Files go to disk first and the row last, so a row never points at a missing file.
   The proof-of-hand checks (2.5) grow out of check() below. */

interface Options {
  member: MiddlewareHandler<AuthEnv>;
  filesDir: string;
  /** pieces one member may publish in 24 hours */
  perDay: number;
}

// kept in step with the studio's lists (src/engine/paper.ts and stroke.ts)
const PAPERS = new Set(["smooth", "cold", "newsprint", "kraft", "grey", "black"]);
const SHAPES = new Set(["land", "port", "square"]);
const BLENDS = new Set(["source-over", "multiply", "screen", "overlay", "darken", "lighten", "soft-light", "color-burn"]);
const OPS = new Set(["move", "dup", "merge"]);
const MAX_PICTURE = 1024 * 1024;
/** a subject piece is drawn against a 10:00 clock; the recording may run a little past it */
const SUBJECT_SECONDS = 11 * 60;

export class Refused extends Error {
  status: 400 | 413 | 422 | 429;
  constructor(message: string, status: Refused["status"] = 422) {
    super(message);
    this.status = status;
  }
}

interface Layer {
  id: number;
  name: string;
  blend: string;
  opacity: number;
  hidden?: boolean;
  gone?: boolean;
}

/** The layer stack as the studio sent it, reduced to the fields the app reads. */
function layersFrom(v: unknown): Layer[] {
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

const PICTURES = {
  webp: (b: Uint8Array) => b.length > 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP",
  jpg: (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};

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
  picture: keyof typeof PICTURES;
}

/** Reads what the studio sent and says what would be stored, or why it can't be. */
export function check(meta: Record<string, unknown>, rec: Uint8Array, img: Uint8Array): Draft {
  if (rec.length > MAX_BYTES) throw new Refused("A recording can be 2 MB at most.", 413);
  if (img.length > MAX_PICTURE) throw new Refused("The picture can be 1 MB at most.", 413);
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

  const picture = (Object.keys(PICTURES) as (keyof typeof PICTURES)[]).find((k) => PICTURES[k](img));
  if (!picture) throw new Refused("The picture has to be WebP or JPEG.");

  return { title, paper, shape, layers, minutes: Math.round(minutes * 100) / 100, subject, remix_of, remixable, format, bytes: rec.length, strokes: strokes.length, picture };
}

/** a piece's id: ten letters and digits, too many to guess (52 bits) */
const newId = () => {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  return [...randomBytes(10)].map((b) => abc[b % 36]).join("");
};

export const pieceFiles = (filesDir: string, id: string) => [
  join(filesDir, "rec", `${id}.tl`),
  join(filesDir, "img", `${id}.webp`),
  join(filesDir, "img", `${id}.jpg`),
];

export function pieces(sql: Sql, { member, filesDir, perDay }: Options) {
  const app = new Hono<AuthEnv>();

  // multipart form: "meta" (JSON), "rec" (the recording), "img" (the picture)
  app.post(
    "/",
    member,
    bodyLimit({ maxSize: MAX_BYTES + MAX_PICTURE + 64 * 1024, onError: (c) => c.json({ error: "That's more than a piece can be." }, 413) }),
    async (c) => {
      const { id: owner } = c.get("member");
      try {
        const [profile] = await sql`select handle from public.profiles where id = ${owner}`;
        if (!profile) throw new Refused("Pick a handle before you publish.", 400);
        const [{ n }] = await sql`select count(*)::int as n from public.pieces where owner = ${owner} and created > now() - interval '1 day'`;
        if (n >= perDay) throw new Refused(`You've published ${perDay} pieces today, which is the most for a day. Try again tomorrow.`, 429);

        const form = await c.req.formData().catch(() => null);
        const rec = form?.get("rec"), img = form?.get("img"), meta = form?.get("meta");
        if (!(rec instanceof File) || !(img instanceof File) || typeof meta !== "string") throw new Refused("Send meta, rec and img as a form.", 400);
        let fields: Record<string, unknown>;
        try {
          fields = JSON.parse(meta);
        } catch {
          throw new Refused("meta isn't JSON.", 400);
        }
        const recBytes = new Uint8Array(await rec.arrayBuffer());
        const imgBytes = new Uint8Array(await img.arrayBuffer());
        const d = check(fields, recBytes, imgBytes);
        if (d.remix_of) {
          const [src] = await sql`select owner, remixable from public.pieces where id = ${d.remix_of} and status = 'live'`;
          if (!src) throw new Refused("The piece this remixes isn't in the gallery any more.");
          // an artist may always remix their own piece
          if (!src.remixable && src.owner !== owner) throw new Refused("The artist has turned remixing off for that piece.");
        }

        const id = newId();
        const recPath = join(filesDir, "rec", `${id}.tl`);
        const imgPath = join(filesDir, "img", `${id}.${d.picture}`);
        await mkdir(join(filesDir, "rec"), { recursive: true });
        await mkdir(join(filesDir, "img"), { recursive: true });
        // written beside and renamed into place, so Caddy never serves half a file
        await writeFile(`${recPath}.part`, recBytes);
        await writeFile(`${imgPath}.part`, imgBytes);
        await rename(`${recPath}.part`, recPath);
        await rename(`${imgPath}.part`, imgPath);
        try {
          const [row] = await sql`
            insert into public.pieces (id, owner, title, paper, shape, layers, strokes, minutes, format, bytes, subject, remix_of, remixable, picture)
            values (${id}, ${owner}, ${d.title}, ${d.paper}, ${d.shape}, ${sql.json(d.layers as never)}, ${d.strokes}, ${d.minutes},
                    ${d.format}, ${d.bytes}, ${d.subject}, ${d.remix_of}, ${d.remixable}, ${d.picture})
            returning *`;
          return c.json(row, 201);
        } catch (e) {
          await Promise.all([rm(recPath, { force: true }), rm(imgPath, { force: true })]);
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
    const gone = await sql`delete from public.pieces where id = ${id} and owner = ${owner} returning id`;
    if (!gone.length) return c.json({ error: "No piece of yours has that id." }, 404);
    await Promise.all(pieceFiles(filesDir, id).map((f) => rm(f, { force: true })));
    return c.body(null, 204);
  });

  return app;
}
