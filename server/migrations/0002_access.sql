-- Who may read and write what. PostgREST runs each request as anon (signed out) or
-- authenticated (signed in), and row-level security decides which rows. Grants are by
-- column where it matters, so nobody can set their own role or a piece's status.
-- Pieces are only ever written by tilo-api (role tilo_api), which checks the recording first.
-- Profiles are created in 2.2 by a function that also redeems the invite code.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter table public.profiles enable row level security;
alter table public.pieces enable row level security;
alter table public.stamps enable row level security;
alter table public.follows enable row level security;
alter table public.reports enable row level security;
alter table public.invites enable row level security;
alter table public.feedback enable row level security;

create function public.is_mod() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('mod', 'admin'))
$$;

-- profiles: public; you edit your own, but not your role
grant select on public.profiles to anon, authenticated;
grant update (handle, name, bio, avatar_piece) on public.profiles to authenticated;
create policy "profiles are public" on public.profiles for select using (true);
create policy "you edit your own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- pieces: live ones are public; you see all of yours, mods see everything; you may retitle
grant select on public.pieces to anon, authenticated;
grant update (title) on public.pieces to authenticated;
create policy "live pieces are public" on public.pieces for select
  using (status = 'live' or owner = auth.uid() or public.is_mod());
create policy "you retitle your own pieces" on public.pieces for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

-- stamps: public; you add and take back your own, on live pieces
grant select on public.stamps to anon, authenticated;
grant insert (piece, kind), delete on public.stamps to authenticated;
create policy "stamps are public" on public.stamps for select using (true);
create policy "you stamp live pieces" on public.stamps for insert to authenticated
  with check (member = auth.uid() and exists (select 1 from public.pieces p where p.id = piece and p.status = 'live'));
create policy "you take back your own stamps" on public.stamps for delete to authenticated
  using (member = auth.uid());

-- follows: public; you follow and unfollow for yourself
grant select on public.follows to anon, authenticated;
grant insert (followee), delete on public.follows to authenticated;
create policy "follows are public" on public.follows for select using (true);
create policy "you follow for yourself" on public.follows for insert to authenticated
  with check (follower = auth.uid());
create policy "you unfollow for yourself" on public.follows for delete to authenticated
  using (follower = auth.uid());

-- reports: anyone signed in files one; only mods read and close them
grant insert (piece, profile, reason, note) on public.reports to authenticated;
grant select, update (status) on public.reports to authenticated;
create policy "you file reports as yourself" on public.reports for insert to authenticated
  with check (reporter = auth.uid());
create policy "mods read reports" on public.reports for select to authenticated using (public.is_mod());
create policy "mods close reports" on public.reports for update to authenticated
  using (public.is_mod()) with check (public.is_mod());

-- invites: no direct access; redeemed through a function in 2.2

-- feedback: anyone signed in writes; mods read
grant insert (page, text) on public.feedback to authenticated;
grant select on public.feedback to authenticated;
create policy "you send feedback as yourself" on public.feedback for insert to authenticated
  with check (member = auth.uid());
create policy "mods read feedback" on public.feedback for select to authenticated using (public.is_mod());

-- stamp counts on pieces, so the gallery never has to count
create function public.count_stamps() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p text := case when tg_op = 'DELETE' then old.piece else new.piece end;
begin
  update public.pieces set stamps = coalesce(
    (select jsonb_object_agg(kind, n) from (select kind, count(*) as n from public.stamps where piece = p group by kind) k),
    '{}'::jsonb)
  where id = p;
  return null;
end
$$;
create trigger stamps_count after insert or delete on public.stamps
  for each row execute function public.count_stamps();

-- tilo-api: everything in public, row-level security skipped (it has bypassrls)
grant usage on schema public to tilo_api;
grant select, insert, update, delete on all tables in schema public to tilo_api;
grant usage, select on all sequences in schema public to tilo_api;
