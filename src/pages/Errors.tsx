import { useEffect } from "react";
import { isRouteErrorResponse, Link, useLocation, useRouteError } from "react-router";
import { reportError } from "../data/beta";

/* What shows when a page can't be drawn: an address that leads nowhere, a part of Tilo that
   couldn't be fetched (offline, or Tilo was updated while the tab was open), or a fault in
   the page itself. Sheets are saved as you draw, so none of these loses work. */

export function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="wrap error-page">
      <p className="kicker">Error 404</p>
      <h1>Nothing printed here</h1>
      <p className="serif">This address doesn't lead to a page, a piece or a sheet. It may have been mistyped, or the piece was only ever on another device.</p>
      <div className="row">
        <Link to="/" viewTransition className="btn btn-ink">Back to Tilo</Link>
        <Link to="/gallery" viewTransition className="btn btn-line">The gallery</Link>
      </div>
    </main>
  );
}

// a lazily loaded page that couldn't be fetched, in the words each browser uses
const isFetchFailure = (e: unknown) =>
  e instanceof Error && /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch/i.test(e.message);

export function PageError() {
  const error = useRouteError();
  const { pathname } = useLocation();
  // a fault in the page itself is reported; an answer like 404 isn't one, and reportError
  // leaves out pages that couldn't be fetched
  useEffect(() => {
    if (!isRouteErrorResponse(error)) reportError(error);
  }, [error]);
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  const fetchFailed = isFetchFailure(error);
  const inStudio = pathname.startsWith("/studio");
  const detail = error instanceof Error ? error.message : isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : String(error);
  return (
    <main id="main" tabIndex={-1} className="wrap error-page" role="alert">
      <p className="kicker">{fetchFailed ? "Couldn't load" : "Something broke"}</p>
      <h1>{fetchFailed ? "This page didn't arrive" : "The press jammed"}</h1>
      <p className="serif">
        {fetchFailed
          ? navigator.onLine
            ? "Part of Tilo couldn't be fetched, most likely because it was updated while this tab was open. Reloading picks up the new version."
            : "You're offline and this part of Tilo isn't saved on this device yet. Connect again and reload."
          : "This page hit a fault and stopped. Reloading usually clears it."}
        {inStudio && " Your sheet was saved on this device as you drew, so at most the last few seconds are missing."}
      </p>
      <div className="row">
        <button className="btn btn-ink" onClick={() => location.reload()}>Reload</button>
        <Link to={inStudio ? "/library" : "/"} className="btn btn-line" reloadDocument>{inStudio ? "Your sheets" : "Back to Tilo"}</Link>
      </div>
      {!fetchFailed && (
        <details className="error-detail">
          <summary>What went wrong</summary>
          <code>{detail}</code>
        </details>
      )}
    </main>
  );
}
