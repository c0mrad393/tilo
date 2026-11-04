import type { Sql } from "postgres";
import { place, publicUrls, removeFiles, type Picture, type Purge } from "./files.ts";

/* A piece's status, with its files moved to match. Going live, the files move first, so a
   live row never points at a missing file; leaving, the row changes first, so the gallery
   stops listing it before its files go private and the edge cache is purged. */

export type Status = "live" | "held" | "hidden" | "removed";
export type Why = "check" | "new-member" | "flagged" | "reports" | "mod" | "suspended" | null;

export interface Change {
  status: Status;
  why?: Why;
  /** the mod who decided, when one did */
  by?: string;
}

export function statuses(sql: Sql, { filesDir, site, purge }: { filesDir: string; site: string; purge: Purge }) {
  return async function move(id: string, to: Change) {
    const [p] = await sql<{ status: Status; picture: Picture }[]>`select status, picture from public.pieces where id = ${id}`;
    if (!p) return false;
    const why = to.status === "live" ? null : (to.why ?? null);
    const review = to.by ? sql`, reviewed_by = ${to.by}, reviewed_at = now()` : sql``;
    if (to.status === "live" && p.status !== "live") await place(filesDir, id, true, p.picture);
    await sql`update public.pieces set status = ${to.status}, why = ${why} ${review} where id = ${id}`;
    if (to.status === "removed") await removeFiles(filesDir, id);
    else if (to.status !== "live" && p.status === "live") await place(filesDir, id, false, p.picture);
    if (p.status === "live" && to.status !== "live") await purge(publicUrls(site, id, p.picture));
    return true;
  };
}
export type Move = ReturnType<typeof statuses>;
