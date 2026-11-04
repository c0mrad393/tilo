import { call, type Profile, request } from "./account";

/* The admin panel's calls to tilo-api (/api/admin). Admins only; the server checks. */

export interface Stats {
  members: number;
  new_members: number;
  signed_in: number;
  suspended: number;
  live: number;
  waiting: number;
  hidden: number;
  reports: number;
  invites_left: number;
  invites_used: number;
  feedback: number;
  /** pieces published on each of the last 14 days, oldest first */
  days: { day: string; n: number }[];
}

export interface Member {
  id: string;
  handle: string;
  name: string;
  role: Profile["role"];
  suspended: boolean;
  created: string;
  email: string;
  last_sign_in: string | null;
  live: number;
  pieces: number;
  /** open reports about them or their pieces */
  reports: number;
  invite: string | null;
  invited_by: string | null;
}

export interface Invite {
  code: string;
  note: string;
  created: string;
  used_at: string | null;
  made_by: string | null;
  used_by: string | null;
}

export const stats = () => call<Stats>("/api/admin/stats");

export const members = (q: { q?: string; role?: string; page?: number }) =>
  call<{ members: Member[]; more: boolean }>(`/api/admin/members?${new URLSearchParams({ q: q.q ?? "", role: q.role ?? "", page: String(q.page ?? 0) })}`);

export const setRole = (id: string, role: Profile["role"]) => call(`/api/admin/members/${id}`, { method: "POST", json: { role } });

export const invites = (used?: "yes" | "no") => call<{ invites: Invite[] }>(`/api/admin/invites${used ? `?used=${used}` : ""}`).then((r) => r.invites);

export const makeInvites = (count: number, note: string) => call<{ codes: string[] }>("/api/admin/invites", { method: "POST", json: { count, note } }).then((r) => r.codes);

export const withdrawInvite = (code: string) => request(`/api/admin/invites/${code}`, { method: "DELETE" });

export const settings = () => call<Record<string, string>>("/api/admin/settings");

export const setSetting = (key: string, value: string) => call("/api/admin/settings", { method: "PUT", json: { [key]: value } });
