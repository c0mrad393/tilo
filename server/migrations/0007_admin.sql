-- The admin panel. Admins list members with their email addresses and invites, change roles
-- and settings, and make invite codes, all through tilo-api, which reads what Auth keeps.

-- what the members list shows of each account, and nothing else that Auth keeps; Auth owns
-- its schema, so tilo_api reads through this function rather than a grant
create function public.account_facts()
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select id, email::text, created_at, last_sign_in_at from auth.users
$$;
revoke execute on function public.account_facts() from public, anon, authenticated;
grant execute on function public.account_facts() to tilo_api;

-- settings an admin may change (for now: whether signing up needs an invite)
grant usage on schema tilo_meta to tilo_api;
grant select, update (value) on tilo_meta.settings to tilo_api;

-- who an invite was made for, so a code handed out can be traced
alter table public.invites add column note text not null default '' check (length(note) <= 120);

-- admin actions go into the same log as the mods'
alter table public.mod_log drop constraint mod_log_action_check;
alter table public.mod_log add constraint mod_log_action_check
  check (action in ('approve', 'hide', 'remove', 'dismiss', 'suspend', 'unsuspend', 'role', 'invite', 'uninvite', 'setting'));
