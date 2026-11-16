import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { FeedPlayer, SEEK } from "../components/FeedPlayer";
import { Icon } from "../components/Icon";
import { AiMark } from "../components/PinCard";
import { ShareButton } from "../components/Share";
import { ServerStamps } from "../components/Stamps";
import { ACCOUNTS, setFollow, useAccount } from "../data/account";
import { pickCurrent, planFeed, wantsMore } from "../data/feed";
import { feedRecordings, followingOf, listPieces, type Published, type Sort } from "../data/pieces";
import { PROMPT } from "../data/prompt";
import { isAnimated } from "../engine/frames";
import { prefersReducedMotion } from "../engine/replay";
import { fmtMin, isPixelShape } from "../engine/stroke";

const LISTS: [Sort, string][] = [["new", "Newest"], ["following", "Following"], ["prompt", "Today's subject"], ["pixel", "Pixel art"], ["anim", "Animation"]];
// the gallery's other lists play here too, from its "Watch as a feed"
const MORE: Partial<Record<Sort, string>> = { stamped: "Most stamped this week", remix: "Remixes" };
const SIZE = 12;
const SPEEDS = [1, 2, 4];

const saveData = () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
/** keys pressed in a field or on a button belong to it */
const ownsKeys = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(t.tagName) || !!t.closest("dialog"));

function useList(sort: Sort, me?: string) {
  const [s, set] = useState<{ items: Published[]; more: boolean; page: number; status: "loading" | "ready" | "failed"; none?: boolean }>({ items: [], more: false, page: 0, status: "loading" });
  const load = (page: number, keep: Published[]) => {
    set((x) => ({ ...x, status: "loading" }));
    let live = true;
    listPieces({ sort, subject: PROMPT.no, page, size: SIZE, me }).then(
      (r) => live && set({ items: [...keep, ...r.items.filter((p) => !keep.some((k) => k.id === p.id))], more: r.more, page, status: "ready", none: "none" in r }),
      () => live && set((x) => ({ ...x, status: "failed" })),
    );
    return () => {
      live = false;
    };
  };
  useEffect(() => {
    set({ items: [], more: false, page: 0, status: "loading" });
    if (ACCOUNTS && (sort !== "following" || me)) return load(0, []);
  }, [sort, me]);
  return { ...s, next: () => load(s.page + 1, s.items) };
}

/* what is said beside the plate: who made it, its marks, its stamps, and the ways on */
function Details({ piece, no, following, onFollow }: { piece: Published; no: number; following: boolean | null; onFollow: () => void }) {
  const nav = useNavigate();
  const moving = isAnimated(piece);
  return (
    <section className="press-info" aria-labelledby={`press-h-${piece.id}`}>
      <p className="kicker press-marks">
        <span className="num">Plate {String(no).padStart(2, "0")}</span>
        {piece.ai && <AiMark className="is-inline" />}
        {isPixelShape(piece.shape) && <span className="card-kind is-inline">{moving ? "Pixel animation" : "Pixel art"}</span>}
      </p>
      <h2 id={`press-h-${piece.id}`}>
        <Link to={`/piece/${piece.id}`} viewTransition>{piece.title}</Link>
      </h2>
      <p className="serif press-by">
        <Link to={`/u/${piece.by}`} viewTransition>@{piece.by}</Link>
        {following !== null && (
          <button className={`btn btn-small ${following ? "btn-line" : "btn-ink"}`} aria-pressed={following} onClick={onFollow}>
            {following ? "Following" : "Follow"}
          </button>
        )}
      </p>
      <p className="serif press-facts">
        {piece.count.toLocaleString()} strokes{piece.ai ? " · drawn by Claude, an AI, in code" : ` · ${fmtMin(piece.minutes)} min`}
        {piece.remixOf ? " · a remix" : ""}
      </p>
      <div className="press-stamps">
        <ServerStamps piece={piece} />
      </div>
      <div className="press-actions">
        <Link to={`/piece/${piece.id}`} viewTransition className="btn btn-line">Open the piece<Icon name="arrow" size={16} /></Link>
        {piece.remixable && !moving && (
          <button className="btn btn-line" onClick={() => nav(`/studio?remix=${piece.id}`, { viewTransition: true })}>
            <Icon name="remix" />Remix
          </button>
        )}
        <ShareButton
          className="btn btn-line"
          target={{ id: piece.id, title: piece.title, by: piece.by, ai: piece.ai, published: true, load: async () => ({ ...piece, strokes: await feedRecordings.get(piece.id) }) }}
        />
      </div>
    </section>
  );
}

