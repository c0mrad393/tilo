import { PICTURES, type PictureId } from "../data/school";

/* The twelve pictures a pupil's password is made of: bold, filled and coloured, so a six-year-old
   knows the cat from the bird at a glance. Each has its name, read out by screen readers. */
const ART: Record<PictureId, React.ReactNode> = {
  sun: (
    <>
      <g stroke="#E8891B" strokeWidth="3.4" strokeLinecap="round">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} x1="24" y1="5" x2="24" y2="10" transform={`rotate(${a} 24 24)`} />
        ))}
      </g>
      <circle cx="24" cy="24" r="10" fill="#F6CB2C" stroke="#E8891B" strokeWidth="2.4" />
    </>
  ),
  moon: <path d="M29 6a17 17 0 1 0 13 27A14 14 0 0 1 29 6z" fill="#5B6FD8" stroke="#2E3A8C" strokeWidth="2.4" strokeLinejoin="round" />,
  star: <path d="M24 5l5.6 11.6 12.7 1.7-9.3 8.9 2.3 12.6L24 33.7l-11.3 6.1 2.3-12.6-9.3-8.9 12.7-1.7z" fill="#F6CB2C" stroke="#C98A0A" strokeWidth="2.4" strokeLinejoin="round" />,
  cloud: <path d="M13 37a8 8 0 0 1-.8-16A11 11 0 0 1 33 17.5 9.5 9.5 0 1 1 35.5 37z" fill="#8FD0F5" stroke="#2C7FC0" strokeWidth="2.4" strokeLinejoin="round" />,
  tree: (
    <>
      <rect x="20.5" y="28" width="7" height="14" rx="1.5" fill="#8A5530" stroke="#5A3418" strokeWidth="2" />
      <circle cx="24" cy="19" r="13" fill="#3BAA55" stroke="#1E6E33" strokeWidth="2.4" />
    </>
  ),
  flower: (
    <>
      <path d="M24 30v13 M24 38c-4-1-7-4-8-7 4 0 7 2 8 7z" stroke="#2E9B47" strokeWidth="3" fill="#2E9B47" strokeLinecap="round" />
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={a} cx="24" cy="10.5" r="6" fill="#EF79AE" stroke="#B83F78" strokeWidth="2" transform={`rotate(${a} 24 18)`} />
      ))}
      <circle cx="24" cy="18" r="4.6" fill="#F6CB2C" stroke="#C98A0A" strokeWidth="1.8" />
    </>
  ),
  fish: (
    <>
      <path d="M33 24l10-8v16z" fill="#F2861E" stroke="#A9520A" strokeWidth="2.2" strokeLinejoin="round" />
      <ellipse cx="20" cy="24" rx="15" ry="10" fill="#F2861E" stroke="#A9520A" strokeWidth="2.4" />
      <circle cx="12" cy="21.5" r="2.4" fill="#232323" />
    </>
  ),
  cat: (
    <>
      <path d="M9 21L10 6l9 8 M39 21L38 6l-9 8" fill="#9AA0A8" stroke="#4B5058" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="24" cy="26" r="15" fill="#9AA0A8" stroke="#4B5058" strokeWidth="2.4" />
      <circle cx="18" cy="24" r="2.6" fill="#232323" />
      <circle cx="30" cy="24" r="2.6" fill="#232323" />
      <path d="M22 30h4l-2 2.4z" fill="#EF79AE" stroke="#B83F78" strokeWidth="1.4" strokeLinejoin="round" />
    </>
  ),
  bird: (
    <>
      <path d="M38 19l7 3-7 3z" fill="#F2861E" stroke="#A9520A" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="26" cy="24" r="13" fill="#3E86E0" stroke="#1F4FA0" strokeWidth="2.4" />
      <path d="M12 26c4 7 12 8 17 4-6 0-11-3-14-8z" fill="#8FD0F5" stroke="#1F4FA0" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="31" cy="20" r="2.4" fill="#232323" />
    </>
  ),
  boat: (
    <>
      <path d="M24 6v26" stroke="#5A3418" strokeWidth="2.6" />
      <path d="M26 8l13 20H26z" fill="#FFFFFF" stroke="#2C64D4" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M6 32h36l-6 9H12z" fill="#C0392B" stroke="#7A1E15" strokeWidth="2.4" strokeLinejoin="round" />
    </>
  ),
  house: (
    <>
      <path d="M9 22h30v20H9z" fill="#F6CB2C" stroke="#8A6200" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M5 23L24 7l19 16z" fill="#E0392B" stroke="#7A1E15" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M20 42V31h8v11" fill="#8A5530" stroke="#5A3418" strokeWidth="2" />
    </>
  ),
  apple: (
    <>
      <path d="M24 13c0-4 2-7 5-8" stroke="#5A3418" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <path d="M26 11c3-4 8-5 11-3-2 4-7 5-11 3z" fill="#3BAA55" stroke="#1E6E33" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M24 15c-3-3-14-3-15 8 0 9 6 18 11 18 2 0 3-1 4-1s2 1 4 1c5 0 11-9 11-18-1-11-12-11-15-8z" fill="#E0392B" stroke="#7A1E15" strokeWidth="2.4" strokeLinejoin="round" />
    </>
  ),
};

export const pictureName = (i: number) => PICTURES[i] ?? "?";

export function Picture({ i, size = 48, label = true }: { i: number; size?: number; label?: boolean }) {
  const name = PICTURES[i];
  return (
    <svg className="picture" width={size} height={size} viewBox="0 0 48 48" role={label ? "img" : undefined} aria-label={label ? name : undefined} aria-hidden={label ? undefined : true}>
      {ART[name]}
    </svg>
  );
}
