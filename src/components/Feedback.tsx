import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router";
import { ACCOUNTS, useAccount } from "../data/account";
import { deviceLine, type FeedbackKind, sendFeedback } from "../data/beta";
import { CONTACT } from "../data/legal";

/* The feedback box, one for the whole app: anything can open it with openFeedback(). It goes
   to the admin panel with the page it was sent from and the browser and screen size, so a
   problem can be seen the way its sender saw it. Members only; others get the address. */

const KINDS: [FeedbackKind, string, string][] = [
  ["problem", "Something's broken", "Say what you did and what happened."],
  ["idea", "An idea", "A tool, a page, anything Tilo should have."],
  ["other", "Something else", ""],
];

export function FeedbackDialog() {
  const dlg = useRef<HTMLDialogElement>(null);
  const { session, profile } = useAccount();
  const { pathname } = useLocation();
  const [kind, setKind] = useState<FeedbackKind>("problem");
  const [text, setText] = useState("");
  const [state, setState] = useState<"" | "sending" | "sent">("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    const open = () => {
      setState((s) => (s === "sent" ? "" : s));
      setError(null);
      dlg.current?.showModal();
    };
    addEventListener("tilo:feedback", open);
    return () => removeEventListener("tilo:feedback", open);
  }, []);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      await sendFeedback(kind, text);
      setText("");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through. Try again.");
      setState("");
    }
  };
  const close = () => dlg.current!.close();
  const canSend = ACCOUNTS && !!session && !!profile;

  return (
    <dialog ref={dlg} aria-labelledby={`${id}-h`} className="feedback-dialog">
      <form className="small-sheet sheet" onSubmit={send}>
        <h2 id={`${id}-h`}>{state === "sent" ? "Thank you" : "Tell us"}</h2>
        {state === "sent" ? (
          <>
            <p role="status">It's in, and the person who makes Tilo reads every one. If it needs an answer, you'll hear back by email.</p>
            <div className="row">
              <button type="button" className="btn btn-ink" onClick={close}>Done</button>
            </div>
          </>
        ) : !canSend ? (
          <>
            <p>
              {ACCOUNTS ? "Sign in to send feedback from here, or write" : "Write"} to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>: what's broken,
              what's missing, what you like.
            </p>
            <div className="row">
              <button type="button" className="btn btn-quiet" onClick={close}>Close</button>
              {ACCOUNTS && !session && <Link to="/account" className="btn btn-ink" onClick={close}>Sign in</Link>}
              {ACCOUNTS && session && !profile && <Link to="/account" className="btn btn-ink" onClick={close}>Pick your handle</Link>}
            </div>
          </>
        ) : (
          <>
            <p>What's broken, what's missing, what you like. It goes straight to the person who makes Tilo.</p>
            <fieldset className="report-reasons">
              <legend className="kicker">It's about</legend>
              {KINDS.map(([k, name, hint]) => (
                <label key={k} className="check">
                  <input type="radio" name="feedback-kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
                  <span><b>{name}</b>{hint && <span className="field-note"> {hint}</span>}</span>
                </label>
              ))}
            </fieldset>
            <div className="field">
              <label htmlFor={`${id}-text`}>Your message</label>
              <textarea
                id={`${id}-text`}
                rows={5}
                required
                maxLength={2000}
                value={text}
                aria-describedby={`${id}-note`}
                onChange={(e) => setText(e.target.value)}
              />
              <p id={`${id}-note`} className="field-note">
                Sent with the page you're on ({pathname}) and your browser and screen size ({deviceLine()}), as @{profile.handle}.
              </p>
            </div>
            {error && <p className="field-note is-error" role="alert">{error}</p>}
            <div className="row">
              <button type="button" className="btn btn-quiet" onClick={close}>Cancel</button>
              <button className="btn btn-ink" disabled={state === "sending" || !text.trim()}>{state === "sending" ? "Sending…" : "Send"}</button>
            </div>
          </>
        )}
      </form>
    </dialog>
  );
}