/* The feed, from Stage 3.3: one piece a screen, each drawing itself from its first stroke
   when it comes into view. The plan in data/feed.ts says which piece plays, which are made
   ready and which are let go; this page measures what is on screen and lays it out. */
export function Feed() {
  const [params, setParams] = useSearchParams();
  const { ready, profile } = useAccount();
  const asked = (params.get("sort") as Sort) || "new";
  const known = LISTS.some(([k]) => k === asked) || asked in MORE;
  const sort: Sort = !known || (asked === "following" && ready && !profile) ? "new" : asked;
  const list = useList(sort, profile?.id);
  const { items } = list;

  const reduced = useMemo(prefersReducedMotion, []);
  const save = useMemo(saveData, []);
  const [current, setCurrent] = useState(-1);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState(() => document.hidden);
  const [follows, setFollows] = useState<Set<string> | null>(null);
  const ratios = useRef<number[]>([]);

  const plan = useMemo(() => {
    const at = new Set<number>();
    items.forEach((p, i) => pressed.has(p.id) && at.add(i));
    return planFeed(items.length, current, { manual: reduced, save, pressed: at });
  }, [items, current, reduced, save, pressed]);

  // a new list starts at its top
  useEffect(() => {
    ratios.current = [];
    setCurrent(-1);
    setPressed(new Set());
  }, [sort]);

  // which piece is most on screen
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) ratios.current[+(e.target as HTMLElement).dataset.i!] = e.intersectionRatio;
        setCurrent((c) => pickCurrent(ratios.current, c));
      },
      { threshold: [0, 0.2, 0.4, 0.55, 0.6, 0.65, 0.8, 1] },
    );
    document.querySelectorAll(".press-item").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length]);

  // a piece newly on screen plays; the next page loads as the end comes near
  useEffect(() => setPaused(false), [current]);
  useEffect(() => {
    if (list.status === "ready" && wantsMore(items.length, current, list.more)) list.next();
  }, [current, items.length, list.more, list.status]);

  // recordings two pieces around; the cache keeps the last eight
  useEffect(() => {
    for (const i of plan.load) feedRecordings.get(items[i].id).catch(() => {});
  }, [plan.load.join(), items]);

  // a hidden tab pauses
  useEffect(() => {
    const f = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);

  // pieces snap into place, unless the viewer prefers less motion
  useEffect(() => {
    if (reduced) return;
    document.documentElement.classList.add("is-press");
    return () => document.documentElement.classList.remove("is-press");
  }, [reduced]);

  // who the viewer follows, for the Follow buttons
  useEffect(() => {
    if (!profile) return void setFollows(null);
    followingOf(profile.id).then((ids) => setFollows(new Set(ids)), () => {});
  }, [profile?.id]);
  const follow = (owner: string) => {
    if (!follows) return;
    const on = !follows.has(owner);
    const flip = (v: boolean) => setFollows((f) => {
      const n = new Set(f);
      if (v) n.add(owner);
      else n.delete(owner);
      return n;
    });
    flip(on);
    setFollow(owner, on).catch(() => flip(!on));
  };

  const go = (i: number) => {
    const el = document.querySelector<HTMLElement>(`.press-item[data-i="${Math.max(0, Math.min(items.length - 1, i))}"]`);
    el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };
  const toggle = (i: number) => {
    const p = items[i];
    if (i !== current) {
      setPressed((s) => new Set(s).add(p.id));
      return go(i);
    }
    if (plan.slots[i] !== "play") {
      setPressed((s) => new Set(s).add(p.id));
      return setPaused(false);
    }
    setPaused((v) => !v);
  };

  // J and K (or the arrows) move, Space plays and pauses, ← → seek
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || ownsKeys(e.target)) return;
      const k = e.key;
      if (k === "j" || k === "J" || k === "ArrowDown") go(current + 1);
      else if (k === "k" || k === "K" || k === "ArrowUp") go(current - 1);
      else if (k === " ") document.querySelector<HTMLButtonElement>(`.press-item[data-i="${current}"] .press-controls .play`)?.click();
      else if (k === "ArrowRight" || k === "ArrowLeft") dispatchEvent(new CustomEvent(SEEK, { detail: k === "ArrowRight" ? 0.05 : -0.05 }));
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  const lists: [Sort, string][] = [...LISTS.filter(([k]) => k !== "following" || profile), ...(sort in MORE ? [[sort, MORE[sort]!] as [Sort, string]] : [])];
  const pick = (k: Sort) => setParams((p) => { p.set("sort", k); return p; }, { replace: true });

  if (!ACCOUNTS)
    return (
      <main id="main" tabIndex={-1} className="wrap press-page">
        <header className="page-head press-head">
          <h1>On the press</h1>
          <p className="serif">The feed plays published pieces, and publishing opens with accounts. Until then, <Link to="/gallery">the gallery</Link> replays what is on this device.</p>
        </header>
      </main>
    );

  return (
    <main id="main" tabIndex={-1} className="wrap press-page">
      <header className="page-head press-head">
        <h1>On the press</h1>
        <p className="serif">
          One piece a screen, each drawing itself from its first stroke as it comes up. Scroll on for the next.
          {reduced || save ? " Nothing plays by itself here: press Play on a piece to watch it drawn." : ""}
        </p>
        <div className="filters" role="group" aria-label="Which pieces">
          {lists.map(([k, l]) => (
            <button key={k} className="filter" aria-pressed={sort === k} onClick={() => pick(k)}>{l}</button>
          ))}
        </div>
        <p className="kicker press-keys">J and K move · Space plays and pauses · ← → seek</p>
      </header>

      {list.status === "failed" && !items.length ? (
        <p className="empty serif" role="alert">The feed didn't load: Tilo's server didn't answer. Check your connection and reload.</p>
      ) : list.status === "ready" && !items.length ? (
        <p className="empty serif">
          {sort === "following"
            ? list.none
              ? "You don't follow anyone yet. Follow an artist from any piece and their new pieces play here."
              : "Nobody you follow has published anything yet."
            : "Nothing published here yet."}{" "}
          <Link to="/gallery">Back to the gallery</Link>
        </p>
      ) : (
        <div className="press-list">
          {items.map((p, i) => {
            const slot = plan.slots[i] ?? "picture";
            return (
              <article key={p.id} className="press-item" data-i={i} data-current={i === current || undefined} aria-label={`${p.title} by ${p.by}`}>
                {slot !== "spacer" && (
                  <div className="press-in">
                    <FeedPlayer
                      piece={p}
                      slot={slot}
                      run={slot === "play" && !paused && !hidden}
                      speed={speed}
                      onToggle={() => toggle(i)}
                      onSpeed={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
                      onNext={i < items.length - 1 ? () => go(i + 1) : undefined}
                    />
                    <Details piece={p} no={i + 1} following={follows && p.owner !== profile?.id ? follows.has(p.owner) : null} onFollow={() => follow(p.owner)} />
                  </div>
                )}
              </article>
            );
          })}
          {list.status === "loading" && <p className="serif page-wait" aria-live="polite">Inking the next plates…</p>}
          {!list.more && list.status === "ready" && items.length > 0 && (
            <p className="serif press-end">
              That's the press for now. <Link to="/gallery">See the gallery</Link> or <Link to="/studio">start a sheet</Link>.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
