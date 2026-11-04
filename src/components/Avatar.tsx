/* A member's mark until avatars are drawn (2.3 lets you pick one of your pieces): the
   handle's first letter, printed in one of the shop's inks chosen by the handle. */
const INKS = ["#2D4BB3", "#C8146E", "#2F6B5A", "#99520F", "#3B3F8F", "#1B1E1D"];

export function Avatar({ handle, size = 96 }: { handle: string; size?: number }) {
  let h = 0;
  for (const ch of handle) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className="avatar plate" style={{ width: size, height: size, ["--avatar-ink" as string]: INKS[h % INKS.length] }} aria-hidden="true">
      <span style={{ fontSize: size * 0.62 }}>{handle.charAt(0)}</span>
    </span>
  );
}
