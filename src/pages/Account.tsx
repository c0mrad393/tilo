import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import {
  ACCOUNTS,
  arrivalError,
  auth,
  claimHandle,
  deleteAccount,
  exportData,
  handleProblem,
  type Profile,
  providers,
  saveProfile,
  sendLink,
  signInWithGoogle,
  signOut,
  useAccount,
} from "../data/account";
import { forgetInvite, inviteLink, keepInvite, makeInvite, type MyInvites, myInvites, takeBackInvite } from "../data/beta";
import { MIN_AGE, TERMS_VERSION } from "../data/legal";
import { useLocal } from "../data/local";
import { publishPin } from "../data/pieces";
import { drawnCount, fmtMin } from "../engine/stroke";

/* /account: signing in, picking a handle, and the settings of your account, depending on
   where you are. Sign-in links from email land here too. */
export function Account() {
  const { ready, session, profile } = useAccount();
  const [farewell, setFarewell] = useState(false);

  useEffect(() => {
    if (ACCOUNTS) void auth();
  }, []);

  if (!ACCOUNTS)
    return (
      <Page title="Accounts" lede="Accounts open with the beta. Until then your sheets and pins live on this device, and nothing needs signing in.">
        <p className="serif">
          <Link to="/library" viewTransition>Your sheets</Link> are where they always were.
        </p>
      </Page>
    );
  if (!ready) return <Page title="Your account" lede="Opening your account…" busy />;
  if (!session) return <SignIn farewell={farewell} />;
  if (!profile) return <PickHandle email={session.user.email ?? ""} />;
  return <Settings profile={profile} email={session.user.email ?? ""} onDeleted={() => setFarewell(true)} />;
}

function Page({ title, lede, busy, children }: { title: string; lede: string; busy?: boolean; children?: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="wrap account-page" aria-busy={busy || undefined}>
      <header className="page-head">
        <h1>{title}</h1>
        <p className="serif">{lede}</p>
      </header>
      {children}
    </main>
  );
}

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Try again.");

// ---- signed out ----

