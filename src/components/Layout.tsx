import { useEffect } from "react";
import { NavLink, Outlet, ScrollRestoration, useLocation, useNavigation } from "react-router";
import { ACCOUNTS, handleHint, useAccount } from "../data/account";
import { PROMPT } from "../data/samples";
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
              {ACCOUNTS && <AccountLink />}
              <NavLink to="/studio" viewTransition className="btn btn-ink"><span className="nav-long">Open the studio</span><span className="nav-short">Studio</span></NavLink>
            </nav>
          </div>
          <p className="mast-line serif">
            <span className="kicker">No. {PROMPT.no}</span>
            <span className="opt">{today}</span>
            <span>Today's subject: <a href="/#today">{PROMPT.title}</a></span>
            <span className="mast-free opt">Drawn by hand, free to show</span>
          </p>
        </header>
      )}
      <Outlet />
      {!inStudio && (
        <footer className="wrap">
          <div className="colophon">
            <section>
              <h2 className="kicker">Colophon</h2>
              <p className="serif">Tilo is set in Archivo and Newsreader and printed on your screen in two inks, blue and fluorescent pink. Every picture on it was drawn by a person, stroke by stroke.</p>
            </section>
            <section>
              <h2 className="kicker">Free, for good</h2>
              <p className="serif">Drawing, the wall, the gallery and stamps are free and stay free. Ways to support Tilo open with the beta.</p>
            </section>
            <section>
              <h2 className="kicker">This edition</h2>
              <p className="serif">
                {ACCOUNTS
                  ? `Version ${__APP_VERSION__}, closed beta. Your sheets live on this device until you publish them; the sample pieces and artists are still samples.`
                  : `Version ${__APP_VERSION__}, before accounts open. Your sheets and pins live on this device; the other pieces and artists are samples.`}
              </p>
            </section>
          </div>
        </footer>
      )}
      <ScrollRestoration />
    </>
  );
}
