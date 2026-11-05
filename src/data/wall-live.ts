import type { Stroke } from "../engine/stroke";
import { ACCOUNTS, call, request } from "./account";
import type { WallStroke } from "./wall";

/* The shared wall as the server keeps it (server/api/src/wall.ts). Anyone reads it without
   signing in; members draw on it. */

export interface WallMark {
  id: number;
  s: WallStroke;
}
export interface LiveWall {
  no: number;
  theme: string;
  title: string;
  started: string;
  ends: string;
  rev: number;
  /** true: start again from `picture` (or the bare outline) and these marks */
  fresh: boolean;
  /** the wall's latest picture, with every mark up to `after` in it */
  picture: string | null;
  after: number;
  marks: WallMark[];
  count: number;
  artists: number;
}
export interface PastWall {
  no: number;
  theme: string;
  title: string;
  started: string;
  ends: string;
  marks: number;
  artists: number;
  picture: string;
  small?: string;
  people?: { handle: string; marks: number }[];
  prev?: number | null;
  next?: number | null;
}

async function get<T>(path: string) {
  const res = await fetch(path);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `The server answered ${res.status}.`);
  return body as T;
}

/** The live wall; with what the page already has, only what's new. */
export const liveWall = (have?: { no: number; rev: number; after: number }) =>
  get<LiveWall>(have ? `/api/wall?no=${have.no}&rev=${have.rev}&after=${have.after}` : "/api/wall");
export const pastWalls = () => get<PastWall[]>("/api/wall/past");
export const pastWall = (no: number) => get<PastWall>(`/api/wall/past/${no}`);

/** Puts marks on the live wall; gives their ids. */
export const addMarks = (no: number, strokes: Stroke[]) => call<{ no: number; ids: number[] }>("/api/wall/marks", { method: "POST", json: { no, strokes } });

// ---- mods ----

export interface FoundMark extends WallMark {
  handle: string;
  created: string;
}
export interface HeldMark extends FoundMark {
  wall: number;
  member: string;
}
export const marksIn = (no: number, r: { x: number; y: number; w: number; h: number }) =>
  call<FoundMark[]>(`/api/wall/mod/${no}/marks?x=${Math.round(r.x)}&y=${Math.round(r.y)}&w=${Math.round(r.w)}&h=${Math.round(r.h)}`);
export const heldMarks = () => call<HeldMark[]>("/api/wall/mod/held");
export const moderateWall = (no: number, action: "erase" | "restore" | "hide" | "show", ids: number[] = [], note = "") =>
  request(`/api/wall/mod/${no}`, { method: "POST", json: { action, ids, note } });

/** whether the wall can come from the server at all (a build without accounts has none) */
export const WALL_LIVE = ACCOUNTS;

/** "2 days 5 hours", "3 hours", "12 minutes" until a time */
export function timeLeft(to: string | Date, now = Date.now()) {
  const m = Math.max(0, Math.round((new Date(to).getTime() - now) / 60_000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  const n = (v: number, w: string) => `${v} ${w}${v === 1 ? "" : "s"}`;
  if (d) return h ? `${n(d, "day")} ${n(h, "hour")}` : n(d, "day");
  if (h) return n(h, "hour");
  return n(Math.max(1, m), "minute");
}
export const wallDates = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });
