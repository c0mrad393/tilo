import { randomBytes } from "node:crypto";

// no 0/O or 1/I, so a code read aloud or off paper comes through
const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A fresh invite code, TILO-XXXX-XXXX. */
export const newCode = () => {
  const b = randomBytes(8);
  const part = (o: number) => Array.from({ length: 4 }, (_, i) => ABC[b[o + i] % ABC.length]).join("");
  return `TILO-${part(0)}-${part(4)}`;
};
