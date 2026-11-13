import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { AdminTabs } from "../components/AdminTabs";
import { ACCOUNTS, call, type Profile, useAccount } from "../data/account";
import { ModButtons } from "../components/Moderation";
import { type Claim, claims, closeClaim, decideSchool, type SchoolRow, schools, type ErrorReport, errorReports, fixedError, type Invite, invites, makeInvites, type Member, members, setRole, setSetting, settings, type Stats, stats, withdrawInvite, type WaitRow, waitlist, inviteFromWaitlist, dropFromWaitlist } from "../data/admin";
import { ANSWER_IN } from "../data/legal";
import { fromRow, type Published, SELECT } from "../data/pieces";
import { PAPER, WALL } from "../data/wall";
import { outline } from "../data/wall-art";
import { allWalls, artistsOn, marksBy, moderateWall, type WallRow, wallPicture } from "../data/wall-live";
import { drawStroke, type Stroke } from "../engine/stroke";
import { NotFound } from "./Errors";
import { LOGGED, PieceItem, when } from "./Queue";

/* /admin/:tab, the admin panel: the numbers, members, invite codes, every piece, feedback,
   error reports and the whole log. The queue (/mod) is its first tab. Admins only. */

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const date = (s: string | null) => (s ? day.format(new Date(s)) : "never");

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const run = () => {
    let live = true;
    setFailed(false);
    load().then(
      (d) => live && setData(d),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  };
  useEffect(run, deps);
  return { data, failed, reload: run };
}

const Wait = ({ failed }: { failed: boolean }) =>
  failed ? <p className="empty serif" role="alert">That didn't load. Reload to try again.</p> : <p className="serif page-wait">Loading…</p>;

// ---------- overview ----------

/* pieces published a day, for two weeks: one series, so no legend; each bar says its own number on hover and focus */
function PublishedChart({ days }: { days: Stats["days"] }) {
  const top = Math.max(1, ...days.map((d) => d.n));
  const total = days.reduce((n, d) => n + d.n, 0);
  return (
    <figure className="admin-chart">
      <figcaption className="kicker">Pieces published, last 14 days · {total}</figcaption>
      <div className="admin-bars" role="list">
        {days.map((d) => {
          const label = `${day.format(new Date(d.day))}: ${d.n} piece${d.n === 1 ? "" : "s"}`;
          return (
            <span key={d.day} role="listitem" tabIndex={0} className="admin-bar" aria-label={label} data-tip={label}>
              <i style={{ height: `${(d.n / top) * 100}%` }} />
            </span>
          );
        })}
      </div>
      <div className="admin-bars-axis serif" aria-hidden="true">
        <span>{day.format(new Date(days[0].day))}</span>
        <span>today</span>
      </div>
    </figure>
  );
}

function InvitesSetting() {
  const [on, setOn] = useState<boolean | null>(null);
  const [per, setPer] = useState("3");
  const [error, setError] = useState("");
  useEffect(() => {
    settings().then((s) => {
      setOn(s.invites_required === "true");
      setPer(s.invites_per_member ?? "0");
    }, () => {});
  }, []);
  if (on === null) return null;
  const flip = (next: boolean) => {
    setOn(next);
    setError("");
    setSetting("invites_required", String(next)).catch(() => {
      setOn(!next);
      setError("That didn't save.");
    });
  };
  const perMember = (next: string) => {
    const was = per;
    setPer(next);
    setError("");
    setSetting("invites_per_member", next).catch(() => {
      setPer(was);
      setError("That didn't save.");
    });
  };
  return (
    <section className="admin-card">
      <h2 className="kicker">Sign-up</h2>
      <label className="check"><input type="checkbox" checked={on} onChange={(e) => flip(e.target.checked)} /> New members need an invite code</label>
      <p className="field-note">{on ? "The closed beta: only someone with a code can pick a handle." : "Open: anyone who signs in can pick a handle."}</p>
      <label className="field admin-per">
        <span className="kicker">Codes each member can hand out</span>
        <select value={per} onChange={(e) => perMember(e.target.value)} disabled={!on}>
          {Array.from({ length: 11 }, (_, i) => <option key={i} value={String(i)}>{i === 0 ? "None" : i}</option>)}
        </select>
      </label>
      <p className="field-note">Members make them one at a time on their account page. Lowering this takes no code back that was already made.</p>
      {error && <p className="field-note is-error" role="alert">{error}</p>}
    </section>
  );
}