function SignIn({ farewell }: { farewell: boolean }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(arrivalError);
  const [google, setGoogle] = useState(false);
  // arriving from an invite link: the code waits on this device for the handle step
  const [invite] = useState(keepInvite);
  const id = useId();

  useEffect(() => {
    providers().then((p) => setGoogle(p.google), () => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendLink(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  if (sentTo)
    return (
      <Page title="Check your email" lede={`We sent a sign-in link to ${sentTo}. It works once, for an hour, on any device.`}>
        <div className="account-col">
          <p className="serif">Nothing there after a minute or two? Look in spam, or ask again.</p>
          <div className="row row-start">
            <button className="btn btn-line" onClick={() => setSentTo(null)}>Use another address</button>
          </div>
        </div>
      </Page>
    );

  return (
    <Page title="Sign in" lede="Tilo signs you in with a link sent to your email, so there's no password to remember. New here? The same link makes your account.">
      <div className="account-col">
        {farewell && <p className="notice serif" role="status">Your account is deleted, and everything that was in it. Your sheets on this device are still here.</p>}
        {invite && !farewell && (
          <p className="notice serif" role="status">
            You've been invited. Sign in with your email to make your account; your code, <code>{invite}</code>, is filled in for you on this device.
          </p>
        )}
        {error && <p className="notice notice-error serif" role="alert">{error}</p>}
        <form className="account-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor={`${id}-email`}>Email</label>
            <input id={`${id}-email`} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="row row-start">
            <button className="btn btn-ink" disabled={busy}>{busy ? "Sending…" : "Email me a link"}</button>
          </div>
        </form>
        {google && (
          <div className="account-or">
            <p className="kicker">Or</p>
            <button className="btn btn-line" onClick={() => signInWithGoogle().catch((err) => setError(message(err)))}>Continue with Google</button>
          </div>
        )}
        <p className="field-note serif">Signing in only matters for publishing, stamping and following. Drawing never needs an account.</p>
      </div>
    </Page>
  );
}

// ---- signed in, no handle yet ----

const HANDLE_RULE = "3 to 20 lowercase letters, digits or underscores";

function useHandleCheck(handle: string, current?: string) {
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!handle || handle === current) {
      setProblem(null);
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
      setProblem(`Use ${HANDLE_RULE}.`);
      return;
    }
    setChecking(true);
    const t = setTimeout(() => {
      handleProblem(handle)
        .then(setProblem, () => setProblem(null))
        .finally(() => setChecking(false));
    }, 300);
    return () => clearTimeout(t);
  }, [handle, current]);
  return { problem, checking };
}

function PickHandle({ email }: { email: string }) {
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [invite, setInvite] = useState(keepInvite);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const { problem, checking } = useHandleCheck(handle);
  const id = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await claimHandle(handle, name, invite, agreed ? TERMS_VERSION : "");
      forgetInvite();
    } catch (err) {
      setError({ text: message(err), field: (err as { hint?: string }).hint });
    } finally {
      setBusy(false);
    }
  };
  // a refusal tied to a field goes away once that field is changed
  const edited = (field: string) => error?.field === field && setError(null);
  const handleError = problem ?? (error?.field === "handle" ? error.text : null);
  const inviteError = error?.field === "invite" ? error.text : null;
  const agreedError = error?.field === "agreed" ? error.text : null;

  return (
    <Page title="Pick your handle" lede="Your handle is the name on your pieces and the address of your page. You can change it later.">
      <form className="account-col account-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor={`${id}-handle`}>Handle</label>
          <div className="handle-input">
            <span aria-hidden="true">@</span>
            <input
              id={`${id}-handle`}
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={20}
              value={handle}
              aria-invalid={!!handleError}
              aria-describedby={`${id}-handle-note`}
              onChange={(e) => {
                setHandle(e.target.value.toLowerCase());
                edited("handle");
              }}
            />
          </div>
          <p id={`${id}-handle-note`} className={`field-note serif${handleError ? " is-error" : ""}`} aria-live="polite">
            {handleError ?? (checking ? "Checking…" : handle && !problem ? `Your page will be tiloart.com/u/${handle}` : `${HANDLE_RULE[0].toUpperCase()}${HANDLE_RULE.slice(1)}.`)}
          </p>
        </div>
        <div className="field">
          <label htmlFor={`${id}-name`}>Name <span className="field-optional">optional</span></label>
          <input id={`${id}-name`} autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-invite`}>Invite code</label>
          <input
            id={`${id}-invite`}
            required
            autoCapitalize="characters"
            spellCheck={false}
            value={invite}
            aria-invalid={!!inviteError}
            aria-describedby={`${id}-invite-note`}
            onChange={(e) => {
              setInvite(e.target.value.toUpperCase());
              edited("invite");
            }}
          />
          <p id={`${id}-invite-note`} className={`field-note serif${inviteError ? " is-error" : ""}`}>
            {inviteError ?? "Tilo is in a closed beta. A member or the team gives you a code."}
          </p>
        </div>
        <div className="account-agree-row">
          <label className="check account-agree">
            <input
              type="checkbox"
              required
              checked={agreed}
              aria-invalid={!!agreedError}
              aria-describedby={agreedError ? `${id}-agreed-note` : undefined}
              onChange={(e) => {
                setAgreed(e.target.checked);
                edited("agreed");
              }}
            />
            <span>
              I'm {MIN_AGE} or older, and I agree to the <Link to="/terms" target="_blank">terms of use</Link>. The{" "}
              <Link to="/privacy" target="_blank">privacy policy</Link> says what Tilo keeps about me.
            </span>
          </label>
          {agreedError && <p id={`${id}-agreed-note`} className="field-note serif is-error" role="alert">{agreedError}</p>}
        </div>
        {error && !error.field && <p className="notice notice-error serif" role="alert">{error.text}</p>}
        <div className="row row-start">
          <button className="btn btn-ink" disabled={busy || !!problem || checking || !agreed}>{busy ? "Joining…" : "Join Tilo"}</button>
          <button type="button" className="btn btn-quiet" onClick={() => signOut()}>Not {email}? Sign out</button>
        </div>
      </form>
    </Page>
  );
}

// ---- signed in ----

function Settings({ profile, email, onDeleted }: { profile: Profile; email: string; onDeleted: () => void }) {
  const [form, setForm] = useState({ handle: profile.handle, name: profile.name, bio: profile.bio });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean; field?: string } | null>(null);
  const { problem, checking } = useHandleCheck(form.handle, profile.handle);
  const dirty = form.handle !== profile.handle || form.name !== profile.name || form.bio !== profile.bio;
  const id = useId();

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const patch: Partial<typeof form> = {};
      (Object.keys(form) as (keyof typeof form)[]).forEach((k) => form[k] !== profile[k] && (patch[k] = form[k]));
      const saved = await saveProfile(patch);
      setForm({ handle: saved.handle, name: saved.name, bio: saved.bio });
      setStatus({ text: "Saved." });
    } catch (err) {
      setStatus({ text: message(err), error: true, field: (err as { hint?: string }).hint });
    } finally {
      setSaving(false);
    }
  };
  // "Saved." or a refusal describes the form as it was; editing it again clears that
  const edit = (patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setStatus(null);
  };
  const handleError = problem ?? (status?.field === "handle" ? status.text : null);
  // an invite link opened by someone who already has an account has nothing left to do
  useEffect(forgetInvite, []);

  return (
    <Page title="Your account" lede={`Signed in as ${email}.`}>
      <div className="account-col">
        <section className="account-section" aria-labelledby={`${id}-p`}>
          <div className="account-section-head">
            <h2 id={`${id}-p`} className="kicker">Profile</h2>
            <Link to={`/u/${profile.handle}`} viewTransition>See your page</Link>
          </div>
          <form className="account-form" onSubmit={save}>
            <div className="field">
              <label htmlFor={`${id}-handle`}>Handle</label>
              <div className="handle-input">
                <span aria-hidden="true">@</span>
                <input
                  id={`${id}-handle`}
                  required
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={20}
                  value={form.handle}
                  aria-invalid={!!handleError}
                  aria-describedby={`${id}-handle-note`}
                  onChange={(e) => edit({ handle: e.target.value.toLowerCase() })}
                />
              </div>
              <p id={`${id}-handle-note`} className={`field-note serif${handleError ? " is-error" : ""}`} aria-live="polite">
                {handleError ?? (checking ? "Checking…" : form.handle !== profile.handle ? "Links to your old handle stop working." : `tiloart.com/u/${profile.handle}`)}
              </p>
            </div>
            <div className="field">
              <label htmlFor={`${id}-name`}>Name</label>
              <input id={`${id}-name`} autoComplete="name" maxLength={60} value={form.name} onChange={(e) => edit({ name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-bio`}>About you</label>
              <textarea id={`${id}-bio`} rows={4} maxLength={280} value={form.bio} onChange={(e) => edit({ bio: e.target.value })} />
              <p className="field-note serif">{280 - form.bio.length} characters left</p>
            </div>
            <div className="row row-start">
              <button className="btn btn-ink" disabled={!dirty || saving || !!problem || checking}>{saving ? "Saving…" : "Save"}</button>
              <p className={`field-note serif${status?.error ? " is-error" : ""}`} role="status">{status && !status.field ? status.text : ""}</p>
            </div>
          </form>
        </section>

        <PinsSection />
        <InvitesSection />

        <section className="account-section" aria-labelledby={`${id}-s`}>
          <h2 id={`${id}-s`} className="kicker">Signing in</h2>
          <p className="serif">Signing out everywhere ends your sessions on every device, a lost phone included. Each one needs a new link to get back in.</p>
          <div className="row row-start">
            <button className="btn btn-line" onClick={() => signOut()}>Sign out</button>
            <button className="btn btn-quiet" onClick={() => signOut(true)}>Sign out everywhere</button>
          </div>
        </section>

        <ExportSection />
        <DeleteSection handle={profile.handle} onDeleted={onDeleted} />
      </div>
    </Page>
  );
}

