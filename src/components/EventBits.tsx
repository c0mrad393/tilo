import { useEffect, useState } from "react";
import { Link } from "react-router";
import { EVENT, eventOn } from "../data/event";
import { FIRST_SUBJECT, PROMPT, SUBJECTS, subjectNo } from "../data/prompt";
import { WALL_DAYS, WALL_EVENTS } from "../data/wall";
import { Icon } from "./Icon";

/* What the site shows while an event is on (data/event.ts): the bar over every page and the
   section near the top of the home page. Both are gone once it's over. */

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Asia/Tbilisi" });

/** the time left until the event's moment: "2d 14:03:22", or null once it's passed */
function useCountTo(to: number) {
  const [left, setLeft] = useState<string | null>("");
  useEffect(() => {
    const tick = () => {
      const sec = Math.floor((to - Date.now()) / 1000);
      if (sec <= 0) return setLeft(null);
      const d = Math.floor(sec / 86400);
      const clock = [(sec % 86400) / 3600, (sec % 3600) / 60, sec % 60].map((n) => String(Math.floor(n)).padStart(2, "0")).join(":");
      setLeft(d ? `${d}d ${clock}` : clock);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [to]);
  return left;
}

/** the event's subject and wall, with their dates */
function parts() {
  const idea = SUBJECTS.findIndex((t) => t.event === EVENT.id);
  const subject = idea >= 0 ? subjectNo(FIRST_SUBJECT.no + idea) : null;
  const wallEntry = Object.entries(WALL_EVENTS).find(([, w]) => w.event === EVENT.id);
  return { subject, wall: wallEntry ? { no: Number(wallEntry[0]), ...wallEntry[1] } : null };
}

/** marks the page for the event's look while it's on */
export function useEventLook() {
  useEffect(() => {
    if (!eventOn()) return;
    document.documentElement.dataset.event = EVENT.id;
    const t = setTimeout(() => delete document.documentElement.dataset.event, Math.max(0, EVENT.ends - Date.now()));
    return () => {
      clearTimeout(t);
      delete document.documentElement.dataset.event;
    };
  }, []);
}

/** the bar over every page */
export function EventBar() {
  const left = useCountTo(EVENT.countTo);
  if (!eventOn()) return null;
  return (
    <a className="event-bar" href="/#release">
      <span className="event-bar-name kicker">{EVENT.name}</span>
      <span className="event-bar-count">
        {left === null ? EVENT.after : <>{EVENT.before} <b className="num">{left || "…"}</b></>}
      </span>
      <span className="event-bar-more opt serif">Draw along on Tilo</span>
      <Icon name="arrow" size={16} />
    </a>
  );
}

/** the home page's section */
export function EventSection() {
  const left = useCountTo(EVENT.countTo);
  if (!eventOn()) return null;
  const { subject, wall } = parts();
  const now = Date.now();
  const subjectUp = subject && PROMPT.no === subject.no;
  return (
    <section className="event wrap" id="release" aria-labelledby="release-h">
      <div className="event-card">
        <span className="event-sun" aria-hidden="true" />
        <p className="kicker event-kicker">{EVENT.name} · {day.format(EVENT.starts)} to {day.format(EVENT.ends - 1)}</p>
        <h2 id="release-h" className="event-h">
          Draw while
          <br />
          you wait.
        </h2>
        <p className="event-count">
          {left === null ? EVENT.after : <>{EVENT.before} <b className="num">{left || "…"}</b></>}
        </p>
        <ol className="event-steps">
          {wall && (
            <li>
              <span className="kicker">Wall No. {wall.no} · {day.format(EVENT.wallFrom)} to {day.format(EVENT.wallFrom + WALL_DAYS * 86_400_000 - 1)}</span>
              <b>{wall.title}</b>
              <span className="serif">
                A wall for everyone, drawn by us in a sunset mood: hotels, palms and blank billboards. Add a car, a sign, a passer-by.
              </span>
              {now >= EVENT.wallFrom ? (
                <Link to="/wall" className="btn btn-ink">Open the wall</Link>
              ) : (
                <span className="event-when serif">Goes up at midnight on {day.format(EVENT.wallFrom)}, Tbilisi time.</span>
              )}
            </li>
          )}
          {subject && (
            <li>
              <span className="kicker">Subject No. {subject.no} · {day.format(subject.starts)} to {day.format(subject.ends - 1)}</span>
              <b>{subject.title}</b>
              <span className="serif">Six sunset inks and ten minutes. Draw yourself the way a game's loading art would: bold, bright, mid-action.</span>
              {subjectUp ? (
                <Link to={`/studio?prompt=${subject.no}`} className="btn btn-ink"><Icon name="pencil" />Start the 10-minute sheet</Link>
              ) : (
                <span className="event-when serif">Goes up at midnight on {day.format(subject.starts)}, Tbilisi time.</span>
              )}
              <span className="event-inks" aria-label="The inks for this subject">
                {subject.palette.map((c, i) => <i key={c} style={{ background: c }} title={subject.names[i]} />)}
              </span>
            </li>
          )}
          <li>
            <span className="kicker">Then</span>
            <b>Stamp the best ones</b>
            <span className="serif">The most stamped go to the front of the gallery. Post yours with the link to its page, and its replay comes along.</span>
            <Link to="/gallery" className="btn btn-line">Open the gallery</Link>
          </li>
        </ol>
        <p className="event-note serif">
          Tilo has nothing to do with Rockstar Games or GTA VI, and nothing here comes from the game. Draw your own people and places, not the game's characters or art.
        </p>
      </div>
    </section>
  );
}
