import { useId, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { joinWaitlist, type WaitSource } from "../data/beta";

/* The waiting list's form: an email address, and what they draw if they want to say. An admin
   sends codes from the admin panel; the code arrives by email with a link that fills it in. */
export function WaitlistForm({ source, email: given = "", onOpen }: { source: WaitSource; email?: string; onOpen?: () => void }) {
  const [email, setEmail] = useState(given);
  const [note, setNote] = useState("");
  // only bots see and fill this one
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const id = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await joinWaitlist({ email: email.trim(), note: note.trim(), source, website });
      setDone(email.trim());
    } catch (err) {
      const x = err as Error & { field?: string; open?: boolean };
      if (x.open) onOpen?.();
      setError({ text: x.message || "That didn't go. Try again.", field: x.field });
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <div className="waitlist-done" role="status">
        <p className="kicker">You're on the list</p>
        <p className="serif">
          When there's a place, your invite code goes to <b>{done}</b>, with a link that fills it in. Until then, nothing stops you drawing: your
          sheets stay on this device, ready to publish once you're in.
        </p>
        <div className="row row-start">
          <Link to="/studio" viewTransition className="btn btn-ink">Start a blank sheet</Link>
        </div>
      </div>
    );

  const emailError = error?.field === "email" ? error.text : null;
  return (
    <form className="account-form waitlist-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-email`}>Email</label>
        <input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          required
          value={email}
          aria-invalid={!!emailError}
          aria-describedby={emailError ? `${id}-email-note` : undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error?.field === "email") setError(null);
          }}
        />
        {emailError && <p id={`${id}-email-note`} className="field-note serif is-error" role="alert">{emailError}</p>}
      </div>
      <div className="field">
        <label htmlFor={`${id}-note`}>What do you draw? <span className="field-optional">optional</span></label>
        <input id={`${id}-note`} maxLength={300} placeholder="Ink sketches of Tbilisi, pixel art, comics…" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="waitlist-trap" aria-hidden="true">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
      {error && !error.field && <p className="notice notice-error serif" role="alert">{error.text}</p>}
      <div className="row row-start">
        <button className="btn btn-ink" disabled={busy}>{busy ? "Adding you…" : "Put me on the list"}</button>
      </div>
      <p className="field-note serif">
        Tilo keeps your address only to send the code, and deletes it 90 days after. The <Link to="/privacy#waitlist">privacy policy</Link> has the rest.
      </p>
    </form>
  );
}
