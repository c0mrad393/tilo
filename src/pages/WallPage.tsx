import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router";
import { Wall } from "../components/Wall";
import { ReportButton } from "../components/Moderation";
import { useAccount } from "../data/account";
import { WALL_DAYS } from "../data/wall";
import { liveWall, moderateWall, type PastWall, pastWall, pastWalls, wallDates, WALL_LIVE } from "../data/wall-live";
import { NotFound } from "./Errors";

/* /wall: the shared wall, bigger than on the home page, with the archive beside it.
   /wall/past lists every wall that has closed; /wall/:no is one of them, with who drew on it. */

function Head({ children }: { children?: React.ReactNode }) {
  return (
    <header className="page-head wall-head">
      <h1>The wall</h1>
      <p className="serif">
        One sheet for everyone. Every {WALL_DAYS} days a new subject goes up, an outline Claude (an AI) drew with room left on purpose; members fill it in
        by hand, and when its time is up it goes into the archive, as it was at the end. Anyone can look; only members draw.
      </p>
      <nav className="admin-tabs wall-tabs" aria-label="The wall">
        <NavLink to="/wall" end viewTransition>This wall</NavLink>
        <NavLink to="/wall/past" viewTransition>Past walls</NavLink>
      </nav>
      {children}
    </header>
  );
}

const span = (w: Pick<PastWall, "started" | "ends">) => `${wallDates.format(new Date(w.started))} to ${wallDates.format(new Date(new Date(w.ends).getTime() - 1))}`;
const counted = (w: Pick<PastWall, "marks" | "artists">) =>
  `${w.marks.toLocaleString()} mark${w.marks === 1 ? "" : "s"} by ${w.artists.toLocaleString()} ${w.artists === 1 ? "person" : "people"}`;

export function WallPage() {
  return (
    <main id="main" tabIndex={-1} className="wrap wall-page">
      <Head />
      <section className="sec" aria-label="This wall">
        <Wall page />
      </section>
    </main>
  );
}

export function PastWalls() {
  const [walls, setWalls] = useState<PastWall[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (WALL_LIVE) pastWalls().then(setWalls, () => setFailed(true));
  }, []);
  return (
    <main id="main" tabIndex={-1} className="wrap wall-page">
      <Head />
      <section className="sec" aria-labelledby="past-h" aria-busy={!walls && !failed}>
        <h2 id="past-h" className="sr-only">Past walls</h2>
        {!WALL_LIVE || failed ? (
          <p className="empty serif">The archive didn't load. Reload to try again.</p>
        ) : !walls ? (
          <p className="serif page-wait">Opening the archive…</p>
        ) : !walls.length ? (
          <p className="empty serif">No wall has closed yet. The first one goes into the archive when its time is up; <Link to="/wall">draw on it</Link> before then.</p>
        ) : (
          <ul className="past-walls">
            {walls.map((w) => (
              <li key={w.no}>
                <Link to={`/wall/${w.no}`} className="past-wall">
                  <span className="past-wall-pic plate">
                    <img src={w.small} alt="" width={600} height={300} loading="lazy" decoding="async" />
                  </span>
                  <span className="kicker">Wall No. {w.no} · {span(w)}</span>
                  <b>{w.title}</b>
                  <span className="serif">{counted(w)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export function PastWallPage() {
  const { no: param } = useParams();
  const no = Number(param);
  const { profile } = useAccount();
  const navigate = useNavigate();
  const [w, setW] = useState<PastWall | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isMod = !!profile && profile.role !== "member";
  useEffect(() => {
    setW(null);
    setMissing(false);
    if (!WALL_LIVE || !Number.isInteger(no)) return setMissing(true);
    pastWall(no).then(setW, async () => {
      // the wall that is up now isn't in the archive yet: it has its own page
      const live = await liveWall().catch(() => null);
      if (live?.no === no) navigate("/wall", { replace: true });
      else setMissing(true);
    });
  }, [no, navigate]);

  if (missing) return <NotFound />;
  const hide = async () => {
    if (!confirm(`Take Wall No. ${no} out of the archive? Its picture stops being served. It can be put back from the queue's log.`)) return;
    setBusy(true);
    setError("");
    try {
      await moderateWall(no, "hide");
      navigate("/wall/past");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
      setBusy(false);
    }
  };

  return (
    <main id="main" tabIndex={-1} className="wrap wall-page" aria-busy={!w}>
      <Head />
      {!w ? (
        <p className="serif page-wait">Opening the wall…</p>
      ) : (
        <article className="sec past-one" aria-labelledby="one-h">
          <p className="kicker">Wall No. {w.no} · {span(w)}</p>
          <h2 id="one-h">{w.title}</h2>
          <div className="wall-frame plate reg past-one-pic">
            <img src={w.picture} alt={`Wall No. ${w.no}, ${w.title}: the outline and ${counted(w)}`} width={2000} height={1000} decoding="async" />
          </div>
          <p className="serif wall-msg">{counted(w)}. The outline is by Claude, an AI; every mark on it is by hand.</p>
          {!!w.people?.length && (
            <section aria-labelledby="who-h">
              <h3 id="who-h" className="kicker">Who drew on it</h3>
              <ul className="past-people">
                {w.people.map((p) => (
                  <li key={p.handle}>
                    <Link to={`/u/${p.handle}`}>@{p.handle}</Link> <span className="serif">{p.marks.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <nav className="row row-start past-nav" aria-label="Other walls">
            {w.prev !== null && w.prev !== undefined && <Link className="btn btn-line" to={`/wall/${w.prev}`}>Wall No. {w.prev}</Link>}
            {w.next !== null && w.next !== undefined && <Link className="btn btn-line" to={`/wall/${w.next}`}>Wall No. {w.next}</Link>}
            <Link className="btn btn-quiet" to="/wall/past">All past walls</Link>
            {profile && <ReportButton target={{ wall: w.no }} label={`Wall No. ${w.no}`} />}
            {isMod && <button className="btn btn-quiet" disabled={busy} onClick={hide}>Take it out of the archive</button>}
          </nav>
          {error && <p className="field-note is-error" role="alert">{error}</p>}
        </article>
      )}
    </main>
  );
}
