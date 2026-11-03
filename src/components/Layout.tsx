import { useEffect } from "react";
import { NavLink, Outlet, ScrollRestoration, useLocation } from "react-router";
import { Logo } from "./Logo";

/* Sheets marked .settle drop onto the mat the first time they scroll into view. */
function useSettle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-settled");
          io.unobserve(e.target);
        }
      }),
      { rootMargin: "0px 0px -8% 0px" },
    );
    const scan = () => document.querySelectorAll(".settle:not(.is-settled)").forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.getElementById("root")!, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [pathname]);
}

export function Layout() {
  useSettle();
  const { pathname } = useLocation();
  const inStudio = pathname.startsWith("/studio");
  return (
    <>
      {!inStudio && (
        <header className="top wrap">
          <NavLink to="/" viewTransition className="logo" aria-label="Tilo home">
            <Logo />
            <span className="logo-tag hand">made by hand</span>
          </NavLink>
          <nav className="nav" aria-label="Main">
            <NavLink to="/" end viewTransition className="opt">Home</NavLink>
            <NavLink to="/gallery" viewTransition>Gallery</NavLink>
            <a href="/#workbenches" className="opt">Workbenches</a>
            <NavLink to="/studio" viewTransition className="btn btn-mat">Open studio</NavLink>
          </nav>
        </header>
      )}
      <Outlet />
      {!inStudio && (
        <footer className="foot wrap">
          <span>Drawing, the wall, the gallery and stamps are free, and they stay free.</span>
          <span className="foot-support">Support Tilo: opens with the beta</span>
          <span className="mono">TILO 0.2 · STAGE 0 OF 6 · 1 SQUARE = 1 CM</span>
        </footer>
      )}
      <ScrollRestoration />
    </>
  );
}
