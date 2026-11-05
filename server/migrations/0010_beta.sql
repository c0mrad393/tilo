-- The closed beta (2.8): members hand out invite codes of their own, the feedback box says
-- what it is about and where it was sent from, and error reports from browsers and tilo-api.

-- how many codes each member may hand out (admins make theirs in the admin panel); tilo-api
-- makes and lists them at /api/me/invites
insert into tilo_meta.settings (key, value) values ('invites_per_member', '3');

-- feedback: what kind it is, and the browser and screen it came from, so a problem can be
-- seen the way its sender saw it. Admins and mods tick it off once it is dealt with.
alter table public.feedback
  add column kind text not null default 'other' check (kind in ('problem', 'idea', 'other')),
  add column device text not null default '' check (length(device) <= 160),
  add column done boolean not null default false;
grant insert (kind, device) on public.feedback to authenticated;
grant update (done) on public.feedback to authenticated;
create policy "mods tick feedback off" on public.feedback for update to authenticated
  using (public.is_mod()) with check (public.is_mod());

-- twenty messages a day from one member is plenty for real feedback
create function public.feedback_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.feedback where member = new.member and created > now() - interval '1 day') >= 20 then
    raise exception 'That''s a lot of feedback for one day. If there''s more, write to hello@tiloart.com.' using hint = 'limit';
  end if;
  return new;
end
$$;
create trigger feedback_limit before insert on public.feedback
  for each row execute function public.feedback_limit();
revoke execute on function public.feedback_limit() from public, anon, authenticated;

-- What broke: one row per distinct fault, with how often it happened. Nothing about who it
-- happened to: no account, no IP address, only the page's path, the error, Tilo's version
-- and the browser's name. tilo-api writes them (POST /api/errors, and its own faults) and the
-- admin panel reads them through tilo-api, so no role gets the table directly. Faults not
-- seen for 30 days are pruned.
create table public.errors (
  sig text primary key,
  source text not null check (source in ('app', 'api')),
  message text not null check (length(message) <= 500),
  stack text not null default '' check (length(stack) <= 4000),
  page text not null default '' check (length(page) <= 200),
  version text not null default '' check (length(version) <= 40),
  browser text not null default '' check (length(browser) <= 160),
  count int not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
alter table public.errors enable row level security;
create index errors_last_seen on public.errors (last_seen desc);
grant select, insert, update, delete on public.errors to tilo_api;
-- new tables are granted to the API roles by default; this one is for tilo-api alone
revoke all on public.errors from public, anon, authenticated;
