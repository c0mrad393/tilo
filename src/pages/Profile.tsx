import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Avatar } from "../components/Avatar";
import { ACCOUNTS, auth, type ProfilePage, profilePage, setFollow, useAccount } from "../data/account";
import { NotFound } from "./Errors";

const joined = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/* /u/:handle, a member's page: who they are, and (from 2.3) what they have published. */
export function Profile() {
  const { handle = "" } = useParams();
  const { ready, session, profile: mine } = useAccount();
  const [page, setPage] = useState<ProfilePage | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // load once the session is known, so "following" reflects whoever is looking
  useEffect(() => {
    if (!ACCOUNTS) return;
    void auth();
    if (!ready) return;
    let live = true;
    setFailed(false);
    profilePage(handle).then(
      (p) => live && setPage(p),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [handle, ready, session?.user.id]);

  if (!ACCOUNTS || page === null) return <NotFound />;
  if (failed)
    return (
      <main id="main" tabIndex={-1} className="wrap error-page">
        <p className="kicker">Couldn't load</p>
        <h1>This page didn't arrive</h1>
        <p className="serif">Tilo's server didn't answer. Check your connection and reload.</p>
      </main>
    );
  if (!page)
    return (
      <main id="main" tabIndex={-1} className="wrap profile-page" aria-busy="true">
        <p className="serif page-wait">Opening @{handle}…</p>
      </main>
    );

  const isMe = mine?.id === page.id;
  const toggle = async () => {
    setBusy(true);
    const on = !page.followed;
    setPage({ ...page, followed: on, followers: page.followers + (on ? 1 : -1) });
    try {
      await setFollow(page.id, on);
    } catch {
      setPage(page);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" tabIndex={-1} className="wrap profile-page">
      <header className="profile-head">
        <Avatar handle={page.handle} size={132} />
        <div className="profile-who">
          {/* without a name the heading is already the handle, so the line above it doesn't repeat it */}
          <p className="kicker">
            {page.name ? `@${page.handle}` : "Member"}
            {page.role !== "member" && <span className="profile-role"> · {page.role === "admin" ? "Tilo team" : "moderator"}</span>}
          </p>
          <h1>{page.name || `@${page.handle}`}</h1>
          {page.bio && <p className="serif profile-bio">{page.bio}</p>}
          <p className="serif profile-facts">
            {count(page.pieces, "piece")} · {count(page.followers, "follower")} · {page.following.toLocaleString()} following · joined {joined.format(new Date(page.created))}
          </p>
          <div className="row row-start">
            {isMe ? (
              <Link to="/account" viewTransition className="btn btn-line">Edit your profile</Link>
            ) : session && mine ? (
              <button className={`btn ${page.followed ? "btn-line" : "btn-ink"}`} aria-pressed={page.followed} disabled={busy} onClick={toggle}>
                {page.followed ? "Following" : "Follow"}
              </button>
            ) : (
              <Link to="/account" viewTransition className="btn btn-line">{session ? "Pick a handle to follow" : "Sign in to follow"}</Link>
            )}
          </div>
        </div>
      </header>

      <section className="profile-pieces" aria-labelledby="pieces-h">
        <h2 id="pieces-h" className="kicker">Pieces</h2>
        <p className="empty serif">
          {isMe
            ? "Pieces you publish from the studio will show here. Publishing opens later in the beta; until then your sheets wait in "
            : `Nothing published yet. Publishing opens later in the beta.`}
          {isMe && <><Link to="/library" viewTransition>your sheets</Link>.</>}
        </p>
      </section>
    </main>
  );
}
