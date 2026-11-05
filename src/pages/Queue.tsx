import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AdminTabs } from "../components/AdminTabs";
import { ModButtons, screenLine, usePicture, WHY_FOR_MODS } from "../components/Moderation";
import { ACCOUNTS, call, useAccount } from "../data/account";
import { fromRow, moderate, type Published, type Reason, SELECT } from "../data/pieces";
import { markBox, PAPER } from "../data/wall";
import { heldMarks, type HeldMark, moderateWall } from "../data/wall-live";
import { drawStroke, type Stroke } from "../engine/stroke";
import { NotFound } from "./Errors";

/* /mod, the mods' queue: pieces waiting for a mod, open reports, and what the mods did
   lately. Mods read every piece and report through PostgREST; their actions go through
   tilo-api, which moves the files and writes the log. */

const REASON: Record<Reason, string> = {
  nsfw: "not for all ages",
  "not-hand-made": "not drawn by hand",
  copied: "copied",
  abuse: "hateful or abusive",
  spam: "spam",
  other: "something else",
};

interface Report {
  id: number;
  piece: string | null;
  profile: string | null;
  wall: number | null;
  reason: Reason;
  note: string;
  created: string;
  reporter: { handle: string } | null;
  target: { handle: string } | null;
}
interface LogRow {
  action: string;
  piece: string | null;
  wall: number | null;
  note: string;
  created: string;
  mod: { handle: string } | null;
  who: { handle: string } | null;
}
type Held = Published & { screen: Parameters<typeof screenLine>[0] };

export const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

async function loadQueue() {
  const [held, reports, log, marks] = await Promise.all([
    call<(Parameters<typeof fromRow>[0] & { screen: Held["screen"] })[]>(`/rest/v1/pieces?status=eq.held&select=${SELECT},screen&order=created.asc&limit=100`),
    call<Report[]>(
      "/rest/v1/reports?status=eq.open&select=id,piece,profile,wall,reason,note,created,reporter:profiles!reports_reporter_fkey(handle),target:profiles!reports_profile_fkey(handle)&order=created.asc&limit=200",
    ),
    call<LogRow[]>("/rest/v1/mod_log?select=action,piece,wall,note,created,mod:profiles!mod_log_mod_fkey(handle),who:profiles!mod_log_profile_fkey(handle)&order=created.desc&limit=20"),
    heldMarks(),
  ]);
  // the pieces reports are about that aren't already in the held list
  const heldIds = new Set(held.map((p) => p.id));
  const more = [...new Set(reports.map((r) => r.piece).filter((id): id is string => !!id && !heldIds.has(id)))];
  const reported = more.length ? await call<Parameters<typeof fromRow>[0][]>(`/rest/v1/pieces?id=in.(${more.join(",")})&select=${SELECT}`) : [];
  return {
    held: held.map((r) => ({ ...fromRow(r), screen: r.screen }) as Held),
    reports,
    reported: reported.map(fromRow),
    log,
    marks,
  };
}
type Queue = Awaited<ReturnType<typeof loadQueue>>;

function Thumb({ piece }: { piece: Published }) {
  const url = usePicture(piece);
  return <span className="queue-thumb">{url ? <img src={url} alt="" /> : <span className="kicker">{piece.checked ? "No picture" : "Checking"}</span>}</span>;
}

function ReportList({ reports }: { reports: Report[] }) {
  if (!reports.length) return null;
  return (
    <ul className="queue-reports">
      {reports.map((r) => (
        <li key={r.id} className="serif">
          <b>{REASON[r.reason]}</b>
          {r.note && <> · “{r.note}”</>} · @{r.reporter?.handle ?? "someone"}, {when.format(new Date(r.created))}
        </li>
      ))}
    </ul>
  );
}

function Dismiss({ reports, onDone }: { reports: Report[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      for (const r of reports) await moderate("reports", r.id, "dismiss");
    } finally {
      setBusy(false);
      onDone();
    }
  };
  return <button className="btn btn-quiet" disabled={busy} onClick={go}>Dismiss {reports.length > 1 ? `the ${reports.length} reports` : "the report"}</button>;
}