function Overview() {
  const { data: s, failed } = useLoad(stats, []);
  if (!s) return <Wait failed={failed} />;
  const tiles: [string, number, string, string?][] = [
    ["Members", s.members, `${s.new_members} new this week`, "/admin/members"],
    ["Signed in this week", s.signed_in, `${s.suspended} suspended`],
    ["In the gallery", s.live, `${s.hidden} hidden`, "/admin/pieces"],
    ["Waiting for a mod", s.waiting, "pieces", "/mod"],
    ["Open reports", s.reports, "pieces and profiles", "/mod"],
    ["Takedown claims", s.claims, `open, answer within ${ANSWER_IN}`, "/admin/claims"],
    ["Waiting list", s.waiting_list, "waiting for a code", "/admin/invites"],
    ["Invites left", s.invites_left, `${s.invites_used} used`, "/admin/invites"],
    ["Feedback", s.feedback, "to read", "/admin/feedback"],
    ["Errors this week", s.errors, `${s.error_count.toLocaleString()} time${s.error_count === 1 ? "" : "s"} in all`, "/admin/errors"],
  ];
  return (
    <>
      <div className="admin-tiles">
        {tiles.map(([name, n, sub, to]) => {
          const body = (
            <>
              <span className="kicker">{name}</span>
              <b>{n.toLocaleString()}</b>
              <span className="serif">{sub}</span>
            </>
          );
          return to ? <Link key={name} to={to} className="admin-tile">{body}</Link> : <div key={name} className="admin-tile">{body}</div>;
        })}
      </div>
      <PublishedChart days={s.days} />
      <InvitesSetting />
    </>
  );
}

// ---------- members ----------

