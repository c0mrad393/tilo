import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigation } from "react-router";
import { ACCOUNTS, call, handleHint, useAccount } from "../data/account";
import { openFeedback } from "../data/beta";
import { PROMPT } from "../data/prompt";
import { FeedbackDialog } from "./Feedback";
import { Logo } from "./Logo";

/* Blocks marked .press go through the press the first time they scroll into view. They are
   hidden only after this hook has marked them, so without it everything simply shows. */
function usePress() {
  const { pathname } = useLocation();
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.replace("is-waiting", "is-in");
        io.unobserve(e.target);
      }),
      { rootMargin: "0px 0px -6% 0px" },
    );
    // includes blocks a previous run marked but no longer watches (StrictMode runs effects twice)
    const scan = () => document.querySelectorAll(".press:not(.is-in)").forEach((el) => {
      el.classList.add("is-waiting");
      io.observe(el);
    });
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.getElementById("root")!, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [pathname]);
}

// signed in: your handle (remembered on the device, so it shows before the session check)
function AccountLink() {
  const { ready, session, profile } = useAccount();
  const handle = profile?.handle ?? (ready ? null : handleHint());
  return (
    <NavLink to={handle ? `/u/${handle}` : "/account"} viewTransition className="nav-account">
      {handle ? `@${handle}` : session ? "Your account" : "Sign in"}
    </NavLink>
  );
}

// for mods: the queue, with how much is waiting, looked up again on each page
function QueueLink() {
  const { profile } = useAccount();
  const { pathname } = useLocation();
  const [n, setN] = useState<number | null>(null);
  const isMod = !!profile && profile.role !== "member";
  useEffect(() => {
    if (!isMod) return;
    // what needs a mod: each held piece, and each other piece or profile with open reports
    Promise.all([
      call<{ id: string }[]>("/rest/v1/pieces?status=eq.held&why=neq.check&select=id&limit=100"),
      call<{ piece: string | null; profile: string | null }[]>("/rest/v1/reports?status=eq.open&select=piece,profile&limit=200"),
      // admins answer takedown claims too
      profile.role === "admin" ? call<{ claims: unknown[] }>("/api/admin/claims").then((r) => r.claims.length) : 0,
    ]).then(([held, reports, claims]) => setN(new Set([...held.map((p) => p.id), ...reports.map((r) => r.piece ?? r.profile)]).size + claims), () => {});
  }, [isMod, profile?.role, pathname]);
  if (!isMod) return null;
  // admins land on the queue too; the admin panel's other tabs sit beside it
  const label = profile.role === "admin" ? "Admin" : "Queue";
  return (
    <NavLink to="/mod" viewTransition className="nav-queue" aria-label={n ? `${label}, ${n} waiting` : label}>
      {label}{n ? <b>{n}</b> : null}
    </NavLink>
  );
}

const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

export function Layout() {
  usePress();
  const { pathname } = useLocation();
  const inStudio = pathname.startsWith("/studio");
  // a page opened for the first time is fetched before it shows; the bar says so
  const loading = useNavigation().state === "loading";
  return (
    <>
      <div className="nav-progress" data-on={loading ? "" : undefined} role="progressbar" aria-label="Opening the page" aria-hidden={!loading} />
      {!inStudio && <a className="skip" href="#main">Skip to the page</a>}
      {!inStudio && (
        <header className="mast wrap">
          <div className="mast-row">
            <NavLink to="/" viewTransition className="logo" aria-label="Tilo home">
              <Logo />
            </NavLink>
            <nav className="nav" aria-label="Main">
              <NavLink to="/gallery" viewTransition>Gallery</NavLink>
              <NavLink to="/library" viewTransition>Your sheets</NavLink>
              <a href="/#wall" className="opt">The wall</a>
              <a href="/#benches" className="opt">Benches</a>
              {ACCOUNTS && <QueueLink />}
              {ACCOUNTS && <AccountLink />}
              <NavLink to="/studio" viewTransition className="btn btn-ink"><span className="nav-long">Open the studio</span><span className="nav-short">Studio</span></NavLink>
            </nav>
          </div>
          <p className="mast-line serif">
            <span className="kicker">No. {PROMPT.no}</span>
            <span className="opt">{today}</span>
            <span>Today's subject: <a href="/#today">{PROMPT.title}</a></span>
            <span className="mast-free opt">Drawn by hand, free to show</span>
            <button type="button" className="link-btn mast-feedback" onClick={openFeedback}>Send feedback</button>
          </p>
        </header>
      )}
      <Outlet />
      {!inStudio && (
        <footer className="wrap">
          <div className="colophon">
            <section>
              <h2 className="kicker">Colophon</h2>
              <p className="serif">Tilo is set in Archivo and Newsreader and printed on your screen in two inks, blue and fluorescent pink. Every picture on it was drawn stroke by stroke: by people, except the samples on @tilo, which Claude, an AI, drew in code and which say so.{ACCOUNTS && <> <Link to="/proof">How proof works</Link></>}</p>
            </section>
            <section>
              <h2 className="kicker">Free, for good</h2>
              <p className="serif">Drawing, the wall, the gallery and stamps are free and stay free. <Link to="/support">Support Tilo</Link></p>
              <p className="serif">Something broken, or missing? <button type="button" className="link-btn" onClick={openFeedback}>Tell us</button></p>
            </section>
            <section>
              <h2 className="kicker">The small print</h2>
              <p className="serif">
                <Link to="/terms">Terms of use</Link> · <Link to="/privacy">Privacy</Link> · <Link to="/takedown">Report work to take down</Link>
              </p>
            </section>
            <section>
              <h2 className="kicker">This edition</h2>
              <p className="serif">
                {ACCOUNTS
                  ? `Version ${__APP_VERSION__}, closed beta. Your sheets live on this device until you publish them; the pieces by @tilo were drawn for the prototype.`
                  : `Version ${__APP_VERSION__}, before accounts open. Your sheets and pins live on this device; the other pieces and artists are samples.`}
              </p>
            </section>
          </div>
        </footer>
      )}
      <FeedbackDialog />
      <ScrollRestoration />
    </>
  );
}