export function PieceItem({ piece, reports, onDone }: { piece: Published & { screen?: Held["screen"] }; reports: Report[]; onDone: () => void }) {
  return (
    <li className="queue-item">
      <Thumb piece={piece} />
      <div className="queue-body">
        <p className="queue-title">
          <Link to={`/piece/${piece.id}`}>{piece.title}</Link> <span className="serif">by <Link to={`/u/${piece.by}`}>@{piece.by}</Link></span>
        </p>
        <p className="serif queue-why">
          {piece.status === "live" ? "In the gallery." : `${piece.status === "held" ? "Waiting" : piece.status === "hidden" ? "Hidden" : "Removed"}${piece.why ? `: ${WHY_FOR_MODS[piece.why]}` : ""}.`} {piece.screen !== undefined && screenLine(piece.screen)}
        </p>
        <ReportList reports={reports} />
        <div className="row row-start">
          <ModButtons piece={piece} onDone={onDone} />
          {piece.status === "live" && reports.length > 0 && <Dismiss reports={reports} onDone={onDone} />}
        </div>
      </div>
    </li>
  );
}

export const LOGGED: Record<string, string> = {
  approve: "let in",
  hide: "hid",
  remove: "removed",
  dismiss: "dismissed a report on",
  suspend: "suspended",
  unsuspend: "lifted the suspension of",
  erase: "rubbed out marks on",
  restore: "let held marks back on",
  show: "put back",
};

/** One mark on its own, scaled to fit a small box. */
function MarkThumb({ s }: { s: Stroke }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current!;
    const ctx = c.getContext("2d")!;
    const [x0, y0, x1, y1] = markBox(s);
    const k = Math.min(c.width / (x1 - x0), c.height / (y1 - y0), 2);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(1, 0, 0, 1, (c.width - (x1 - x0) * k) / 2 - x0 * k, (c.height - (y1 - y0) * k) / 2 - y0 * k);
    drawStroke(ctx, s, k);
  }, [s]);
  return <canvas ref={cv} width={160} height={100} className="mark-thumb" role="img" aria-label="The mark" />;
}

