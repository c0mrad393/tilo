import { useState } from "react";
import { Link } from "react-router";
import { WaitlistForm } from "../components/Waitlist";
import { ACCOUNTS } from "../data/account";
import { useSignupOpen } from "../data/beta";

/* /join: the address for posts and videos. It says what joining gives you and sends people to
   sign in; while joining needs an invite code (an admin setting) it is the waiting list. */
export function Join() {
  // the open page shows until the server says joining needs a code
  const known = useSignupOpen();
  const [opened, setOpen] = useState(false);
  const open = opened || known !== false;

  if (!ACCOUNTS || open)
    return (
      <main id="main" tabIndex={-1} className="wrap account-page join-page">
        <header className="page-head">
          <p className="kicker">{ACCOUNTS ? "Free, for good" : "Before accounts open"}</p>
          <h1>Join Tilo</h1>
          <p className="serif">
            {ACCOUNTS
              ? "Drawing needs no account. To publish in the gallery, stamp the pieces you love, follow artists and draw on the shared wall, join with your email: there's no password, Tilo emails you a link, and you pick a handle."
              : "Accounts open with the beta. Until then the studio works without one, and your sheets stay on this device."}
          </p>
        </header>
        <div className="account-col">
          {ACCOUNTS && (
            <ol className="join-steps serif">
              <li><b>Type your email</b> and Tilo sends you a link.</li>
              <li><b>Press the link</b> and you're signed in, on any device.</li>
              <li><b>Pick your handle</b>, and your sheets are ready to publish.</li>
            </ol>
          )}
          <div className="row row-start">
            {ACCOUNTS && <Link to="/account" viewTransition className="btn btn-ink">Join with your email</Link>}
            <Link to="/studio" viewTransition className="btn btn-line">Start a blank sheet</Link>
          </div>
        </div>
      </main>
    );

  return (
    <main id="main" tabIndex={-1} className="wrap account-page join-page">
      <header className="page-head">
        <p className="kicker">Closed beta</p>
        <h1>Join Tilo</h1>
        <p className="serif">
          Drawing needs no account: <Link to="/studio" viewTransition>open the studio</Link> and start. To publish in the gallery, stamp and draw
          on the shared wall you need a handle, and while Tilo is in a closed beta a handle needs an invite code. Leave your email and we'll send
          you one.
        </p>
      </header>
      <div className="account-col">
        <ol className="join-steps serif">
          <li><b>Leave your email</b> here.</li>
          <li><b>A code arrives</b> by email when there's a place. We let people in a few at a time.</li>
          <li><b>Press its link</b>, sign in with that address and pick your handle. The code is filled in for you.</li>
        </ol>
        <WaitlistForm source="join" onOpen={() => setOpen(true)} />
        <p className="field-note serif">
          Already have a code? <Link to="/account" viewTransition>Sign in</Link> and type it when Tilo asks.
        </p>
      </div>
    </main>
  );
}
