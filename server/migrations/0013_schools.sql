-- Tilo for schools (docs/SCHOOLS.md). A teacher registers a school with their own Tilo
-- account and Tilo's admin approves it; other teachers ask to join with the school's teacher
-- code and a teacher already there approves them. Teachers run classes; pupils sign in with
-- the class code, their name and a picture password, and have no account at all. Their
-- drawings are files under files/school/, which Caddy never serves.
-- Only tilo-api reads and writes these tables (/api/school); no API role gets them.

create table public.schools (
  id text primary key check (id ~ '^[a-z0-9]{6,16}$'),
  name text not null check (length(name) between 2 and 80),
  city text not null default '' check (length(city) <= 60),
  -- pending until Tilo's admin has checked the school is real; closed: nobody draws there
  status text not null default 'pending' check (status in ('pending', 'active', 'closed')),
  -- what another teacher of the school types to ask to join
  code text not null unique,
  -- room for limits or a paid tier later, without moving anything
  plan text not null default 'open',
  created_by uuid references public.profiles (id) on delete set null,
  created timestamptz not null default now(),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz
);

create table public.teachers (
  school text not null references public.schools (id) on delete cascade,
  member uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active')),
  -- the teacher who registered the school
  lead boolean not null default false,
  approved_by uuid references public.profiles (id) on delete set null,
  created timestamptz not null default now(),
  primary key (school, member)
);
create index teachers_member on public.teachers (member);

create table public.classes (
  id text primary key check (id ~ '^[a-z0-9]{6,16}$'),
  school text not null references public.schools (id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  ages text not null check (ages in ('6-8', '9-11', '12-15')),
  -- what pupils type to sign in
  code text not null unique,
  archived boolean not null default false,
  made_by uuid references public.profiles (id) on delete set null,
  created timestamptz not null default now()
);
create index classes_school on public.classes (school);

create table public.pupils (
  id text primary key check (id ~ '^[a-z0-9]{6,16}$'),
  class text not null references public.classes (id) on delete cascade,
  -- as the teacher typed it; a first name and an initial is enough
  name text not null check (length(name) between 1 and 40),
  -- the colour of their name tag
  tag smallint not null default 0 check (tag between 0 and 7),
  -- the picture password, as positions in the list of twelve pictures; the teacher prints
  -- it on the pupil's card, so it is kept as it is
  pictures smallint[] not null check (array_length(pictures, 1) between 3 and 4),
  -- wrong tries since the last right one; five lock signing in for 15 minutes
  tries smallint not null default 0,
  locked_until timestamptz,
  -- goes up with new pictures, which signs the pupil out everywhere
  session int not null default 0,
  created timestamptz not null default now()
);
create index pupils_class on public.pupils (class);

create table public.tasks (
  id text primary key check (id ~ '^[a-z0-9]{6,16}$'),
  class text not null references public.classes (id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  brief text not null default '' check (length(brief) <= 600),
  shape text not null check (shape in ('land', 'port', 'square', 'px16', 'px32', 'px64', 'px128', 'pxland')),
  -- a fixed set of colours, or null for the usual crayon box
  palette jsonb check (palette is null or (jsonb_typeof(palette) = 'array' and jsonb_array_length(palette) between 1 and 16)),
  due date,
  open boolean not null default true,
  created timestamptz not null default now()
);
create index tasks_class on public.tasks (class);

create table public.works (
  id text primary key check (id ~ '^[a-z0-9]{6,16}$'),
  pupil text not null references public.pupils (id) on delete cascade,
  -- null for a pupil's own drawing
  task text references public.tasks (id) on delete set null,
  title text not null check (length(title) between 1 and 60),
  shape text not null check (shape in ('land', 'port', 'square', 'px16', 'px32', 'px64', 'px128', 'pxland')),
  paper text not null default 'smooth' check (length(paper) <= 20),
  layers jsonb not null default '[]',
  strokes int not null default 0 check (strokes >= 0),
  bytes int not null default 0 check (bytes >= 0),
  minutes real not null default 0 check (minutes >= 0),
  status text not null default 'draft' check (status in ('draft', 'handed', 'back', 'reviewed')),
  stamps text[] not null default '{}',
  note text not null default '' check (length(note) <= 400),
  -- in the class gallery
  shown boolean not null default false,
  -- the image check, run on hand-in: waiting, ok, or held (it can't be shown anywhere)
  checked text check (checked in ('waiting', 'ok', 'held')),
  screen jsonb,
  updated timestamptz not null default now(),
  handed timestamptz,
  created timestamptz not null default now()
);
create index works_pupil on public.works (pupil);
create index works_waiting on public.works (handed) where checked = 'waiting';

create table public.shows (
  id text primary key check (id ~ '^[a-z0-9]{6,16}$'),
  class text not null references public.classes (id) on delete cascade,
  title text not null check (length(title) between 1 and 80),
  about text not null default '' check (length(about) <= 400),
  works text[] not null default '{}',
  -- pupils' names under their drawings, as the teacher typed them
  names boolean not null default true,
  -- the show's address, /show/{token}: anyone with it can see the show
  token text not null unique check (token ~ '^[a-z0-9-]{8,48}$'),
  created timestamptz not null default now()
);
create index shows_class on public.shows (class);

alter table public.schools enable row level security;
alter table public.teachers enable row level security;
alter table public.classes enable row level security;
alter table public.pupils enable row level security;
alter table public.tasks enable row level security;
alter table public.works enable row level security;
alter table public.shows enable row level security;
-- new tables are granted to the API roles by default; these are for tilo-api alone
revoke all on public.schools, public.teachers, public.classes, public.pupils, public.tasks, public.works, public.shows from public, anon, authenticated;
grant select, insert, update, delete on public.schools, public.teachers, public.classes, public.pupils, public.tasks, public.works, public.shows to tilo_api;

-- an admin approving or closing a school goes in the log with the rest
alter table public.mod_log add column school text references public.schools (id) on delete set null;
alter table public.mod_log drop constraint mod_log_action_check;
alter table public.mod_log add constraint mod_log_action_check
  check (action in ('approve', 'hide', 'remove', 'dismiss', 'suspend', 'unsuspend', 'role', 'invite', 'uninvite', 'setting', 'claim', 'erase', 'restore', 'show', 'school'));
