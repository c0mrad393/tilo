import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAccount } from "../data/account";
import { stampCount, toggleStamp, useLocal } from "../data/local";
import { myStamps, type Published, setStamp } from "../data/pieces";
import { STAMPS, STAMP_COLOR } from "../data/prompt";
import type { Piece } from "../engine/stroke";

/* The stamp buttons, on a piece's page and in the feed. */
export function StampRow({ on, count, toggle, disabled }: { on: (k: string) => boolean; count: (k: string) => number; toggle: (k: string) => void; disabled?: boolean }) {
  return (
    <div className="stamp-row">
      {STAMPS.map((k, j) => {
        const n = count(k);
        return (
          <button key={k} className="stamp" aria-pressed={on(k)} disabled={disabled} onClick={() => toggle(k)} style={{ ["--sc" as string]: STAMP_COLOR[k], ["--sr" as string]: `${(j % 3) - 1.5}deg` }}>
            {k}{n ? <b>{n}</b> : null}
          </button>
        );
      })}
    </div>
  );
}

/* stamps on a piece of this device, kept on this device */
export function LocalStamps({ piece }: { piece: Piece }) {
  const local = useLocal();
  return <StampRow on={(k) => !!local.stamps[piece.id]?.[k]} count={(k) => stampCount(piece, k, local)} toggle={(k) => toggleStamp(piece.id, k)} />;
}

/* stamps on a published piece, written to the server and shown before it answers */
export function ServerStamps({ piece, disabled }: { piece: Published; disabled?: boolean }) {
  const { profile } = useAccount();
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState(piece.stamps ?? {});
  useEffect(() => {
    if (profile) myStamps(piece.id, profile.id).then(setMine, () => {});
  }, [piece.id, profile?.id]);
  const toggle = (k: string) => {
    if (!profile) return;
    const on = !mine.has(k);
    const before = { mine, counts };
    const next = new Set(mine);
    if (on) next.add(k);
    else next.delete(k);
    setMine(next);
    setCounts({ ...counts, [k]: Math.max(0, (counts[k] ?? 0) + (on ? 1 : -1)) });
    setStamp(piece.id, k, on, profile.id).catch(() => {
      setMine(before.mine);
      setCounts(before.counts);
    });
  };
  return (
    <>
      <StampRow on={(k) => mine.has(k)} count={(k) => counts[k] ?? 0} toggle={toggle} disabled={!profile || disabled} />
      {!profile && <p className="serif stamp-note"><Link to="/account">Sign in</Link> to stamp it.</p>}
    </>
  );
}

