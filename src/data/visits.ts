import { ACCOUNTS } from "./account";

/* Counting visits for the admin panel (server/api/src/visits.ts): each page opened is one
   small message with the page's path, and, on arriving, the site that sent the visitor here.
   No cookie, nothing that identifies anyone. The tab remembers (sessionStorage) that it has
   arrived, so a reload isn't counted as a new visit. Mods' and admins' devices aren't counted. */

const ARRIVED = "tilo.arrived";
const UNCOUNTED = "tilo.uncounted";

const get = (s: Storage, k: string) => {
  try {
    return s.getItem(k);
  } catch {
    return null;
  }
};
const set = (s: Storage, k: string, v: string) => {
  try {
    s.setItem(k, v);
  } catch {}
};

/** a device a mod or admin uses stops counting, so the team doesn't count itself */
export const dontCountThisDevice = () => set(localStorage, UNCOUNTED, "1");

// the same page twice in a blink is one opening (React runs effects twice while developing)
let last = { path: "", at: 0 };

export function countVisit(path: string) {
  if (!ACCOUNTS || get(localStorage, UNCOUNTED) || /^\/(admin|mod)(\/|$)/.test(path)) return;
  if (last.path === path && Date.now() - last.at < 1000) return;
  last = { path, at: Date.now() };
  const first = !get(sessionStorage, ARRIVED);
  set(sessionStorage, ARRIVED, "1");
  const body: Record<string, unknown> = { path, first };
  const query = new URLSearchParams(location.search);
  if (first) {
    let ref = "";
    try {
      const r = new URL(document.referrer);
      if (r.host !== location.host) ref = r.hostname;
    } catch {}
    body.ref = ref;
    body.utm = query.get("utm_source") ?? undefined;
  }
  // an invite link opened: the admin panel shows how far invited people got
  if (path === "/account" && query.get("invite")) body.invite = query.get("invite");
  fetch("/api/visit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true, credentials: "omit" }).catch(() => {});
}