function RoleSelect({ m, me, onDone }: { m: Member; me: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [want, setWant] = useState<Profile["role"] | null>(null);
  const [error, setError] = useState("");
  const dlg = useRef<HTMLDialogElement>(null);
  const save = async (role: Profile["role"]) => {
    setBusy(true);
    setError("");
    try {
      await setRole(m.id, role);
      dlg.current?.close();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  };
  const pick = (role: Profile["role"]) => {
    // making an admin hands over everything here, so it asks first
    if (role === "admin") {
      setWant(role);
      dlg.current!.showModal();
    } else void save(role);
  };
  return (
    <>
      <select aria-label={`Role of @${m.handle}`} value={m.role} disabled={busy || m.id === me} onChange={(e) => pick(e.target.value as Profile["role"])}>
        <option value="member">member</option>
        <option value="mod">mod</option>
        <option value="admin">admin</option>
      </select>
      {error && <span className="field-note is-error" role="alert">{error}</span>}
      <dialog ref={dlg} aria-labelledby={`admin-${m.id}`}>
        <div className="small-sheet sheet">
          <h2 id={`admin-${m.id}`}>Make @{m.handle} an admin?</h2>
          <p>Admins see every member's email address, change roles and settings, and make invite codes.</p>
          <div className="row">
            <button className="btn btn-quiet" onClick={() => dlg.current!.close()}>Cancel</button>
            <button className="btn btn-ink" disabled={busy} onClick={() => want && save(want)}>Make admin</button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function Members() {
  const { profile } = useAccount();
  const [q, setQ] = useState("");
  const [typed, setTyped] = useState("");
  const [role, setRoleFilter] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(typed.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [typed]);
  const { data, failed, reload } = useLoad(() => members({ q, role, page }), [q, role, page]);
  return (
    <>
      <div className="admin-filters">
        <label className="field">
          <span className="kicker">Search</span>
          <input type="search" value={typed} placeholder="Handle, name or email" onChange={(e) => setTyped(e.target.value)} />
        </label>
        <label className="field">
          <span className="kicker">Role</span>
          <select value={role} onChange={(e) => (setRoleFilter(e.target.value), setPage(0))}>
            <option value="">Everyone</option>
            <option value="member">Members</option>
            <option value="mod">Mods</option>
            <option value="admin">Admins</option>
          </select>
        </label>
      </div>
      {!data ? (
        <Wait failed={failed} />
      ) : !data.members.length ? (
        <p className="empty serif">Nobody matches.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Member</th><th>Email</th><th>Joined</th><th>Last in</th><th>Pieces</th><th>Invited by</th><th>Reports</th><th>Role</th></tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link to={`/u/${m.handle}`}>@{m.handle}</Link>
                    {m.name && <span className="admin-sub">{m.name}</span>}
                    {m.suspended && <span className="admin-flag">suspended</span>}
                  </td>
                  <td className="admin-email">{m.email}</td>
                  <td>{date(m.created)}</td>
                  <td>{date(m.last_sign_in)}</td>
                  <td>{m.live} of {m.pieces}</td>
                  <td>{m.invited_by ? `@${m.invited_by}` : m.invite ? "a code" : "none"}</td>
                  <td>{m.reports ? <Link to="/mod">{m.reports}</Link> : 0}</td>
                  <td><RoleSelect m={m} me={profile?.id ?? ""} onDone={reload} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} more={!!data?.more} setPage={setPage} />
      <p className="field-note">Suspend a member from their profile page.</p>
    </>
  );
}

function Pager({ page, more, setPage }: { page: number; more: boolean; setPage: (n: number) => void }) {
  if (!page && !more) return null;
  return (
    <div className="row row-start admin-pager">
      <button className="btn btn-quiet" disabled={!page} onClick={() => setPage(page - 1)}>Newer</button>
      <span className="serif">Page {page + 1}</span>
      <button className="btn btn-quiet" disabled={!more} onClick={() => setPage(page + 1)}>Older</button>
    </div>
  );
}

// ---------- claims ----------

const KIND: Record<Claim["kind"], string> = { copyright: "Copyright", abuse: "Abuse", privacy: "Privacy", other: "Other" };
const late = (c: Claim) => Date.now() - new Date(c.created).getTime() > 2 * 86400_000;

function ClaimItem({ c, onDone }: { c: Claim; onDone: () => void }) {
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = `claim-${c.id}`;
  const answer = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await closeClaim(c.id, outcome);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  };
  const path = c.url.replace(/^https?:\/\/[^/]+/, "");
  const subject = encodeURIComponent(`Your Tilo claim, number ${c.id}`);
  return (
    <li className="claim-item" aria-labelledby={`${id}-h`}>
      <p className="queue-title" id={`${id}-h`}>
        <span className="admin-flag">{KIND[c.kind]}</span> Number {c.id}, about{" "}
        {c.piece ? <Link to={path}>“{c.title}”</Link> : <Link to={path}>{path}</Link>}
        {c.about && <span className="serif"> by <Link to={`/u/${c.about}`}>@{c.about}</Link></span>}
      </p>
      <p className="serif queue-why">
        From {c.name}, <a href={`mailto:${c.email}?subject=${subject}`}>{c.email}</a>
        {c.sent_by && <>, signed in as <Link to={`/u/${c.sent_by}`}>@{c.sent_by}</Link></>}, {when.format(new Date(c.created))}
        {c.status === "open" && late(c) && <b className="claim-late">, over two days old</b>}.
        {c.kind === "copyright" && (c.sworn ? " Statement ticked." : " No statement.")}
        {c.piece_status && c.piece_status !== "live" && ` The piece is ${c.piece_status}.`}
      </p>
      <blockquote className="claim-details serif">{c.details}</blockquote>
      {c.status === "open" ? (
        <>
          {c.piece && c.piece_status && <ModButtons piece={{ id: c.piece, status: c.piece_status as Published["status"], title: c.title ?? "" }} onDone={onDone} />}
          <form className="admin-filters" onSubmit={answer}>
            <label className="field">
              <span className="kicker">What was done</span>
              <input value={outcome} maxLength={500} placeholder="e.g. Removed; artist told. Or: kept, it's their own work." onChange={(e) => setOutcome(e.target.value)} />
            </label>
            <button className="btn btn-line" disabled={busy || !outcome.trim()}>Mark answered</button>
          </form>
          <p className="field-note">Answer the claimant by email first; marking it answered only closes it here and writes the log.</p>
          {error && <p className="field-note is-error" role="alert">{error}</p>}
        </>
      ) : (
        <p className="serif queue-why">
          Answered {c.closed_at && when.format(new Date(c.closed_at))}{c.closed_by && ` by @${c.closed_by}`}: {c.outcome}
        </p>
      )}
    </li>
  );
}

function Claims() {
  const [status, setStatus] = useState<"open" | "closed">("open");
  const { data, failed, reload } = useLoad(() => claims(status), [status]);
  return (
    <>
      <p className="serif queue-lede">
        Copyright, abuse and privacy claims from the <Link to="/takedown">takedown page</Link>, from anyone. The terms promise an answer within{" "}
        {ANSWER_IN}. Hide or remove what has to go, write to the claimant, then mark the claim answered.
      </p>
      <div className="admin-filters">
        <label className="field">
          <span className="kicker">Show</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="open">Open</option>
            <option value="closed">Answered</option>
          </select>
        </label>
      </div>
      {!data ? (
        <Wait failed={failed} />
      ) : !data.length ? (
        <p className="empty serif">{status === "open" ? "No open claims." : "None answered yet."}</p>
      ) : (
        <ul className="queue-list">{data.map((c) => <ClaimItem key={c.id} c={c} onDone={reload} />)}</ul>
      )}
    </>
  );
}

// ---------- invites ----------

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = () =>
    navigator.clipboard.writeText(text).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }, () => {});
  return <button className="btn btn-quiet" onClick={copy}>{done ? "Copied" : label}</button>;
}

const SOURCE: Record<string, string> = { join: "/join", account: "handle step", "sign-in": "sign-in page" };

/* the waiting list: people without a code who left their address; each code goes out by email */
function Waitlist({ onSent }: { onSent: () => void }) {
  const [show, setShow] = useState<"waiting" | "sent" | "all">("waiting");
  const { data, failed, reload } = useLoad(() => waitlist(show), [show]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => setPicked(new Set()), [show]);
  const waiting = data?.filter((w) => !w.invited_at) ?? [];
  const send = async (ids: number[]) => {
    if (!ids.length) return;
    setBusy(true);
    setStatus(null);
    try {
      const r = await inviteFromWaitlist(ids);
      setStatus({
        text: `Sent ${r.sent} code${r.sent === 1 ? "" : "s"} by email.${r.failed.length ? ` Didn't go to ${r.failed.join(", ")}: ${r.fault}` : ""}`,
        error: r.failed.length > 0,
      });
      setPicked(new Set());
      reload();
      onSent();
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : "That didn't work.", error: true });
    } finally {
      setBusy(false);
    }
  };
  const drop = async (w: WaitRow) => {
    if (!confirm(`Take ${w.email} off the list for good?${w.invite && !w.used_at ? " Their unused code is withdrawn too." : ""}`)) return;
    await dropFromWaitlist(w.id).catch(() => {});
    reload();
  };
  const toggle = (id: number) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const next5 = waiting.slice(0, 5).map((w) => w.id);
  return (
    <section className="admin-card admin-waitlist" aria-labelledby="waitlist-h">
      <h2 id="waitlist-h" className="kicker">Waiting list</h2>
      <p className="field-note">
        People without a code leave their address on <Link to="/join">/join</Link>. Sending makes a code and emails it with a link that fills it in; it shows under Invites as "waiting list". Oldest first.
      </p>
      <div className="admin-filters">
        <label className="field">
          <span className="kicker">Show</span>
          <select value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
            <option value="waiting">Waiting</option>
            <option value="sent">Sent a code</option>
            <option value="all">All</option>
          </select>
        </label>
        {show !== "sent" && (
          <>
            <button className="btn btn-ink" disabled={busy || !picked.size} onClick={() => send([...picked])}>
              {busy ? "Sending…" : picked.size ? `Send ${picked.size} code${picked.size === 1 ? "" : "s"}` : "Send codes"}
            </button>
            <button className="btn btn-line" disabled={busy || !next5.length} onClick={() => send(next5)}>
              Send the next {Math.min(5, waiting.length) || 5}
            </button>
          </>
        )}
      </div>
      {status && <p className={`field-note${status.error ? " is-error" : ""}`} role={status.error ? "alert" : "status"}>{status.text}</p>}
      {!data ? (
        <Wait failed={failed} />
      ) : !data.length ? (
        <p className="empty serif">{show === "waiting" ? "Nobody is waiting." : "Nobody here."}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th><span className="sr-only">Pick</span></th><th>Email</th><th>Draws</th><th>From</th><th>Joined</th><th>Code</th><th /></tr>
            </thead>
            <tbody>
              {data.map((w) => (
                <tr key={w.id}>
                  <td>{!w.invited_at && <input type="checkbox" aria-label={`Pick ${w.email}`} checked={picked.has(w.id)} onChange={() => toggle(w.id)} />}</td>
                  <td>{w.email}</td>
                  <td>{w.note || "–"}</td>
                  <td>{SOURCE[w.source] ?? "–"}</td>
                  <td>{date(w.created)}</td>
                  <td>
                    {w.used_at ? <>in, {w.used_by ? <Link to={`/u/${w.used_by}`}>@{w.used_by}</Link> : "account deleted"}</> : w.invited_at ? <>sent {date(w.invited_at)} <span className="mono">{w.invite}</span></> : "waiting"}
                  </td>
                  <td className="admin-actions">
                    {w.invited_at && !w.used_at && <button className="btn btn-quiet" disabled={busy} onClick={() => send([w.id])}>Send again</button>}
                    <button className="btn btn-quiet" onClick={() => drop(w)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Invites() {
  const [used, setUsed] = useState<"" | "yes" | "no">("no");
  const { data, failed, reload } = useLoad(() => invites(used || undefined), [used]);
  const [count, setCount] = useState(5);
  const [note, setNote] = useState("");
  const [made, setMade] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const make = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setMade(await makeInvites(count, note));
      setNote("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };
  const withdraw = async (i: Invite) => {
    await withdrawInvite(i.code).catch(() => {});
    reload();
  };
  return (
    <>
      <Waitlist onSent={reload} />
      <form className="admin-card admin-make" onSubmit={make}>
        <h2 className="kicker">Make invite codes</h2>
        <div className="admin-filters">
          <label className="field">
            <span className="kicker">How many</span>
            <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </label>
          <label className="field">
            <span className="kicker">For<span className="field-optional">optional</span></span>
            <input value={note} maxLength={120} placeholder="Who they're for, e.g. Sololaki sketch club" onChange={(e) => setNote(e.target.value)} />
          </label>
          <button className="btn btn-ink" disabled={busy}>{busy ? "Making…" : "Make codes"}</button>
        </div>
        {error && <p className="field-note is-error" role="alert">{error}</p>}
        {made.length > 0 && (
          <div className="admin-made" role="status">
            <p className="serif">{made.length} new code{made.length > 1 ? "s" : ""}. Each one lets one person in.</p>
            <code>{made.join("\n")}</code>
            <CopyButton text={made.join("\n")} label="Copy all" />
          </div>
        )}
      </form>
      <div className="admin-filters">
        <label className="field">
          <span className="kicker">Show</span>
          <select value={used} onChange={(e) => setUsed(e.target.value as typeof used)}>
            <option value="no">Unused</option>
            <option value="yes">Used</option>
            <option value="">All</option>
          </select>
        </label>
      </div>
      {!data ? (
        <Wait failed={failed} />
      ) : !data.length ? (
        <p className="empty serif">No codes here.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Code</th><th>For</th><th>Made</th><th>Used</th><th /></tr>
            </thead>
            <tbody>
              {data.map((i) => (
                <tr key={i.code}>
                  <td className="mono">{i.code}</td>
                  <td>{i.note || "–"}</td>
                  <td>{date(i.created)}{i.made_by && ` by @${i.made_by}`}</td>
                  <td>{i.used_at ? <>{date(i.used_at)}{i.used_by ? <> by <Link to={`/u/${i.used_by}`}>@{i.used_by}</Link></> : " (account deleted)"}</> : "not yet"}</td>
                  <td className="admin-actions">
                    {!i.used_at && (
                      <>
                        <CopyButton text={i.code} />
                        <button className="btn btn-quiet" onClick={() => withdraw(i)}>Withdraw</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------- pieces ----------

const PIECES = 30;
function Pieces() {
  const [status, setStatus] = useState("");
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(typed.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [typed]);
  const { data, failed, reload } = useLoad(async () => {
    const p = new URLSearchParams({ select: `${SELECT},screen`, order: "created.desc", limit: String(PIECES + 1), offset: String(page * PIECES) });
    if (status) p.set("status", `eq.${status}`);
    if (q) p.set("title", `ilike.*${q.replace(/[*,()]/g, " ")}*`);
    const rows = await call<(Parameters<typeof fromRow>[0] & { screen: null })[]>(`/rest/v1/pieces?${p}`);
    return { items: rows.slice(0, PIECES).map((r) => ({ ...fromRow(r), screen: r.screen })), more: rows.length > PIECES };
  }, [status, q, page]);
  return (
    <>
      <div className="admin-filters">
        <label className="field">
          <span className="kicker">Title</span>
          <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
        <label className="field">
          <span className="kicker">Where</span>
          <select value={status} onChange={(e) => (setStatus(e.target.value), setPage(0))}>
            <option value="">Everywhere</option>
            <option value="live">In the gallery</option>
            <option value="held">Waiting</option>
            <option value="hidden">Hidden</option>
            <option value="removed">Removed</option>
          </select>
        </label>
      </div>
      {!data ? (
        <Wait failed={failed} />
      ) : !data.items.length ? (
        <p className="empty serif">No pieces match.</p>
      ) : (
        <ul className="queue-list">{data.items.map((p: Published & { screen: null }) => <PieceItem key={p.id} piece={p} reports={[]} onDone={reload} />)}</ul>
      )}
      <Pager page={page} more={!!data?.more} setPage={setPage} />
    </>
  );
}

// ---------- feedback ----------

type FeedbackRow = { id: number; kind: "problem" | "idea" | "other"; page: string; text: string; device: string; done: boolean; created: string; member: { handle: string } | null };
const FEEDBACK_KIND = { problem: "Something's broken", idea: "An idea", other: "Something else" };

function Feedback() {
  const [show, setShow] = useState<"open" | "done" | "">("open");
  const { data, failed, reload } = useLoad(() => {
    const p = new URLSearchParams({ select: "id,kind,page,text,device,done,created,member:profiles(handle)", order: "created.desc", limit: "200" });
    if (show) p.set("done", `is.${show === "done"}`);
    return call<FeedbackRow[]>(`/rest/v1/feedback?${p}`);
  }, [show]);
  const tick = async (f: FeedbackRow) => {
    await call(`/rest/v1/feedback?id=eq.${f.id}`, { method: "PATCH", headers: { prefer: "return=minimal" }, json: { done: !f.done } }).catch(() => {});
    reload();
  };
  return (
    <>
      <div className="admin-filters">
        <label className="field">
          <span className="kicker">Show</span>
          <select value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
            <option value="open">To read</option>
            <option value="done">Dealt with</option>
            <option value="">All</option>
          </select>
        </label>
      </div>
      {!data ? (
        <Wait failed={failed} />
      ) : !data.length ? (
        <p className="empty serif">{show === "open" ? "Nothing to read. Members send feedback from any page, with “Send feedback” under the masthead." : "None here."}</p>
      ) : (
        <ul className="queue-log serif">
          {data.map((f) => (
            <li key={f.id} className={f.done ? "feedback-done" : undefined}>
              <b>{FEEDBACK_KIND[f.kind]}</b> from {f.member ? <Link to={`/u/${f.member.handle}`}>@{f.member.handle}</Link> : "a deleted account"}, {when.format(new Date(f.created))}
              {f.page && <> on <code>{f.page}</code></>}
              <p>{f.text}</p>
              {f.device && <p className="field-note">{f.device}</p>}
              <button className="btn btn-quiet" onClick={() => tick(f)}>{f.done ? "Mark as not dealt with" : "Mark as dealt with"}</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---------- errors ----------

function Errors() {
  const { data, failed, reload } = useLoad(errorReports, []);
  const fixed = async (e: ErrorReport) => {
    await fixedError(e.sig).catch(() => {});
    reload();
  };
  if (!data) return <Wait failed={failed} />;
  return (
    <>
      <p className="serif">
        Faults in browsers and in tilo-api, sent on their own: one line per distinct fault, with how often it happened. Nothing about who it
        happened to is kept. A fault not seen for 30 days drops off; mark one fixed once a fix is live, and it comes back if it happens again.
      </p>
      {!data.length ? (
        <p className="empty serif">Nothing has broken lately.</p>
      ) : (
        <ul className="queue-log serif error-list">
          {data.map((e) => (
            <li key={e.sig}>
              <b>{e.message}</b>
              <span className="field-note">
                {e.count.toLocaleString()} time{e.count === 1 ? "" : "s"} · last {when.format(new Date(e.last_seen))}, first {when.format(new Date(e.first_seen))} ·{" "}
                {e.source === "api" ? "tilo-api" : "browser"}
                {e.page && <> · <code>{e.page}</code></>}
                {e.browser && ` · ${e.browser}`}
                {e.version && ` · version ${e.version}`}
              </span>
              {e.stack && (
                <details>
                  <summary>Where in the code</summary>
                  <pre>{e.stack}</pre>
                </details>
              )}
              <div className="row row-start">
                <button className="btn btn-quiet" onClick={() => fixed(e)}>Mark fixed</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---------- log ----------

const LOG = 50;
function Log() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(0);
  const { data, failed } = useLoad(async () => {
    const p = new URLSearchParams({
      select: "id,action,piece,wall,note,created,mod:profiles!mod_log_mod_fkey(handle),who:profiles!mod_log_profile_fkey(handle)",
      order: "created.desc",
      limit: String(LOG + 1),
      offset: String(page * LOG),
    });
    if (action) p.set("action", `eq.${action}`);
    const rows = await call<{ id: number; action: string; piece: string | null; wall: number | null; note: string; created: string; mod: { handle: string } | null; who: { handle: string } | null }[]>(`/rest/v1/mod_log?${p}`);
    return { rows: rows.slice(0, LOG), more: rows.length > LOG };
  }, [action, page]);
  const actions = { ...LOGGED, role: "changed the role of", invite: "made invites:", uninvite: "withdrew an invite:", setting: "changed a setting:", claim: "answered a claim about" };
  return (
    <>
      <div className="admin-filters">
        <label className="field">
          <span className="kicker">Action</span>
          <select value={action} onChange={(e) => (setAction(e.target.value), setPage(0))}>
            <option value="">All</option>
            {Object.keys(actions).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      </div>
      {!data ? (
        <Wait failed={failed} />
      ) : !data.rows.length ? (
        <p className="empty serif">Nothing logged.</p>
      ) : (
        <ul className="queue-log serif">
          {data.rows.map((l) => (
            <li key={l.id}>
              {when.format(new Date(l.created))}: {l.mod ? `@${l.mod.handle}` : "An admin"} {actions[l.action as keyof typeof actions] ?? l.action}{" "}
              {l.piece ? <Link to={`/piece/${l.piece}`}>a piece</Link> : l.wall !== null ? <Link to={`/wall/${l.wall}`}>Wall No. {l.wall}</Link> : null}
              {!l.piece && l.who && <> {l.wall !== null ? "(" : ""}<Link to={`/u/${l.who.handle}`}>@{l.who.handle}</Link>{l.wall !== null ? ")" : ""}</>}
              {l.note && <> {l.piece || l.who || l.wall !== null ? `· “${l.note}”` : l.note}</>}
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} more={!!data?.more} setPage={setPage} />
    </>
  );
}

// ---------- the wall ----------

/** One member's marks on a wall on their own, over a faint copy of the subject. */
function MemberMarks({ wall, member }: { wall: WallRow; member: string }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const { data, failed } = useLoad(() => marksBy(wall.no, member), [wall.no, member]);
  useEffect(() => {
    const c = cv.current;
    if (!c || !data) return;
    const ctx = c.getContext("2d")!;
    const k = c.width / WALL.w;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, c.width, c.height);
    // the subject on its own sheet, laid in faintly (the brushes set their own opacity)
    const back = document.createElement("canvas");
    back.width = c.width;
    back.height = c.height;
    const bctx = back.getContext("2d")!;
    outline(wall.theme).forEach((s) => drawStroke(bctx, s, k));
    ctx.globalAlpha = 0.16;
    ctx.drawImage(back, 0, 0);
    ctx.globalAlpha = 1;
    data.forEach((m) => drawStroke(ctx, m.s as Stroke, k));
  }, [data, wall.theme]);
  if (!data) return <Wait failed={failed} />;
  return (
    <figure className="wall-admin-marks">
      <canvas ref={cv} width={1000} height={500} role="img" aria-label={`Their ${data.length} marks on Wall No. ${wall.no}, on their own`} />
      <figcaption className="serif field-note">
        {data.length} mark{data.length === 1 ? "" : "s"}, from {data[0] ? when.format(new Date(data[0].created)) : "?"} to {data.at(-1) ? when.format(new Date(data.at(-1)!.created)) : "?"}. The subject is drawn faintly behind them.
      </figcaption>
    </figure>
  );
}

function WallAdmin() {
  const walls = useLoad(allWalls, []);
  const [no, setNo] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const wall = walls.data?.find((w) => w.no === no) ?? walls.data?.find((w) => w.status === "live") ?? walls.data?.[0];
  const people = useLoad(() => (wall ? artistsOn(wall.no) : Promise.resolve([])), [wall?.no, tick]);
  if (!walls.data) return <Wait failed={walls.failed} />;
  if (!wall) return <p className="empty serif">No wall has gone up yet.</p>;
  const again = () => {
    setTick((t) => t + 1);
    walls.reload();
  };
  const act = async (key: string, run: () => Promise<unknown>) => {
    setBusy(key);
    setError("");
    try {
      await run();
      again();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy("");
    }
  };
  const status = { live: "up now", closed: "in the archive", hidden: "taken out of the archive" }[wall.status];
  return (
    <>
      <div className="admin-filters">
        <label className="field">
          <span className="kicker">Wall</span>
          <select value={wall.no} onChange={(e) => (setNo(Number(e.target.value)), setOpen(null))}>
            {walls.data.map((w) => (
              <option key={w.no} value={w.no}>
                No. {w.no}, {w.title}
                {w.status === "live" ? " (up now)" : w.status === "hidden" ? " (hidden)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="wall-admin-head">
        {wall.status !== "hidden" ? (
          <img className="plate" src={wallPicture(wall)} alt={`Wall No. ${wall.no} as it is now`} width={600} height={300} />
        ) : (
          <span className="queue-thumb"><span className="kicker">Hidden</span></span>
        )}
        <div>
          <p className="queue-title">
            Wall No. {wall.no}: {wall.title} <span className="serif">({status})</span>
          </p>
          <p className="serif">
            {wall.marks.toLocaleString()} mark{wall.marks === 1 ? "" : "s"} by {wall.artists.toLocaleString()} {wall.artists === 1 ? "person" : "people"} · {date(wall.started)} to {date(new Date(new Date(wall.ends).getTime() - 1).toISOString())}
          </p>
          <div className="row row-start">
            <Link className="btn btn-line" to={wall.status === "live" ? "/wall" : `/wall/${wall.no}`}>Open it</Link>
            {wall.status !== "live" && (
              <button className="btn btn-quiet" disabled={!!busy} onClick={() => act("vis", () => moderateWall(wall.no, wall.status === "hidden" ? "show" : "hide"))}>
                {wall.status === "hidden" ? "Put it back in the archive" : "Take it out of the archive"}
              </button>
            )}
          </div>
          {wall.status === "live" && (
            <p className="field-note">To rub out one mark among others, open the wall and use the pick tool (the last tool in the tray). Here you take out everything one person drew.</p>
          )}
        </div>
      </div>
      {error && <p className="field-note is-error" role="alert">{error}</p>}
      <h2 className="kicker">Who drew on it · {people.data?.length ?? "…"}</h2>
      {!people.data ? (
        <Wait failed={people.failed} />
      ) : !people.data.length ? (
        <p className="empty serif">Nobody has drawn on it, or everything was rubbed out.</p>
      ) : (
        <ul className="queue-list wall-admin-people">
          {people.data.map((p) => (
            <li key={p.member} className="queue-item wall-admin-person">
              <div className="queue-body">
                <p className="queue-title">
                  <Link to={`/u/${p.handle}`}>@{p.handle}</Link>
                  {p.suspended && <span className="serif"> (suspended)</span>}{" "}
                  <span className="serif">
                    {p.marks.toLocaleString()} mark{p.marks === 1 ? "" : "s"}, last {when.format(new Date(p.last))}
                  </span>
                </p>
                <div className="row row-start">
                  <button className="btn btn-line" aria-expanded={open === p.member} onClick={() => setOpen(open === p.member ? null : p.member)}>
                    {open === p.member ? "Hide their marks" : "See their marks"}
                  </button>
                  <button
                    className="btn btn-quiet"
                    disabled={!!busy}
                    onClick={() => {
                      if (confirm(`Rub out all ${p.marks} of @${p.handle}'s marks on Wall No. ${wall.no}? This can't be undone.`))
                        void act(p.member, () => moderateWall(wall.no, "erase", [], "everything they drew", p.member));
                    }}
                  >
                    {busy === p.member ? "Rubbing out…" : `Rub out all ${p.marks}`}
                  </button>
                </div>
                {open === p.member && <MemberMarks wall={wall} member={p.member} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---------- schools ----------

const SCHOOL_STATUS = { pending: "Waiting for a check", active: "Open", closed: "Closed" };

/* A teacher registers a school and it waits here. Check that it is a real school and that the
   teacher works there (their email's domain, the school's site) before letting it in. */
function SchoolsAdmin() {
  const [show, setShow] = useState<"" | SchoolRow["status"]>("pending");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const { data, failed, reload } = useLoad(() => schools(show), [show]);
  const decide = async (s: SchoolRow, action: "approve" | "close" | "reopen") => {
    if (action === "close" && !confirm(`Close ${s.name}? Its teachers and pupils can't open their classes until it is reopened. Nothing is deleted.`)) return;
    setBusy(s.id);
    setError("");
    try {
      await decideSchool(s.id, action);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <div className="admin-filters">
        <label className="field">
          <span className="kicker">Show</span>
          <select value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
            <option value="pending">Waiting for a check</option>
            <option value="active">Open</option>
            <option value="closed">Closed</option>
            <option value="">All</option>
          </select>
        </label>
      </div>
      {error && <p className="field-note is-error" role="alert">{error}</p>}
      {!data ? (
        <Wait failed={failed} />
      ) : !data.length ? (
        <p className="empty serif">{show === "pending" ? "No school is waiting. Teachers register one on /teach." : "None here."}</p>
      ) : (
        <ul className="queue-log serif">
          {data.map((s) => (
            <li key={s.id}>
              <b>{s.name}</b>{s.city && `, ${s.city}`} · {SCHOOL_STATUS[s.status]}
              <p>
                Registered {date(s.created)} by {s.by ? <Link to={`/u/${s.by}`}>@{s.by}</Link> : "a deleted account"}
                {s.email && <> (<code>{s.email}</code>)</>}. {s.teachers} {s.teachers === 1 ? "teacher" : "teachers"}, {s.classes} {s.classes === 1 ? "class" : "classes"}, {s.pupils} {s.pupils === 1 ? "pupil" : "pupils"}.
              </p>
              <div className="row">
                {s.status === "pending" && <button className="btn btn-ink" disabled={busy === s.id} onClick={() => decide(s, "approve")}>Let it in</button>}
                {s.status === "closed" ? (
                  <button className="btn btn-quiet" disabled={busy === s.id} onClick={() => decide(s, "reopen")}>Reopen</button>
                ) : (
                  <button className="btn btn-quiet" disabled={busy === s.id} onClick={() => decide(s, "close")}>{s.status === "pending" ? "Turn down" : "Close"}</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const SECTIONS: Record<string, [string, () => React.ReactElement]> = {
  "": ["Overview", Overview],
  members: ["Members", Members],
  claims: ["Claims", Claims],
  invites: ["Invites", Invites],
  pieces: ["Pieces", Pieces],
  feedback: ["Feedback", Feedback],
  errors: ["Errors", Errors],
  wall: ["The wall", WallAdmin],
  schools: ["Schools", SchoolsAdmin],
  log: ["Log", Log],
};

export function Admin() {
  const { tab = "" } = useParams();
  const { ready, profile } = useAccount();
  const section = SECTIONS[tab];
  if (!ACCOUNTS || !section || (ready && profile?.role !== "admin")) return <NotFound />;
  if (!profile)
    return (
      <main id="main" tabIndex={-1} className="wrap queue-page" aria-busy="true">
        <p className="serif page-wait">Opening the admin panel…</p>
      </main>
    );
  const [title, Section] = section;
  return (
    <main id="main" tabIndex={-1} className="wrap queue-page admin-page">
      <AdminTabs />
      <h1>{title}</h1>
      <Section key={tab} />
    </main>
  );
}
