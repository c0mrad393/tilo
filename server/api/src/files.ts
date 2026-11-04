import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

/* Where a piece's recording and picture are on disk. A live piece's files are under rec/
   and img/, which Caddy serves at /files with a year's cache. Every other piece's files are
   under private/, which Caddy never serves: its owner and the mods fetch them through
   /api/pieces/{id}/rec and /img. A piece's files move when its status does. */

export type Picture = "webp" | "jpg";

export const recPath = (dir: string, id: string, live: boolean) => join(dir, ...(live ? [] : ["private"]), "rec", `${id}.tl`);
export const imgPath = (dir: string, id: string, live: boolean, ext: Picture = "webp") =>
  join(dir, ...(live ? [] : ["private"]), "img", `${id}.${ext}`);

export async function makeDirs(dir: string) {
  for (const d of ["rec", "img", "private/rec", "private/img"]) await mkdir(join(dir, d), { recursive: true });
}

const moveIfThere = (from: string, to: string) =>
  rename(from, to).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "ENOENT") throw e;
  });

/** Puts a piece's files where its status says: public when live, private otherwise. */
export const place = (dir: string, id: string, live: boolean, ext: Picture = "webp") =>
  Promise.all([moveIfThere(recPath(dir, id, !live), recPath(dir, id, live)), moveIfThere(imgPath(dir, id, !live, ext), imgPath(dir, id, live, ext))]);

/** Every file a piece may have, wherever it is. */
export const removeFiles = (dir: string, id: string) =>
  Promise.all(
    [true, false].flatMap((live) => [recPath(dir, id, live), imgPath(dir, id, live, "webp"), imgPath(dir, id, live, "jpg")]).map((f) => rm(f, { force: true })),
  );

/** The public addresses of a piece's files, for purging the edge cache. */
export const publicUrls = (site: string, id: string, ext: Picture = "webp") => [`${site}/files/rec/${id}.tl`, `${site}/files/img/${id}.${ext}`];

/* Behind Cloudflare, a file Caddy stopped serving is still served from the edge for up to a
   year, so a piece that leaves the gallery has its addresses purged. Without CF_ZONE_ID and
   CF_API_TOKEN (on this computer, say) there is no edge and nothing to purge. */
export function purger(zone?: string, token?: string) {
  return async (urls: string[]) => {
    if (!zone || !token) return;
    // Cloudflare takes 30 addresses a request
    for (let i = 0; i < urls.length; i += 30) {
      try {
        const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ files: urls.slice(i, i + 30) }),
        });
        if (!res.ok) console.error(`cloudflare purge failed: ${res.status} ${await res.text()}`);
      } catch (e) {
        console.error("cloudflare purge failed:", e);
      }
    }
  };
}
export type Purge = ReturnType<typeof purger>;
