-- Moderation and proof of hand (2.5). A new piece is held until tilo-api has rendered its
-- recording and checked the frames; then it goes live, or waits for a mod. Only tilo-api
-- changes a piece's status, because the files move with it: a piece that isn't live keeps
-- its files where Caddy doesn't serve them.

-- why a piece that isn't live is out of the gallery:
--   check       tilo-api hasn't finished checking it
--   new-member  the artist's first pieces wait for a mod
--   flagged     the image check wants a person to look (or the check failed)
--   reports     members reported it
--   mod         a mod hid it
--   suspended   its artist's account is suspended
alter table public.pieces
  add column why text check (why in ('check', 'new-member', 'flagged', 'reports', 'mod', 'suspended')),
  -- when tilo-api finished its own check, and the highest scores the image check saw
  add column checked timestamptz,
  add column screen jsonb,
  -- passed proof of hand v1: the recording reads like strokes made by a hand, in time
  add column proof boolean not null default false,
  -- the mod who last let it into the gallery or kept it out
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz;

-- what was here before 2.5 was published straight to the gallery
update public.pieces set checked = created where checked is null;

create index pieces_held on public.pieces (created) where status = 'held';

-- a suspended member can't sign in (Auth bans the account) and their pieces are hidden
alter table public.profiles add column suspended boolean not null default false;

-- reports go through tilo-api now, which can hold a piece and move its files
revoke insert on public.reports from authenticated;
drop policy "you file reports as yourself" on public.reports;
-- and so do closing them, so each one is logged with the action taken
revoke update on public.reports from authenticated;
drop policy "mods close reports" on public.reports;
alter table public.reports
  add column closed_by uuid references public.profiles (id) on delete set null,
  add column closed_at timestamptz;
create index reports_piece on public.reports (piece) where piece is not null;
create index reports_profile on public.reports (profile) where profile is not null;

-- every mod action, so mods can see what the others did
create table public.mod_log (
  id bigint generated always as identity primary key,
  mod uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('approve', 'hide', 'remove', 'dismiss', 'suspend', 'unsuspend')),
  piece text references public.pieces (id) on delete set null,
  profile uuid references public.profiles (id) on delete set null,
  note text not null default '' check (length(note) <= 500),
  created timestamptz not null default now()
);
alter table public.mod_log enable row level security;
grant select on public.mod_log to authenticated;
create policy "mods read the log" on public.mod_log for select to authenticated using (public.is_mod());
grant select, insert on public.mod_log to tilo_api;
grant usage, select on all sequences in schema public to tilo_api;
