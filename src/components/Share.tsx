import { useEffect, useRef, useState } from "react";
import { canRecord, recordReplay, type VideoPiece } from "../data/video";
import { Icon } from "./Icon";

/* Sharing a piece: its link (with the preview card crawlers get, server/api/src/preview.ts),
   straight to the usual apps, or the phone's own share sheet; and its replay as a video to post,
   made on this device. */

export interface ShareTarget {
  id: string;
  title: string;
  by: string;
  ai?: boolean;
  /** only published pieces have a page anyone can open */
  published: boolean;
  /** the piece with its strokes, fetched when a video is asked for */
  load: () => Promise<VideoPiece>;
}

const pageUrl = (id: string) => `${location.origin}/piece/${id}`;
const cardUrl = (id: string) => `/api/og/card/${id}.jpg`;
export const shareText = (t: { title: string; by: string; ai?: boolean }) =>
  t.ai ? `“${t.title}”, drawn in code by Claude, an AI, on Tilo. Can you beat it by hand?` : `“${t.title}” by @${t.by} on Tilo. Watch it drawn stroke by stroke.`;
const fileName = (t: { title: string }, ext: string) => `tilo-${(t.title || "piece").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "piece"}.${ext}`;

function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

type Video = { state: "idle" } | { state: "making"; k: number } | { state: "ready"; blob: Blob; ext: string; url: string } | { state: "failed"; why: string };

export function ShareSheet({ target, open, onClose }: { target: ShareTarget; open: boolean; onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const [video, setVideo] = useState<Video>({ state: "idle" });
  const stop = useRef<AbortController | null>(null);
  const url = pageUrl(target.id), text = shareText(target);

  useEffect(() => {
    const d = dlg.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  // closing stops a recording and lets go of the video
  useEffect(() => () => stop.current?.abort(), []);
  useEffect(() => () => void (video.state === "ready" && URL.revokeObjectURL(video.url)), [video]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copy the link", url);
    }
  };
  const native = () => navigator.share({ title: target.title, text, url }).catch(() => {});

  const make = async () => {
    stop.current?.abort();
    const ac = (stop.current = new AbortController());
    setVideo({ state: "making", k: 0 });
    try {
      const piece = await target.load();
      const { blob, ext } = await recordReplay(piece, (k) => setVideo({ state: "making", k }), ac.signal);
      setVideo({ state: "ready", blob, ext, url: URL.createObjectURL(blob) });
    } catch (e) {
      if ((e as Error).name === "AbortError") return setVideo({ state: "idle" });
      setVideo({ state: "failed", why: "The video couldn't be made in this browser. Try Chrome or Safari." });
    }
  };
  const videoFile = video.state === "ready" ? new File([video.blob], fileName(target, video.ext), { type: video.blob.type }) : null;
  const canShareFile = !!videoFile && typeof navigator.canShare === "function" && navigator.canShare({ files: [videoFile] });

  const nets: [string, string][] = target.published
    ? [
        ["X", `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`],
        ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`],
        ["WhatsApp", `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`],
        ["Telegram", `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`],
      ]
    : [];

  return (
    <dialog
      ref={dlg}
      className="share-dialog"
      aria-labelledby={`share-h-${target.id}`}
      onClose={() => {
        stop.current?.abort();
        onClose();
      }}
      onClick={(e) => e.target === dlg.current && dlg.current!.close()}
    >
      <div className="share-sheet sheet">
        <header className="share-head">
          <h2 id={`share-h-${target.id}`}>Share “{target.title}”</h2>
          <button className="icon-btn" onClick={() => dlg.current!.close()} aria-label="Close"><Icon name="x" /></button>
        </header>

        {target.published && (
          <>
            <figure className="share-preview">
              <img src={cardUrl(target.id)} alt={`The preview people see: ${target.title} by @${target.by}`} width={1200} height={630} loading="lazy" />
              <figcaption>
                <span className="kicker">tiloart.com</span>
                <b>{target.ai ? `${target.title} · AI-made sample` : `${target.title} by @${target.by}`}</b>
                <span className="serif">{text}</span>
              </figcaption>
            </figure>
            <div className="share-row">
              {typeof navigator.share === "function" && <button className="btn btn-ink" onClick={native}><Icon name="share" />Share…</button>}
              <button className="btn btn-line" onClick={copy}><Icon name="copy" />{copied ? "Link copied" : "Copy link"}</button>
            </div>
            <div className="share-nets" role="group" aria-label="Share on">
              {nets.map(([name, href]) => (
                <a key={name} className="btn btn-quiet" href={href} target="_blank" rel="noopener noreferrer">{name}</a>
              ))}
              <a className="btn btn-quiet" href={cardUrl(target.id)} download={fileName(target, "jpg")}><Icon name="download" />Picture</a>
            </div>
          </>
        )}

        <section className="share-video" aria-live="polite">
          <p className="kicker">For Reels, TikTok and Stories</p>
          {video.state === "idle" && (
            <>
              <p className="serif">A 9:16 video of the replay, about fifteen seconds, with the title and tiloart.com under it.{target.ai ? " It says the piece was drawn in code by Claude, an AI." : ""}</p>
              {canRecord() ? (
                <button className="btn btn-line" onClick={make}><Icon name="film" />Save as video</button>
              ) : (
                <p className="field-note">This browser can't record video. Try Chrome or Safari.</p>
              )}
            </>
          )}
          {video.state === "making" && (
            <>
              <p className="serif">Recording the replay… keep this tab open.</p>
              <progress max={1} value={video.k} aria-label="Recording the video" />
              <button className="btn btn-quiet" onClick={() => stop.current?.abort()}>Stop</button>
            </>
          )}
          {video.state === "ready" && (
            <>
              <video className="share-clip" src={video.url} controls playsInline muted loop autoPlay />
              <div className="share-row">
                <button className="btn btn-ink" onClick={() => save(video.blob, fileName(target, video.ext))}><Icon name="download" />Download {video.ext.toUpperCase()}</button>
                {canShareFile && (
                  <button className="btn btn-line" onClick={() => navigator.share({ files: [videoFile!], title: target.title, text: target.published ? `${text} ${url}` : text }).catch(() => {})}>
                    <Icon name="share" />Share video
                  </button>
                )}
              </div>
              {video.ext === "webm" && <p className="field-note">This browser makes WebM. If an app won't take it, make the video in Safari or Chrome on a phone.</p>}
            </>
          )}
          {video.state === "failed" && <p className="field-note is-error" role="alert">{video.why}</p>}
          <p className="field-note">Made on this device. Nothing is uploaded.</p>
        </section>
      </div>
    </dialog>
  );
}

/** a button that opens the share sheet */
export function ShareButton({ target, className = "btn btn-line", label = "Share" }: { target: ShareTarget; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={label === "" ? `Share ${target.title}` : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Icon name="share" />
        {label}
      </button>
      {open && <ShareSheet target={target} open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
