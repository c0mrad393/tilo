import type { GoTrueClient, Session } from "@supabase/auth-js";
import { useSyncExternalStore } from "react";

/* Accounts, from Stage 2. They are on when the build carries the server's public key
   (VITE_TILO_ANON_KEY): on this computer once server/scripts/setup-env.mjs has run, on
   tiloart.com when the beta opens. Without it Tilo stays a studio on your device and none
   of this loads. The sign-in library (about 25 KB) is fetched after the page has shown.

   Sign-in links use Auth's implicit flow: the session comes back in the link's #fragment,
   so a link asked for on a laptop still works when it is opened on a phone. */

const KEY = import.meta.env.VITE_TILO_ANON_KEY as string | undefined;
export const ACCOUNTS = !!KEY;

export interface Profile {
  id: string;
  handle: string;
  name: string;
  bio: string;
  avatar_piece: string | null;
  role: "member" | "mod" | "admin";
  created: string;
}

export interface ProfilePage extends Profile {
  followers: number;
  following: number;
  pieces: number;
  /** whether the person asking follows them */
  followed: boolean;
}

interface State {
  /** false until the first session check is done */
  ready: boolean;
  session: Session | null;
  /** null when signed out, or signed in without a handle yet */
  profile: Profile | null;
}

let state: State = { ready: !ACCOUNTS, session: null, profile: null };
const subs = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};
export const useAccount = () => useSyncExternalStore(subscribe, () => state);

// the handle, kept on the device so the masthead can show it before the library loads
const HINT = "tilo.me";
export const handleHint = () => {
  try {
    return localStorage.getItem(HINT);
  } catch {
    return null;
  }
};
const writeHint = (handle: string | null) => {
  try {
    if (handle) localStorage.setItem(HINT, handle);
    else localStorage.removeItem(HINT);
  } catch {}
};

let client: Promise<GoTrueClient> | null = null;
/** The sign-in client, loaded on first use. */
export function auth() {
  client ??= import("@supabase/auth-js").then(({ GoTrueClient }) => {
    const c = new GoTrueClient({
      url: "/auth/v1",
      headers: { apikey: KEY! },
      storageKey: "tilo.auth",
      flowType: "implicit",
      detectSessionInUrl: true,
      autoRefreshToken: true,
      persistSession: true,
    });
    // the library asks that nothing awaits it from inside this callback, hence the timeout
    c.onAuthStateChange((_event, session) => void setTimeout(() => adopt(session)));
    return c;
  });
  return client;
}

/** Starts the session check after the page has shown (it is idempotent). */
export function startAccounts() {
  if (!ACCOUNTS) return;
  const go = () => void auth();
  if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 2000 });
  else setTimeout(go, 300);
}

async function adopt(session: Session | null) {
  // the library empties the link's #fragment but leaves the "#" itself in the address
  if (location.href.endsWith("#")) history.replaceState(history.state, "", location.pathname + location.search);
  if (!session) {
    set({ ready: true, session: null, profile: null });
    writeHint(null);
    return;
  }
  let profile = state.session?.user.id === session.user.id ? state.profile : null;
  try {
    const rows = await call<Profile[]>(`/rest/v1/profiles?id=eq.${session.user.id}&select=*`, {}, session.access_token);
    profile = rows[0] ?? null;
  } catch {
    // offline or the server is down: keep what we knew
  }
  set({ ready: true, session, profile });
  writeHint(profile?.handle ?? null);
}

/** What the server said when it refused, with PostgREST's hint ("handle", "invite") when it gave one. */
export class ServerError extends Error {
  status: number;
  hint?: string;
  constructor(message: string, status: number, hint?: string) {
    super(message);
    this.status = status;
    this.hint = hint;
  }
}

/** A request to Tilo's server, signed in when there is a session. Throws ServerError when refused. */
export async function request(path: string, init: RequestInit & { json?: unknown } = {}, token?: string) {
  token ??= (await (await auth()).getSession()).data.session?.access_token;
  const headers = new Headers(init.headers);
  headers.set("apikey", KEY!);
  headers.set("authorization", `Bearer ${token ?? KEY}`);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  const res = await fetch(path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  if (!res.ok) {
    const b = await res.json().catch(() => null);
    throw new ServerError(b?.message ?? b?.error ?? b?.msg ?? `The server answered ${res.status}.`, res.status, b?.hint ?? b?.field ?? undefined);
  }
  return res;
}
export const call = async <T>(path: string, init: RequestInit & { json?: unknown } = {}, token?: string) => {
  const res = await request(path, init, token);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
};
const rpc = <T>(fn: string, args: Record<string, unknown>) => call<T>(`/rest/v1/rpc/${fn}`, { method: "POST", json: args });

// ---- signing in and out ----

const back = () => `${location.origin}/account`;

/** Why a sign-in link didn't work, read once from the address Auth sent the person back to
    (before the library tidies the address away). */
export const arrivalError = (() => {
  if (!ACCOUNTS || typeof location === "undefined") return null;
  const params = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  const code = params.get("error_code");
  if (!params.get("error") && !code) return null;
  if (code === "otp_expired") return "That sign-in link has expired or was already used. Ask for a new one below.";
  return params.get("error_description")?.replace(/\+/g, " ") ?? "Signing in didn't work. Try again below.";
})();

export async function sendLink(email: string) {
  const { error } = await (await auth()).signInWithOtp({ email, options: { emailRedirectTo: back(), shouldCreateUser: true } });
  if (error) throw error;
}

export async function signInWithGoogle() {
  const { error } = await (await auth()).signInWithOAuth({ provider: "google", options: { redirectTo: back() } });
  if (error) throw error;
}

/** Which ways in Auth offers besides email. */
export async function providers() {
  const res = await fetch("/auth/v1/settings", { headers: { apikey: KEY! } });
  const s = await res.json();
  return { google: !!s?.external?.google };
}

export async function signOut(everywhere = false) {
  await (await auth()).signOut({ scope: everywhere ? "global" : "local" });
  await adopt(null);
}

// ---- the profile ----

/** Null when the handle can be used; otherwise what's wrong with it. */
export const handleProblem = (handle: string) => rpc<string | null>("handle_problem", { handle });

/** agreed: the terms version the member agreed to, along with being old enough */
export async function claimHandle(handle: string, name: string, invite: string, agreed: string) {
  const profile = await rpc<Profile>("claim_handle", { handle, name, invite, agreed });
  set({ profile });
  writeHint(profile.handle);
  return profile;
}

export async function saveProfile(patch: Partial<Pick<Profile, "handle" | "name" | "bio">>) {
  const [profile] = await call<Profile[]>(`/rest/v1/profiles?id=eq.${state.profile!.id}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    json: patch,
  });
  set({ profile });
  writeHint(profile.handle);
  return profile;
}

export const profilePage = (handle: string) => rpc<ProfilePage | null>("profile_page", { handle });

export async function setFollow(followee: string, on: boolean) {
  if (on) await call("/rest/v1/follows", { method: "POST", json: { followee } });
  else await call(`/rest/v1/follows?followee=eq.${followee}&follower=eq.${state.session!.user.id}`, { method: "DELETE" });
}

// ---- your data ----

/** Everything Tilo keeps about you, as a JSON file to save. */
export async function exportData() {
  const res = await request("/api/me/export");
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "tilo-export.json";
  return { blob: await res.blob(), name };
}

export async function deleteAccount() {
  await request("/api/me", { method: "DELETE", json: { confirm: true } });
  // the server has dropped the session along with the account; forget it here too
  await (await auth()).signOut({ scope: "local" }).catch(() => {});
  await adopt(null);
}
