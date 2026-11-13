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
  /** people on the waiting list who haven't been sent a code */
  waiting_list: number;
  /** items in the mods' queue, each counted once (held pieces, reported things, held wall marks) */
  queue: number;
  /** schools waiting for an admin to let them in */
  schools_pending: number;
  /** mods and admins */
  staff: number;
  /** members with at least one piece */
  artists: number;
  /** marks on the wall and stamps given in the last 7 days */
  wall_marks: number;
  stamps: number;
  /** pieces published (n) and members joined on each of the last 14 days, oldest first */
  days: { day: string; n: number; joined: number }[];
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

export type MemberShow = "" | "suspended" | "active" | "new" | "reported";
export type MemberSort = "" | "old" | "active" | "pieces";
export const members = (q: { q?: string; role?: string; show?: MemberShow; sort?: MemberSort; page?: number }) =>
  call<{ members: Member[]; more: boolean }>(
    `/api/admin/members?${new URLSearchParams({ q: q.q ?? "", role: q.role ?? "", show: q.show ?? "", sort: q.sort ?? "", page: String(q.page ?? 0) })}`,
  );

/** everything the member page shows about one member (GET /api/admin/members/:id) */
export interface MemberDetail {
  id: string;
  handle: string;
  name: string;
  bio: string;
  role: Profile["role"];
  suspended: boolean;
  created: string;
  account: {
    email: string;
    created_at: string;
    last_sign_in_at: string | null;
    confirmed_at: string | null;
    providers: string[];
    banned_until: string | null;
    sessions: number;
  } | null;
  counts: {
    pieces: number;
    live: number;
    held: number;
    hidden: number;
    stamps_got: number;
    stamps_given: number;
    followers: number;
    following: number;
    wall_marks: number;
    reports_filed: number;
    feedback: number;
  };
  agreed: { terms: string; at: string } | null;
  invite: { code: string; note: string; used_at: string; made_by: string | null } | null;
  invited: { code: string; used_at: string | null; used_by: string | null }[];
  pieces: { id: string; title: string; status: string; why: string | null; ai: boolean; created: string; stamps: number }[];
  reports: { id: number; reason: string; note: string; status: string; created: string; piece: string | null; title: string | null; reporter: string | null }[];
  history: { id: number; action: string; note: string; piece: string | null; wall: number | null; created: string; mod: string | null }[];
  notes: { id: number; text: string; created: string; author: string | null }[];
  schools: { id: string; name: string; status: string; lead: boolean }[];
}
export const memberDetail = (id: string) => call<MemberDetail>(`/api/admin/members/${id}`);
/** deletes the account for good; the handle is typed again to confirm */
export const deleteMember = (id: string, handle: string, reason: string) =>
  call<{ pieces: number }>(`/api/admin/members/${id}`, { method: "DELETE", json: { handle, reason } });
export const signOutMember = (id: string) => call<{ sessions: number }>(`/api/admin/members/${id}/signout`, { method: "POST" });
export const addNote = (id: string, text: string) => call(`/api/admin/members/${id}/notes`, { method: "POST", json: { text } });
export const deleteNote = (id: string, note: number) => request(`/api/admin/members/${id}/notes/${note}`, { method: "DELETE" });

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

/** someone on the waiting list (/join); invite is the code they were sent */
export interface WaitRow {
  id: number;
  email: string;
  note: string;
  source: string;
  created: string;
  invite: string | null;
  invited_at: string | null;
  /** when and by whom their code was used: they're in */
  used_at: string | null;
  used_by: string | null;
}
export const waitlist = (show: "waiting" | "sent" | "all") => call<{ waitlist: WaitRow[] }>(`/api/admin/waitlist?show=${show}`).then((r) => r.waitlist);
/** emails each of them a code; one already sent an unused code gets it again */
export const inviteFromWaitlist = (ids: number[]) =>
  call<{ sent: number; failed: string[]; fault: string }>("/api/admin/waitlist/invite", { method: "POST", json: { ids } });
export const dropFromWaitlist = (id: number) => request(`/api/admin/waitlist/${id}`, { method: "DELETE" });
