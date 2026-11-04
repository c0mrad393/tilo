import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { call, request, useAccount } from "../data/account";
import { moderate, type ModAction, type Published, type Reason, report, type Why } from "../data/pieces";

/* Reporting, and the mods' tools on a piece. Tilo is for everyone, so a report that a piece
   isn't for all ages takes it out of the gallery at once, until a mod looks. */

/** what the artist is told about a piece that isn't in the gallery */
export const WHY_FOR_ARTIST: Record<Why, string> = {
  check: "Tilo is drawing its picture and checking it. This takes a few seconds.",
  "new-member": "A member's first three pieces are looked at by a moderator before they go into the gallery. This one is in the queue.",
  flagged: "Tilo's automatic check wants a moderator to look at this piece before it goes into the gallery. It's in the queue.",
  reports: "Members reported this piece, so it is out of the gallery until a moderator looks.",
  mod: "A moderator took this piece out of the gallery. Only you can see it.",
  suspended: "Your account is suspended, so your pieces are out of the gallery.",
};

/** the same, said short, for the mods */
export const WHY_FOR_MODS: Record<Why, string> = {
  check: "being checked",
  "new-member": "new member",
  flagged: "flagged by the image check",
  reports: "reported",
  mod: "hidden by a mod",
  suspended: "artist suspended",
};

const PIECE_REASONS: [Reason, string, string][] = [
  ["nsfw", "Not for all ages", "Nudity, sex or gore. Tilo is for everyone."],
  ["not-hand-made", "Not drawn by hand", "Traced, generated or pasted in."],
  ["copied", "Copied", "Someone else's work, shown as theirs."],
  ["abuse", "Hateful or abusive", "Aimed at a person or a group."],
  ["spam", "Spam", ""],
  ["other", "Something else", "Say what in the note."],
];
const PROFILE_REASONS = PIECE_REASONS.filter(([r]) => r !== "not-hand-made" && r !== "copied");

/** A picture of a piece. A piece that isn't live has its picture behind the sign-in, so it is
    fetched with the session and shown from memory. */
