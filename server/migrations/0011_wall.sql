-- The shared wall (2.9). One wall is up at a time; every few days (src/data/walls.ts,
-- WALL_DAYS) tilo-api closes it, keeps its picture in the archive and puts up the next, with
-- a new subject. Only members draw on it. tilo-api reads and writes all of this; the app
-- goes through /api/wall, so no API role gets these tables directly.

create table public.walls (
  no int primary key,
  -- the subject, a theme id from src/data/walls.ts
  theme text not null,
  started timestamptz not null default now(),
  ends timestamptz not null,
  -- hidden: a closed wall a mod took out of the archive
  status text not null default 'live' check (status in ('live', 'closed', 'hidden')),
  -- goes up whenever marks leave the wall, so open pages draw it again from scratch
  rev int not null default 0,
  -- the latest picture of it (its file under files/wall/), and the last mark it includes
  snapshot text,
  snapshot_upto bigint not null default 0,
  marks int not null default 0,
  artists int not null default 0,
  closed_at timestamptz
);
create unique index walls_one_live on public.walls ((true)) where status = 'live';

-- one stroke each; held when the image check flagged it, removed by a mod
create table public.wall_marks (
  id bigint generated always as identity primary key,
  wall int not null references public.walls (no) on delete cascade,
  member uuid not null references public.profiles (id) on delete cascade,
  stroke jsonb not null,
  status text not null default 'live' check (status in ('live', 'held', 'removed')),
  created timestamptz not null default now()
);
create index wall_marks_wall on public.wall_marks (wall, id);
create index wall_marks_member on public.wall_marks (member, created);

alter table public.walls enable row level security;
alter table public.wall_marks enable row level security;
-- new tables are granted to the API roles by default; these are for tilo-api alone
revoke all on public.walls, public.wall_marks from public, anon, authenticated;
grant select, insert, update, delete on public.walls, public.wall_marks to tilo_api;
grant usage, select on all sequences in schema public to tilo_api;

-- a report can be about the wall
alter table public.reports add column wall int references public.walls (no) on delete cascade;
alter table public.reports drop constraint reports_check;
alter table public.reports add constraint reports_one_target check (num_nonnulls(piece, profile, wall) = 1);
create index reports_wall on public.reports (wall) where wall is not null;

-- what mods do to the wall goes in the log with the others: erase (rub marks out), restore
-- (let held marks back), hide and show (a closed wall, in and out of the archive)
alter table public.mod_log add column wall int references public.walls (no) on delete set null;
alter table public.mod_log drop constraint mod_log_action_check;
alter table public.mod_log add constraint mod_log_action_check
  check (action in ('approve', 'hide', 'remove', 'dismiss', 'suspend', 'unsuspend', 'role', 'invite', 'uninvite', 'setting', 'claim', 'erase', 'restore', 'show'));