/* pieces pinned on this device before there was an account: offered for publishing, one by
   one or all at once; each leaves this list once it is up */
function PinsSection() {
  const { mine } = useLocal();
  const [done, setDone] = useState<{ id: string; title: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  if (!mine.length && !done.length) return null;
  const send = async (ids: string[]) => {
    setError(null);
    for (const pin of ids) {
      const p = mine.find((q) => q.id === pin);
      if (!p) continue;
      setBusy(pin);
      try {
        const published = await publishPin(p);
        setDone((d) => [...d, { id: published, title: p.title }]);
      } catch (err) {
        setError(`“${p.title}” didn't go up: ${message(err)}`);
        break;
      }
    }
    setBusy(null);
  };
  return (
    <section className="account-section" aria-labelledby={`${id}-pins`}>
      <div className="account-section-head">
        <h2 id={`${id}-pins`} className="kicker">Pinned on this device</h2>
        {mine.length > 1 && <button className="btn btn-line" disabled={!!busy} onClick={() => send(mine.map((p) => p.id))}>Publish all {mine.length}</button>}
      </div>
      {mine.length > 0 && <p className="serif">You pinned these before you had an account, so only this device has them. Publish them to put them in the gallery under your handle.</p>}
      {error && <p className="notice notice-error serif" role="alert">{error}</p>}
      <ul className="pin-list">
        {mine.map((p) => (
          <li key={p.id}>
            <span>
              <b>{p.title}</b>
              <small className="serif">{fmtMin(p.minutes)} min · {drawnCount(p.strokes).toLocaleString()} stroke{drawnCount(p.strokes) === 1 ? "" : "s"}{p.remixOf ? " · remix" : ""}</small>
            </span>
            <button className="btn btn-ink" disabled={!!busy} onClick={() => send([p.id])}>{busy === p.id ? "Publishing…" : "Publish"}</button>
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <p className="serif" role="status">
          Published: {done.map((d, i) => <span key={d.id}>{i ? ", " : ""}<Link to={`/piece/${d.id}`} viewTransition>{d.title}</Link></span>)}.
        </p>
      )}
    </section>
  );
}

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });

