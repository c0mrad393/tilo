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
  /** feedback not ticked off yet */
  feedback: number;
  /** distinct faults seen in the last 7 days, and how often they happened */
  errors: number;
  error_count: number;
  /** open takedown claims */
  claims: number;
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

export interface Claim {
  id: number;
  kind: "copyright" | "abuse" | "privacy" | "other";
  url: string;
  piece: string | null;
  title: string | null;
  piece_status: string | null;
  /** the handle of the artist or profile it's about */
  about: string | null;
  name: string;
  email: string;
  details: string;
  sworn: boolean;
  /** the member who sent it, when they were signed in */
  sent_by: string | null;
  status: "open" | "closed";
  outcome: string;
  created: string;
  closed_at: string | null;
  closed_by: string | null;
}

export const claims = (status: "open" | "closed") => call<{ claims: Claim[] }>(`/api/admin/claims${status === "closed" ? "?status=closed" : ""}`).then((r) => r.claims);

export const closeClaim = (id: number, outcome: string) => call(`/api/admin/claims/${id}`, { method: "POST", json: { outcome } });

export const stats = () => call<Stats>("/api/admin/stats");

export const members = (q: { q?: string; role?: string; page?: number }) =>
  call<{ members: Member[]; more: boolean }>(`/api/admin/members?${new URLSearchParams({ q: q.q ?? "", role: q.role ?? "", page: String(q.page ?? 0) })}`);

export const setRole = (id: string, role: Profile["role"]) => call(`/api/admin/members/${id}`, { method: "POST", json: { role } });

export const invites = (used?: "yes" | "no") => call<{ invites: Invite[] }>(`/api/admin/invites${used ? `?used=${used}` : ""}`).then((r) => r.invites);

export const makeInvites = (count: number, note: string) => call<{ codes: string[] }>("/api/admin/invites", { method: "POST", json: { count, note } }).then((r) => r.codes);

export const withdrawInvite = (code: string) => request(`/api/admin/invites/${code}`, { method: "DELETE" });

export const settings = () => call<Record<string, string>>("/api/admin/settings");

export const setSetting = (key: string, value: string) => call("/api/admin/settings", { method: "PUT", json: { [key]: value } });

/** one distinct fault, from browsers ("app") or tilo-api ("api"), with how often it happened */
export interface ErrorReport {
  sig: string;
  source: "app" | "api";
  message: string;
  stack: string;
  page: string;
  version: string;
  browser: string;
  count: number;
  first_seen: string;
  last_seen: string;
}
export const errorReports = () => call<{ errors: ErrorReport[] }>("/api/admin/errors").then((r) => r.errors);
export const fixedError = (sig: string) => request(`/api/admin/errors/${sig}`, { method: "DELETE" });

/** a school on Tilo for schools; a new one waits for an admin (docs/SCHOOLS.md) */
export interface SchoolRow {
  id: string;
  name: string;
  city: string;
  status: "pending" | "active" | "closed";
  created: string;
  decided_at: string | null;
  /** the handle and email of the teacher who registered it */
  by: string | null;
  email: string | null;
  teachers: number;
  classes: number;
  pupils: number;
}
export const schools = (status: "" | SchoolRow["status"]) =>
  call<{ schools: SchoolRow[] }>(`/api/admin/schools${status ? `?status=${status}` : ""}`).then((r) => r.schools);
export const decideSchool = (id: string, action: "approve" | "close" | "reopen") => call(`/api/admin/schools/${id}`, { method: "POST", json: { action } });
