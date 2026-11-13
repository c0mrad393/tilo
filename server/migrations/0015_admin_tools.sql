-- More for the admin panel: a page per member, where an admin can delete an account (not
-- only suspend it), sign it out everywhere, and keep notes about it that only admins read.

-- what the member page shows of one account that Auth keeps: how they sign in, whether they
-- confirmed their address, and how many sessions are open
create function public.account_detail(uid uuid)
returns table (email text, created_at timestamptz, last_sign_in_at timestamptz, confirmed_at timestamptz, providers text[], banned_until timestamptz, sessions int)
language sql stable security definer set search_path = ''
as $$
  select u.email::text, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
    coalesce(array(select jsonb_array_elements_text(u.raw_app_meta_data -> 'providers')), '{}'),
    u.banned_until,
    (select count(*)::int from auth.sessions s where s.user_id = u.id)
  from auth.users u where u.id = uid
$$;
revoke execute on function public.account_detail(uuid) from public, anon, authenticated;
grant execute on function public.account_detail(uuid) to tilo_api;

-- signs an account out everywhere: its sessions go, and with them every refresh token, so no
-- device can get a new access token; one already handed out lasts until it expires (JWT_EXPIRY)
create function public.end_sessions(uid uuid)
returns int
language sql volatile security definer set search_path = ''
as $$
  with gone as (delete from auth.sessions where user_id = uid returning 1)
  select count(*)::int from gone
$$;
revoke execute on function public.end_sessions(uuid) from public, anon, authenticated;
grant execute on function public.end_sessions(uuid) to tilo_api;

-- notes about a member, for admins only (a warning given, a talk had, why a role changed);
-- they go with the account when it is deleted. Only tilo-api reads and writes them.
create table public.member_notes (
  id bigint generated always as identity primary key,
  member uuid not null references public.profiles (id) on delete cascade,
  author uuid references public.profiles (id) on delete set null,
  text text not null check (length(text) between 1 and 1000),
  created timestamptz not null default now()
);
create index member_notes_member on public.member_notes (member, created desc);
grant select, insert, delete on public.member_notes to tilo_api;
grant usage, select on all sequences in schema public to tilo_api;

alter table public.mod_log drop constraint mod_log_action_check;
alter table public.mod_log add constraint mod_log_action_check
  check (action in ('approve', 'hide', 'remove', 'dismiss', 'suspend', 'unsuspend', 'role', 'invite', 'uninvite', 'setting', 'claim', 'erase', 'restore', 'show', 'school', 'waitlist', 'delete', 'signout'));