/* the codes a member hands out, made one at a time, each shared as a link */
function InvitesSection() {
  const [data, setData] = useState<MyInvites | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const id = useId();
  const load = () => myInvites().then(setData, () => {});
  useEffect(() => {
    void load();
  }, []);
  if (!data) return null;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  // a phone offers its share sheet; elsewhere the link goes on the clipboard
  const share = async (code: string) => {
    const url = inviteLink(code);
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title: "Join Tilo", text: "An invite to Tilo, a free studio and gallery for drawing by hand.", url }).catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 3000);
    } catch {
      setError(`Couldn't copy. The link is ${url}`);
    }
  };

  const head = (
    <div className="account-section-head">
      <h2 id={`${id}-i`} className="kicker">Invite people</h2>
      {!data.admin && !data.open && data.left > 0 && (
        <button className="btn btn-line" disabled={busy} onClick={() => act(makeInvite)}>{busy ? "Making…" : "Make a code"}</button>
      )}
    </div>
  );
  return (
    <section className="account-section" aria-labelledby={`${id}-i`}>
      {head}
      {data.admin ? (
        <p className="serif">Admins make codes, as many as needed, in the <Link to="/admin/invites">admin panel</Link>.</p>
      ) : data.open ? (
        <p className="serif">Tilo is open just now, so nobody needs a code: send them to tiloart.com.</p>
      ) : (
        <p className="serif">
          Tilo is in a closed beta. You can hand out {data.per} code{data.per === 1 ? "" : "s"}, one for each person; each works once.
          {data.codes.length > 0 && (data.left ? ` ${data.left} left.` : " You've handed out all of yours.")} Make one when you have someone in mind.
        </p>
      )}
      {error && <p className="notice notice-error serif" role="alert">{error}</p>}
      {data.codes.length > 0 && (
        <ul className="pin-list invite-list">
          {data.codes.map((i) => (
            <li key={i.code}>
              <span>
                <code>{i.code}</code>
                <small className="serif">{i.used_at ? `Used${i.used_by ? ` by @${i.used_by}` : ""} on ${day.format(new Date(i.used_at))}` : "Not used yet"}</small>
              </span>
              {!i.used_at && (
                <div className="row">
                  <button className="btn btn-line" onClick={() => share(i.code)}>{copied === i.code ? "Link copied" : "Copy link"}</button>
                  <button className="btn btn-quiet" disabled={busy} onClick={() => act(() => takeBackInvite(i.code))} aria-label={`Take back ${i.code}`}>Take back</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only" role="status">{copied ? "Invite link copied" : ""}</p>
    </section>
  );
}

function ExportSection() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const { blob, name } = await exportData();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="account-section" aria-labelledby={`${id}-e`}>
      <h2 id={`${id}-e`} className="kicker">Your data</h2>
      <p className="serif">One file with everything Tilo keeps about you: your profile, pieces, stamps, follows and reports. Sheets on this device aren't in it; they never leave it unless you publish them.</p>
      {error && <p className="notice notice-error serif" role="alert">{error}</p>}
      <div className="row row-start">
        <button className="btn btn-line" onClick={download} disabled={busy}>{busy ? "Gathering…" : "Download my data"}</button>
      </div>
    </section>
  );
}

function DeleteSection({ handle, onDeleted }: { handle: string; onDeleted: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      onDeleted();
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };
  return (
    <section className="account-section" aria-labelledby={`${id}-d`}>
      <h2 id={`${id}-d`} className="kicker">Delete your account</h2>
      <p className="serif">Your profile, published pieces, stamps and follows go for good, straight away. Sheets on this device stay.</p>
      <div className="row row-start">
        <button className="btn btn-line btn-danger" onClick={() => { setTyped(""); dlg.current!.showModal(); }}>Delete my account</button>
      </div>
      <dialog ref={dlg} aria-labelledby={`${id}-dh`}>
        <div className="small-sheet sheet">
          <h2 id={`${id}-dh`}>Delete @{handle}?</h2>
          <p>This can't be undone. To confirm, type your handle.</p>
          <div className="field">
            <label htmlFor={`${id}-confirm`}>Handle</label>
            <input id={`${id}-confirm`} autoCapitalize="none" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
          {error && <p className="field-note is-error" role="alert">{error}</p>}
          <div className="row">
            <button className="btn btn-quiet" onClick={() => dlg.current!.close()}>Keep it</button>
            <button className="btn btn-ink" disabled={typed.trim().toLowerCase() !== handle || busy} onClick={remove}>{busy ? "Deleting…" : "Delete for good"}</button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
