-- Legal (2.6). A member agrees to the terms when they pick a handle; anyone can send a
-- takedown claim; and what Auth keeps about each sign-in is deleted after a while, as the
-- privacy policy says.

-- which version of the terms each member agreed to, and when. Profiles are public, so this
-- has its own table, which only its member (and tilo-api) can read.
insert into tilo_meta.settings (key, value) values ('terms_version', '2026-11-04');

create table public.agreements (
  member uuid primary key references public.profiles (id) on delete cascade,
  terms text not null,
  at timestamptz not null default now()
);
alter table public.agreements enable row level security;
-- Supabase's default privileges grant every new table to anon and authenticated
revoke all on public.agreements from anon, authenticated;
grant select on public.agreements to authenticated;
create policy "you see what you agreed to" on public.agreements for select to authenticated using (member = auth.uid());
grant select, insert, update, delete on public.agreements to tilo_api;

-- the handle can only be claimed by someone who says they are old enough and agree
drop function public.claim_handle(text, text, text);
create function public.claim_handle(handle text, name text default '', invite text default '', agreed text default '')
returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  problem text;
  made public.profiles;
  terms text := (select value from tilo_meta.settings where key = 'terms_version');
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles where id = me) then
    raise exception 'You already have a handle.' using hint = 'handle';
  end if;
  if claim_handle.agreed is distinct from terms then
    raise exception 'Confirm your age and that you agree to the terms.' using hint = 'agreed';
  end if;
  problem := public.handle_problem(claim_handle.handle);
  if problem is not null then
    raise exception '%', problem using hint = 'handle';
  end if;
  if (select value from tilo_meta.settings where key = 'invites_required') = 'true' then
    -- used_at, not used_by: used_by empties when its account is deleted, and the code
    -- must not come back to life with it
    update public.invites set used_by = me, used_at = now()
      where code = upper(btrim(coalesce(claim_handle.invite, ''))) and used_at is null;
    if not found then
      raise exception 'That invite code doesn''t work. It may be mistyped or already used.' using hint = 'invite';
    end if;
  end if;
  insert into public.profiles (id, handle, name)
    values (me, claim_handle.handle, left(btrim(coalesce(claim_handle.name, '')), 60))
    returning * into made;
  insert into public.agreements (member, terms) values (me, terms);
  return made;
end
$$;
revoke execute on function public.claim_handle(text, text, text, text) from public, anon;
grant execute on function public.claim_handle(text, text, text, text) to authenticated;

-- the terms version the app asks people to agree to
create function public.terms_version() returns text
language sql stable security definer set search_path = ''
as $$ select value from tilo_meta.settings where key = 'terms_version' $$;
grant execute on function public.terms_version() to anon, authenticated;

-- takedown claims: copyright, abuse or privacy, from anyone, signed in or not. They hold the
-- claimant's name and address, so only tilo-api reads them, for admins.
create table public.claims (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('copyright', 'abuse', 'privacy', 'other')),
  url text not null check (length(url) between 1 and 500),
  piece text references public.pieces (id) on delete set null,
  profile uuid references public.profiles (id) on delete set null,
  name text not null check (length(name) between 1 and 120),
  email text not null check (length(email) between 3 and 254),
  details text not null check (length(details) between 1 and 4000),
  -- for copyright: they own the work or act for whoever does, in good faith
  sworn boolean not null default false,
  member uuid references public.profiles (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  outcome text not null default '' check (length(outcome) <= 500),
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  created timestamptz not null default now()
);
create index claims_open on public.claims (created) where status = 'open';
alter table public.claims enable row level security;
revoke all on public.claims from anon, authenticated;
grant select, insert, update, delete on public.claims to tilo_api;
grant usage, select on all sequences in schema public to tilo_api;

alter table public.mod_log add column claim bigint references public.claims (id) on delete set null;
alter table public.mod_log drop constraint mod_log_action_check;
alter table public.mod_log add constraint mod_log_action_check
  check (action in ('approve', 'hide', 'remove', 'dismiss', 'suspend', 'unsuspend', 'role', 'invite', 'uninvite', 'setting', 'claim'));

-- Auth writes a line with the IP address for every sign-in, and keeps each session's IP and
-- browser; tilo-api calls this once a day so neither stays longer than the policy says
create function public.prune_sign_ins() returns table (log int, sessions int)
language sql volatile security definer set search_path = ''
as $$
  with log as (delete from auth.audit_log_entries where created_at < now() - interval '30 days' returning 1),
       gone as (delete from auth.sessions where coalesce(refreshed_at, updated_at, created_at) < now() - interval '90 days' returning 1)
  select (select count(*)::int from log), (select count(*)::int from gone)
$$;
revoke execute on function public.prune_sign_ins() from public, anon, authenticated;
grant execute on function public.prune_sign_ins() to tilo_api;
