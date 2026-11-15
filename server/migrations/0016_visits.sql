-- Visits, counted without tracking anyone: how many people came each day, which pages they
-- opened, where they came from (another site, or a link's utm_source) and from which country.
-- Only daily totals are kept. No cookie, nothing in the browser, no IP address stored.
-- Telling one visitor from another within a day uses a hash of the address and browser with
-- a random salt made for that day; at the day's end the salt and the hashes are deleted, so
-- the next day's hashes can't be linked to them, or to anyone. tilo-api (visits.ts) writes,
-- and the admin panel reads through it. Days are counted in Tbilisi time.

create table public.visit_days (
  day date primary key,
  -- pages opened
  views int not null default 0,
  -- different people (as far as the day's hashes can tell)
  visitors int not null default 0,
  -- arrivals from outside the site: a tab opening Tilo
  visits int not null default 0,
  -- visitors on a phone or tablet
  mobile int not null default 0
);

-- the breakdowns: page (a kind of page, never one person's: /piece, /u), source (the site a
-- visit came from, or its utm_source), country (two letters, from Cloudflare)
create table public.visit_counts (
  day date not null,
  kind text not null check (kind in ('page', 'source', 'country')),
  key text not null check (length(key) between 1 and 60),
  n int not null default 0,
  primary key (day, kind, key)
);

-- today's salt and today's visitor hashes; both are emptied when the day changes
create table public.visit_salt (
  day date primary key,
  salt bytea not null
);
create table public.visit_seen (
  hash bytea primary key
);

alter table public.visit_days enable row level security;
alter table public.visit_counts enable row level security;
alter table public.visit_salt enable row level security;
alter table public.visit_seen enable row level security;
revoke all on public.visit_days, public.visit_counts, public.visit_salt, public.visit_seen from public, anon, authenticated;
grant select, insert, update, delete on public.visit_days, public.visit_counts, public.visit_salt, public.visit_seen to tilo_api;

-- when an invite link was first opened, so the admin panel can see where people stop:
-- the email went, the link was opened, they signed in, they picked a handle
alter table public.invites add column opened_at timestamptz;

-- whether someone has signed in at all, by address: the waiting list's invites are matched
-- to accounts this way before a handle exists (Auth keeps the addresses)
create function public.signed_in_emails(emails text[])
returns table (email text, last_sign_in_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select lower(u.email::text), u.last_sign_in_at from auth.users u
  where lower(u.email::text) = any (select lower(e) from unnest(emails) e)
$$;
revoke execute on function public.signed_in_emails(text[]) from public, anon, authenticated;
grant execute on function public.signed_in_emails(text[]) to tilo_api;