/** Marks the image check held on the wall, one member's at a time. */
function HeldItem({ marks, onDone }: { marks: HeldMark[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const { wall, handle } = marks[0];
  const act = async (action: "restore" | "erase") => {
    setBusy(true);
    try {
      await moderateWall(wall, action, marks.map((m) => m.id));
    } finally {
      setBusy(false);
      onDone();
    }
  };
  return (
    <li className="queue-item">
      <span className="queue-thumb mark-thumbs">{marks.slice(0, 4).map((m) => <MarkThumb key={m.id} s={m.s as Stroke} />)}</span>
      <div className="queue-body">
        <p className="queue-title">
          {marks.length} mark{marks.length === 1 ? "" : "s"} by <Link to={`/u/${handle}`}>@{handle}</Link> <span className="serif">on <Link to={`/wall/${wall}`}>Wall No. {wall}</Link></span>
        </p>
        <p className="serif queue-why">Held: the image check flagged the part of the wall they're in, {when.format(new Date(marks[0].created))}.</p>
        <div className="row row-start">
          <button className="btn btn-ink" disabled={busy} onClick={() => act("restore")}>Let {marks.length === 1 ? "it" : "them"} back</button>
          <button className="btn btn-quiet" disabled={busy} onClick={() => act("erase")}>Rub {marks.length === 1 ? "it" : "them"} out</button>
        </div>
      </div>
    </li>
  );
}

function PutBack({ no, onDone }: { no: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button className="link-btn" disabled={busy} onClick={() => (setBusy(true), void moderateWall(no, "show").finally(onDone))}>
      Put it back
    </button>
  );
}

export function Queue() {
  const { ready, profile } = useAccount();
  const [q, setQ] = useState<Queue | null>(null);
  const [failed, setFailed] = useState(false);
  const isMod = !!profile && profile.role !== "member";
  const load = () => loadQueue().then(setQ, () => setFailed(true));
  useEffect(() => {
    if (isMod) void load();
  }, [isMod]);

  if (!ACCOUNTS || (ready && !isMod)) return <NotFound />;
  if (failed && !q)
    return (
      <main id="main" tabIndex={-1} className="wrap error-page">
        <p className="kicker">Couldn't load</p>
        <h1>The queue didn't arrive</h1>
        <p className="serif">Tilo's server didn't answer. Reload to try again.</p>
      </main>
    );
  if (!q)
    return (
      <main id="main" tabIndex={-1} className="wrap queue-page" aria-busy="true">
        <p className="serif page-wait">Opening the queue…</p>
      </main>
    );

  const waiting = q.held.filter((p) => p.why !== "check");
  const checking = q.held.length - waiting.length;
  const onPiece = (id: string) => q.reports.filter((r) => r.piece === id);
  const profiles = [...new Set(q.reports.filter((r) => r.profile).map((r) => r.profile!))];
  const walls = [...new Set(q.reports.filter((r) => r.wall !== null).map((r) => r.wall!))];
  const heldGroups = [...q.marks.reduce((m, k) => m.set(`${k.wall}-${k.member}`, [...(m.get(`${k.wall}-${k.member}`) ?? []), k]), new Map<string, HeldMark[]>()).values()];

  return (
    <main id="main" tabIndex={-1} className="wrap queue-page">
      {profile?.role === "admin" && <AdminTabs />}
      <p className="kicker">For mods</p>
      <h1>The queue</h1>
      <p className="serif queue-lede">
        Tilo is for all ages: let a piece in only if you would show it to a class of ten-year-olds. Hide what its artist may keep; remove what nobody should.
        {checking > 0 && ` ${checking} piece${checking > 1 ? "s are" : " is"} being checked now.`}
      </p>

      <section aria-labelledby="q-held">
        <h2 id="q-held" className="kicker">Waiting for a mod · {waiting.length}</h2>
        {waiting.length ? (
          <ul className="queue-list">{waiting.map((p) => <PieceItem key={p.id} piece={p} reports={onPiece(p.id)} onDone={load} />)}</ul>
        ) : (
          <p className="empty serif">Nothing is waiting.</p>
        )}
      </section>

      <section aria-labelledby="q-reports">
        <h2 id="q-reports" className="kicker">Reported, still in the gallery · {q.reported.length + profiles.length}</h2>
        {q.reported.length || profiles.length ? (
          <ul className="queue-list">
            {q.reported.map((p) => <PieceItem key={p.id} piece={p} reports={onPiece(p.id)} onDone={load} />)}
            {profiles.map((id) => {
              const rs = q.reports.filter((r) => r.profile === id);
              const handle = rs[0].target?.handle ?? "";
              return (
                <li key={id} className="queue-item">
                  <span className="queue-thumb"><span className="kicker">Profile</span></span>
                  <div className="queue-body">
                    <p className="queue-title"><Link to={`/u/${handle}`}>@{handle}</Link> <span className="serif">(suspend from their page)</span></p>
                    <ReportList reports={rs} />
                    <div className="row row-start"><Dismiss reports={rs} onDone={load} /></div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty serif">No open reports.</p>
        )}
      </section>

      <section aria-labelledby="q-wall">
        <h2 id="q-wall" className="kicker">On the wall · {heldGroups.length + walls.length}</h2>
        {heldGroups.length || walls.length ? (
          <ul className="queue-list">
            {heldGroups.map((g) => <HeldItem key={`${g[0].wall}-${g[0].member}`} marks={g} onDone={load} />)}
            {walls.map((no) => {
              const rs = q.reports.filter((r) => r.wall === no);
              return (
                <li key={`w${no}`} className="queue-item">
                  <span className="queue-thumb"><span className="kicker">Wall</span></span>
                  <div className="queue-body">
                    <p className="queue-title">
                      <Link to={`/wall/${no}`}>Wall No. {no}</Link> <span className="serif">(open it on <Link to="/wall">the wall's page</Link> and rub out with the pick tool, if it's the one up now)</span>
                    </p>
                    <ReportList reports={rs} />
                    <div className="row row-start"><Dismiss reports={rs} onDone={load} /></div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty serif">Nothing held or reported on the wall.</p>
        )}
      </section>

      <section aria-labelledby="q-log">
        <h2 id="q-log" className="kicker">Lately</h2>
        {q.log.length ? (
          <ul className="queue-log serif">
            {q.log.map((l, i) => (
              <li key={i}>
                {when.format(new Date(l.created))}: {l.mod ? `@${l.mod.handle}` : "A mod"} {LOGGED[l.action] ?? l.action}{" "}
                {l.piece ? (
                  <Link to={`/piece/${l.piece}`}>a piece</Link>
                ) : l.wall !== null ? (
                  <>
                    <Link to={`/wall/${l.wall}`}>Wall No. {l.wall}</Link>
                    {l.who && ` (@${l.who.handle})`}
                    {l.action === "hide" && <> · <PutBack no={l.wall} onDone={load} /></>}
                  </>
                ) : l.who ? (
                  `@${l.who.handle}`
                ) : (
                  "something since deleted"
                )}
                {l.note && <> · “{l.note}”</>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty serif">No actions yet.</p>
        )}
      </section>
    </main>
  );
}
