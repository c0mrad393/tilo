-- Accounts (2.2). A member exists in auth.users from their first sign-in, but only joins
-- Tilo when they pick a handle: claim_handle() makes the profile, and during the closed
-- beta it also uses up an invite code. Handles are checked in one place, handle_problem(),
-- which the app also calls to say what's wrong as someone types.

create table tilo_meta.settings (
  key text primary key,
  value text not null
);
insert into tilo_meta.settings (key, value) values ('invites_required', 'true');

-- null when the handle can be used by the person asking; otherwise what to tell them
create function public.handle_problem(handle text) returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when handle_problem.handle is null or handle_problem.handle !~ '^[a-z0-9_]{3,20}$'
      then 'Use 3 to 20 lowercase letters, digits or underscores.'
    when handle_problem.handle = any (array[
      'about', 'account', 'admin', 'administrator', 'api', 'auth', 'files', 'gallery', 'help',
      'library', 'login', 'logout', 'me', 'mod', 'moderator', 'null', 'official', 'piece',
      'privacy', 'rest', 'root', 'settings', 'signin', 'signup', 'staff', 'studio', 'support',
      'system', 'terms', 'tilo', 'tiloart', 'undefined', 'wall'])
      then 'That handle is kept for Tilo itself.'
    when exists (select 1 from public.profiles p where p.handle = handle_problem.handle and p.id is distinct from auth.uid())
      then 'Someone already has that handle.'
  end
$$;

create function public.claim_handle(handle text, name text default '', invite text default '')
returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  problem text;
  made public.profiles;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles where id = me) then
    raise exception 'You already have a handle.' using hint = 'handle';
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
  return made;
end
$$;

-- a changed handle goes through the same check
create function public.check_handle() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  problem text;
begin
  if new.handle is distinct from old.handle then
    problem := public.handle_problem(new.handle);
    if problem is not null then
      raise exception '%', problem using hint = 'handle';
    end if;
  end if;
  return new;
end
$$;
create trigger profiles_handle before update of handle on public.profiles
  for each row execute function public.check_handle();

-- everything the profile page shows, in one call; null when there's no such handle
create function public.profile_page(handle text) returns json
language sql stable security invoker set search_path = ''
as $$
  select json_build_object(
    'id', p.id, 'handle', p.handle, 'name', p.name, 'bio', p.bio, 'avatar_piece', p.avatar_piece,
    'role', p.role, 'created', p.created,
    'followers', (select count(*) from public.follows f where f.followee = p.id),
    'following', (select count(*) from public.follows f where f.follower = p.id),
    'pieces', (select count(*) from public.pieces x where x.owner = p.id and x.status = 'live'),
    'followed', exists (select 1 from public.follows f where f.followee = p.id and f.follower = auth.uid()))
  from public.profiles p
  where p.handle = lower(profile_page.handle)
$$;

-- Postgres lets everyone run new functions; narrow that. is_mod() stays callable, since the
-- row-level security rules run it as whoever is asking.
revoke execute on function public.handle_problem(text), public.claim_handle(text, text, text),
  public.profile_page(text), public.check_handle(), public.count_stamps() from public, anon, authenticated;
grant execute on function public.handle_problem(text), public.claim_handle(text, text, text) to authenticated;
grant execute on function public.profile_page(text) to anon, authenticated;
