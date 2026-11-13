-- The waiting list: while joining needs an invite code, someone without one leaves their
-- email address here, and an admin sends them a code from the admin panel when there is room.
-- The code goes out by email from tilo-api (server/api/src/waitlist.ts), with a link that
-- fills it in. Only tilo-api reads and writes this table (/api/waitlist, /api/admin/waitlist).
-- The privacy policy promises: an address goes 90 days after its code was sent, or after a
-- year if no code was sent, or when its owner asks.

create table public.waitlist (
  id bigint generated always as identity primary key,
  email text not null check (length(email) between 3 and 254),
  -- what they said they draw, if anything; it helps choose who to let in first
  note text not null default '' check (length(note) <= 300),
  -- where the form was: "join", "account", "sign-in"
  source text not null default '' check (length(source) <= 40),
  created timestamptz not null default now(),
  invite text references public.invites (code) on delete set null,
  invited_at timestamptz,
  invited_by uuid references public.profiles (id) on delete set null
);
create unique index waitlist_email on public.waitlist (lower(email));
create index waitlist_waiting on public.waitlist (created) where invited_at is null;

grant select, insert, update, delete on public.waitlist to tilo_api;
grant usage, select on all sequences in schema public to tilo_api;

alter table public.mod_log drop constraint mod_log_action_check;
alter table public.mod_log add constraint mod_log_action_check
  check (action in ('approve', 'hide', 'remove', 'dismiss', 'suspend', 'unsuspend', 'role', 'invite', 'uninvite', 'setting', 'claim', 'erase', 'restore', 'show', 'school', 'waitlist'));
