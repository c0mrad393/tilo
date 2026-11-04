-- Tilo's tables (docs/STAGE2.md, "Data model"). Accounts live in auth.users, which Supabase
-- Auth owns; everything a member makes hangs off their profile. Recordings and pictures are
-- files on disk (/files/rec/{id}.tl, /files/img/{id}.webp), not rows.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  name text not null default '' check (length(name) <= 60),
  bio text not null default '' check (length(bio) <= 280),
  -- the avatar is a small drawing made in the studio, so there are no photos to moderate
  avatar_piece text,
  role text not null default 'member' check (role in ('member', 'mod', 'admin')),
  created timestamptz not null default now()
);

create table public.pieces (
  id text primary key check (id ~ '^[a-z0-9]{6,16}$'),
  owner uuid not null references public.profiles (id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  paper text not null default 'smooth' check (length(paper) <= 20),
  shape text not null default 'land' check (shape in ('land', 'port', 'square')),
  layers jsonb not null default '[]',
  strokes integer not null check (strokes >= 0),
  minutes integer not null default 0 check (minutes >= 0),
  -- recording format version (codec FORMAT) and its size
  format smallint not null,
  bytes integer not null check (bytes > 0),
  -- the day's subject number, when it was drawn to one
  subject integer,
  remix_of text references public.pieces (id) on delete set null,
  status text not null default 'live' check (status in ('live', 'held', 'hidden', 'removed')),
  -- counts by stamp kind, kept by a trigger on stamps
  stamps jsonb not null default '{}',
  created timestamptz not null default now()
);
create index pieces_live on public.pieces (created desc) where status = 'live';
create index pieces_owner on public.pieces (owner, created desc);
create index pieces_remix_of on public.pieces (remix_of) where remix_of is not null;

alter table public.profiles
  add constraint profiles_avatar_piece_fkey foreign key (avatar_piece) references public.pieces (id) on delete set null;

-- the same eight as STAMPS in src/data/samples.ts
create table public.stamps (
  piece text not null references public.pieces (id) on delete cascade,
  member uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('Bold', 'Moody', 'Calm', 'Colour', 'Clean line', 'Patient', 'Funny', 'Remix me')),
  created timestamptz not null default now(),
  primary key (piece, member, kind)
);
create index stamps_member on public.stamps (member);

create table public.follows (
  follower uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  followee uuid not null references public.profiles (id) on delete cascade,
  created timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index follows_followee on public.follows (followee);

-- about a piece or about a profile, never both
create table public.reports (
  id bigint generated always as identity primary key,
  piece text references public.pieces (id) on delete cascade,
  profile uuid references public.profiles (id) on delete cascade,
  reporter uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('not-hand-made', 'nsfw', 'abuse', 'spam', 'copied', 'other')),
  note text not null default '' check (length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created timestamptz not null default now(),
  check (num_nonnulls(piece, profile) = 1)
);
create index reports_open on public.reports (created) where status = 'open';

-- the closed beta's gate: a code is used once, when its new member picks a handle
create table public.invites (
  code text primary key check (code ~ '^[A-Z0-9-]{6,24}$'),
  made_by uuid references public.profiles (id) on delete set null,
  used_by uuid unique references auth.users (id) on delete set null,
  used_at timestamptz,
  created timestamptz not null default now()
);

create table public.feedback (
  id bigint generated always as identity primary key,
  member uuid default auth.uid() references public.profiles (id) on delete set null,
  page text not null default '' check (length(page) <= 200),
  text text not null check (length(text) between 1 and 2000),
  created timestamptz not null default now()
);
