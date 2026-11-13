import { useEffect, useState } from "react";
import { Link } from "react-router";
import { WaitlistForm } from "../components/Waitlist";
import { ACCOUNTS } from "../data/account";
import { signupOpen } from "../data/beta";

/* /join: the address for posts and videos. While joining needs an invite code it is the
   waiting list; when sign-up is open it says so and sends people to sign in. */
export function Join() {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    signupOpen().then(setOpen);
  }, []);

  if (!ACCOUNTS || open === true)
    return (
      <main id="main" tabIndex={-1} className="wrap account-page join-page">
        <header className="page-head">
          <p className="kicker">{ACCOUNTS ? "Sign-up is open" : "Before accounts open"}</p>
          <h1>Join Tilo</h1>
          <p className="serif">
            {ACCOUNTS
              ? "No code needed just now. Sign in with your email, pick a handle, and you can publish, stamp and draw on the wall."
              : "Accounts open with the beta. Until then the studio works without one, and your sheets stay on this device."}
          </p>
        </header>
        <div className="account-col">
          <div className="row row-start">
            {ACCOUNTS && <Link to="/account" viewTransition className="btn btn-ink">Sign in to join</Link>}
            <Link to="/studio" viewTransition className="btn btn-line">Start a blank sheet</Link>
          </div>
        </div>
      </main>
    );

  return (
    <main id="main" tabIndex={-1} className="wrap account-page join-page" aria-busy={open === null || undefined}>
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
