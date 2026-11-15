import { useEffect, useState } from "react";
import { ACCOUNTS, call, request } from "./account";

/* The closed beta's own parts: invite codes members hand out, the feedback box, and error
   reports sent on their own when something breaks. */

// ---- the browser, in words a person can read ----

const BROWSERS: [string, RegExp][] = [
  ["Edge", /Edg(?:iOS|A)?\/(\d+)/],
  ["Opera", /OPR\/(\d+)/],
  ["Samsung Internet", /SamsungBrowser\/(\d+)/],
  ["Firefox", /(?:Firefox|FxiOS)\/(\d+)/],
  ["Chrome", /(?:Chrome|CriOS)\/(\d+)/],
  ["Safari", /Version\/(\d+)[\d.]*.*Safari/],
];
const SYSTEMS: [string, RegExp][] = [
  ["iOS", /iPhone|iPod/],
  ["iPadOS", /iPad/],
  ["Android", /Android/],
  ["Windows", /Windows/],
  ["ChromeOS", /CrOS/],
  ["macOS", /Macintosh|Mac OS X/],
  ["Linux", /Linux/],
];

/** "Safari 26 · iPadOS": the browser's name and main version, and the system, nothing finer */
export function browserName() {
  const ua = navigator.userAgent;
  const b = BROWSERS.find(([, re]) => re.test(ua));
  let system = SYSTEMS.find(([, re]) => re.test(ua))?.[0] ?? "";
  // an iPad asks for desktop sites as a Mac; only its touch screen gives it away
  if (system === "macOS" && navigator.maxTouchPoints > 1) system = "iPadOS";
  return [b ? `${b[0]} ${b[1].exec(ua)![1]}` : "", system].filter(Boolean).join(" · ") || "Unknown browser";
}

/** the browser, the window's size and whether it is touched, for feedback about a problem */
export const deviceLine = () =>
  `${browserName()} · ${innerWidth}×${innerHeight}${devicePixelRatio > 1 ? ` @${Math.round(devicePixelRatio * 10) / 10}x` : ""}${matchMedia("(pointer: coarse)").matches ? " · touch" : ""}`;

// ---- invite codes ----

export interface MyInvite {
  code: string;
  created: string;
  used_at: string | null;
  used_by: string | null;
}
export interface MyInvites {
  /** no code is needed to join just now */
  open: boolean;
  /** how many codes each member may hand out */
  per: number;
  admin: boolean;
  left: number;
  codes: MyInvite[];
}
export const myInvites = () => call<MyInvites>("/api/me/invites");
export const makeInvite = () => call<MyInvite>("/api/me/invites", { method: "POST" });
export const takeBackInvite = (code: string) => request(`/api/me/invites/${code}`, { method: "DELETE" });
/** the address that opens Tilo's sign-in with the code filled in */
export const inviteLink = (code: string) => `${location.origin}/account?invite=${code}`;

// an invite link's code, kept on this device until it is used, since the sign-in link that
// follows comes back to /account without it
const KEPT = "tilo.invite";
export function keepInvite() {
  const code = new URLSearchParams(location.search).get("invite")?.trim().toUpperCase();
  try {
    if (code && /^[A-Z0-9-]{6,24}$/.test(code)) localStorage.setItem(KEPT, code);
    return localStorage.getItem(KEPT) ?? "";
  } catch {
    return code ?? "";
  }
}
export const forgetInvite = () => {
  try {
    localStorage.removeItem(KEPT);
  } catch {}
};

// ---- the waiting list ----

/** where a waiting-list form is: the /join page, the handle step or the sign-in page */
export type WaitSource = "join" | "account" | "sign-in";

/** whether joining needs no code just now; null when the server didn't say */
export async function signupOpen(): Promise<boolean | null> {
  if (!ACCOUNTS) return null;
  try {
    const r = await fetch("/api/waitlist");
    return r.ok ? ((await r.json()) as { open: boolean }).open : null;
  } catch {
    return null;
  }
}

// asked once a page load, and shared by everything that words itself by it
let asked: Promise<boolean | null> | null = null;
let known: boolean | null | undefined;
/** whether anyone can join just now (no invite code): true, false, or null until known */
export function useSignupOpen() {
  const [open, setOpen] = useState<boolean | null>(known ?? null);
  useEffect(() => {
    if (known !== undefined) return;
    asked ??= signupOpen();
    let live = true;
    void asked.then((v) => {
      known = v;
      if (live) setOpen(v);
    });
    return () => {
      live = false;
    };
  }, []);
  return open;
}

/** Puts an address on the waiting list; no sign-in needed. `website` is the field only bots fill in. */
export async function joinWaitlist(w: { email: string; note: string; source: WaitSource; website: string }) {
  const r = await fetch("/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(w) });
  if (r.ok) return;
  const b = await r.json().catch(() => null);
  throw Object.assign(new Error(b?.error ?? `The server answered ${r.status}.`), { field: b?.field as string | undefined, open: b?.open === true });
}

// ---- feedback ----

export type FeedbackKind = "problem" | "idea" | "other";
export const sendFeedback = (kind: FeedbackKind, text: string) =>
  request("/rest/v1/feedback", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    json: { kind, text: text.trim(), page: location.pathname.slice(0, 200), device: deviceLine().slice(0, 160) },
  });

/** Anything that wants the feedback box open (a link in the studio, the masthead) says so. */
export const openFeedback = () => dispatchEvent(new Event("tilo:feedback"));

// ---- error reports ----

// faults that aren't Tilo's, or that say nothing that could be fixed
const NOT_OURS = [
  /(?:chrome|moz|safari(?:-web)?)-extension:\/\//,
  /ResizeObserver loop/,
  /^Script error\.?$/,
  // offline, or the server is down: the page says so itself
  /Failed to fetch|Load failed|NetworkError|network error|The network connection was lost/i,
  // a page that was updated while the tab was open; reloading fixes it, and the page says so
  /dynamically imported module|Importing a module script failed|error loading dynamically/i,
  /^AbortError|The (?:user aborted|operation was aborted)/i,
];
const sent = new Set<string>();
/** at most this many reports from one page load, so a fault in a loop can't flood */
let budget = 5;

/** Sends what broke to tilo-api, once per distinct fault per page load. */
export function reportError(e: unknown) {
  if (!ACCOUNTS || budget <= 0) return;
  const err = e instanceof Error ? e : null;
  const message = (err ? (err.name && err.name !== "Error" ? `${err.name}: ${err.message}` : err.message) : typeof e === "string" ? e : safeJson(e)).slice(0, 500);
  const stack = (err?.stack ?? "").slice(0, 4000);
  if (!message || NOT_OURS.some((re) => re.test(message) || re.test(stack))) return;
  // the server's own refusals are answers the page shows, not faults
  if (err && "status" in err && typeof err.status === "number") return;
  const key = `${message}\n${stack.slice(0, 300)}`;
  if (sent.has(key)) return;
  sent.add(key);
  budget--;
  fetch("/api/errors", {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, stack, page: location.pathname, version: __APP_VERSION__, browser: browserName() }),
  }).catch(() => {});
}
function safeJson(v: unknown) {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

/** Reports faults no page caught: thrown in a handler, or a promise nobody waited for. */
export function watchErrors() {
  if (!ACCOUNTS) return;
  addEventListener("error", (ev) => reportError(ev.error ?? ev.message));
  addEventListener("unhandledrejection", (ev) => reportError(ev.reason));
}