export function usePicture(piece: Pick<Published, "picture" | "status" | "checked">) {
  const open = piece.status === "live";
  const [url, setUrl] = useState<string | null>(open ? piece.picture : null);
  useEffect(() => {
    if (open) return setUrl(piece.picture);
    if (!piece.checked) return setUrl(null);
    let gone = false;
    let made = "";
    request(piece.picture)
      .then((r) => r.blob())
      .then((b) => {
        made = URL.createObjectURL(b);
        if (gone) URL.revokeObjectURL(made);
        else setUrl(made);
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [piece.picture, open, piece.checked]);
  return url;
}

export function ReportButton({ target, label }: { target: { piece: string } | { profile: string }; label: string }) {
  const { profile } = useAccount();
  const dlg = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<Reason | "">("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"" | "busy" | "sent">("");
  const [error, setError] = useState("");
  if (!profile) return null;
  const reasons = "piece" in target ? PIECE_REASONS : PROFILE_REASONS;
  const open = () => {
    setReason("");
    setNote("");
    setState("");
    setError("");
    dlg.current!.showModal();
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) return setError("Pick a reason.");
    setState("busy");
    setError("");
    try {
      await report(target, reason, note);
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The report didn't go through. Try again.");
      setState("");
    }
  };
  return (
    <>
      <button className="btn btn-quiet" onClick={open}>Report</button>
      <dialog ref={dlg} aria-labelledby="report-h">
        <form className="small-sheet sheet" onSubmit={send}>
          <h2 id="report-h">Report {label}</h2>
          {state === "sent" ? (
            <>
              <p role="status">Thank you. A moderator will look at it{reason === "nsfw" && "piece" in target ? "; until then it is out of the gallery" : ""}.</p>
              <div className="row">
                <button type="button" className="btn btn-ink" onClick={() => dlg.current!.close()}>Done</button>
              </div>
            </>
          ) : (
            <>
              <fieldset className="report-reasons">
                <legend className="kicker">What's wrong</legend>
                {reasons.map(([r, name, hint]) => (
                  <label key={r} className="check">
                    <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
                    <span><b>{name}</b>{hint && <span className="field-note"> {hint}</span>}</span>
                  </label>
                ))}
              </fieldset>
              {"piece" in target && (
                <p className="field-note">
                  Is it your own work, shown by someone else? <Link to={`/takedown?url=${encodeURIComponent(`${location.origin}/piece/${target.piece}`)}#claim`}>Send a copyright claim</Link> instead.
                </p>
              )}
              <label className="field">
                <span className="kicker">Note<span className="field-optional">optional</span></span>
                <textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} />
              </label>
              {error && <p className="field-note is-error" role="alert">{error}</p>}
              <div className="row">
                <button type="button" className="btn btn-quiet" onClick={() => dlg.current!.close()}>Cancel</button>
                <button className="btn btn-ink" disabled={state === "busy"}>{state === "busy" ? "Sending…" : "Send the report"}</button>
              </div>
            </>
          )}
        </form>
      </dialog>
    </>
  );
}

interface Screen {
  explicit?: number;
  sexy?: number;
  frame?: string;
  frames?: number;
  error?: string;
  proof?: string[];
}
const pct = (v = 0) => `${Math.round(v * 100)}%`;
/** what the image check and proof of hand said, for a mod */
export function screenLine(s: Screen | null) {
  // pieces published before the check existed have no scores
  if (!s) return "No image check on record.";
  if (s.error) return `The check failed: ${s.error}.`;
  const seen = s.frames ? `explicit ${pct(s.explicit)}, suggestive ${pct(s.sexy)} at most, over ${s.frames} frames (highest at ${s.frame})` : "";
  const proof = s.proof?.length ? `No badge: ${s.proof.join(", ")}.` : "";
  return [seen && `Image check: ${seen}.`, proof].filter(Boolean).join(" ") || "Checked.";
}

/** Approve, hide or remove, with a note for the log; removing asks first. */
export function ModButtons({ piece, onDone }: { piece: Pick<Published, "id" | "status" | "title">; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirmDlg = useRef<HTMLDialogElement>(null);
  const act = async (action: ModAction) => {
    setBusy(true);
    setError("");
    try {
      await moderate("pieces", piece.id, action);
      confirmDlg.current?.close();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };
  if (piece.status === "removed") return <p className="field-note">Removed.</p>;
  return (
    <div className="mod-buttons">
      {piece.status !== "live" && <button className="btn btn-ink" disabled={busy} onClick={() => act("approve")}>Let it in</button>}
      {piece.status !== "hidden" && <button className="btn btn-line" disabled={busy} onClick={() => act("hide")}>Hide</button>}
      <button className="btn btn-quiet" disabled={busy} onClick={() => confirmDlg.current!.showModal()}>Remove</button>
      {error && <p className="field-note is-error" role="alert">{error}</p>}
      <dialog ref={confirmDlg} aria-labelledby={`rm-${piece.id}`}>
        <div className="small-sheet sheet">
          <h2 id={`rm-${piece.id}`}>Remove “{piece.title}”?</h2>
          <p>Its recording and picture are deleted for good. Hide it instead if the artist should keep it.</p>
          <div className="row">
            <button className="btn btn-quiet" onClick={() => confirmDlg.current!.close()}>Keep it</button>
            <button className="btn btn-ink" disabled={busy} onClick={() => act("remove")}>Remove it</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

/* on a piece's page, for mods: where it is, what the checks said, and the buttons */
export function ModTools({ piece, onDone }: { piece: Published; onDone: () => void }) {
  const [screen, setScreen] = useState<Screen | null>(null);
  const [reports, setReports] = useState(0);
  useEffect(() => {
    call<{ screen: Screen | null }[]>(`/rest/v1/pieces?id=eq.${piece.id}&select=screen`).then((r) => setScreen(r[0]?.screen ?? null), () => {});
    call<unknown[]>(`/rest/v1/reports?piece=eq.${piece.id}&status=eq.open&select=id`).then((r) => setReports(r.length), () => {});
  }, [piece.id, piece.status]);
  return (
    <section className="mod-tools" aria-labelledby="mod-h">
      <h2 id="mod-h" className="kicker">For mods</h2>
      <p className="serif">
        {piece.status === "live" ? "In the gallery." : `${piece.status === "held" ? "Waiting" : piece.status === "hidden" ? "Hidden" : "Removed"}${piece.why ? `: ${WHY_FOR_MODS[piece.why]}` : ""}.`}{" "}
        {screenLine(screen)}
        {reports > 0 && <> {reports} open report{reports > 1 ? "s" : ""}, in the <Link to="/mod">queue</Link>.</>}
      </p>
      <ModButtons piece={piece} onDone={onDone} />
    </section>
  );
}
