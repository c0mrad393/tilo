import { writeFile, rename } from "node:fs/promises";
import { Worker } from "node:worker_threads";
import type { Sql } from "postgres";
import { imgPath, recPath } from "./files.ts";
import type { Job, Result, Scores } from "./screen/worker.ts";
import type { Move } from "./status.ts";

/* After a piece is published: the worker renders it and checks the frames, then the piece
   goes live, or waits for a mod when the check flagged it or its artist is new. Pieces are
   checked one at a time, in the order they came; any left unchecked when the API stopped
   are picked up when it starts again. */

/** Tilo is for everyone, so the bar is low: a false alarm costs a mod a minute, a miss costs more. */
export const flagged = (s: Pick<Scores, "explicit" | "sexy">) => s.explicit >= 0.25 || s.sexy >= 0.4;

const TIMEOUT_MS = 3 * 60_000;

interface Options {
  filesDir: string;
  move: Move;
  /** a member's pieces go live without a mod once this many have been let in by one */
  trustAfter: number;
}

export function screener(sql: Sql, { filesDir, move, trustAfter }: Options) {
  let worker: Worker | null = null;
  const waiting: string[] = [];
  let busy = false;

  const run = (job: Job) =>
    new Promise<Result>((resolve) => {
      worker ??= new Worker(new URL("../dist/screen.mjs", import.meta.url));
      const w = worker;
      const done = (r: Result) => {
        clearTimeout(timer);
        w.off("message", done);
        w.off("error", fail);
        resolve(r);
      };
      const fail = (e: Error) => {
        // a worker that broke or hung is replaced for the next piece
        void w.terminate();
        if (worker === w) worker = null;
        done({ id: job.id, error: e.message });
      };
      const timer = setTimeout(() => fail(new Error("the check took too long")), TIMEOUT_MS);
      w.on("message", done);
      w.on("error", fail);
      w.postMessage(job);
    });

  async function check(id: string) {
    const [p] = await sql`
      select p.id, p.paper, p.shape, p.layers, p.status, p.why, p.owner, p.picture, pr.role, pr.suspended,
        (select count(*)::int from public.pieces q where q.owner = p.owner and q.reviewed_by is not null and q.status = 'live') as trusted
      from public.pieces p join public.profiles pr on pr.id = p.owner
      where p.id = ${id} and p.checked is null`;
    if (!p) return;
    const live = p.status === "live";
    const r = await run({ id, rec: recPath(filesDir, id, live), paper: p.paper, shape: p.shape, layers: p.layers });
    if ("error" in r) {
      console.error(`check of ${id} failed: ${r.error}`);
      await sql`update public.pieces set checked = now(), screen = ${sql.json({ error: r.error })} where id = ${id}`;
      return move(id, { status: "held", why: "flagged" });
    }
    // the server's own render replaces whatever picture there was
    const img = imgPath(filesDir, id, live, "webp");
    await writeFile(`${img}.part`, r.picture);
    await rename(`${img}.part`, img);
    await sql`update public.pieces set checked = now(), screen = ${sql.json(r.scores as never)}, picture = 'webp' where id = ${id}`;
    if (flagged(r.scores)) return move(id, { status: "held", why: "flagged" });
    // a piece that a mod or a report already took out of the gallery stays out
    if (!live && p.why !== "check") return;
    if (p.suspended) return move(id, { status: "hidden", why: "suspended" });
    const trusted = p.role !== "member" || p.trusted >= trustAfter;
    return move(id, trusted ? { status: "live" } : { status: "held", why: "new-member" });
  }

  async function next() {
    if (busy) return;
    busy = true;
    try {
      for (let id; (id = waiting.shift()); ) {
        try {
          await check(id);
        } catch (e) {
          console.error(`check of ${id} failed:`, e);
        }
      }
    } finally {
      busy = false;
    }
  }

  return {
    /** checks a piece soon; it stays held until then */
    add(id: string) {
      if (!waiting.includes(id)) waiting.push(id);
      void next();
    },
    /** picks up every piece still waiting for its check */
    async resume() {
      for (const { id } of await sql`select id from public.pieces where checked is null order by created`) this.add(id);
    },
    stop: () => worker?.terminate(),
  };
}
export type Screener = ReturnType<typeof screener>;
