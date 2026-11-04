-- Publishing (2.3): what the gallery sorts by, and what a published piece needs to say

-- the studio's clock runs in seconds, so a piece's time is kept to the second
alter table public.pieces alter column minutes type real;

-- the picture is WebP where the browser can make one, JPEG where it can't (Safari)
alter table public.pieces add column picture text not null default 'webp' check (picture in ('webp', 'jpg'));

-- every stamp on the piece, kept by the same trigger as the counts by kind
alter table public.pieces add column stamp_total integer not null default 0;

create or replace function public.count_stamps() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  p text := case when tg_op = 'DELETE' then old.piece else new.piece end;
begin
  update public.pieces set
    stamps = coalesce(
      (select jsonb_object_agg(kind, n) from (select kind, count(*) as n from public.stamps where piece = p group by kind) k),
      '{}'::jsonb),
    stamp_total = (select count(*) from public.stamps where piece = p)
  where id = p;
  return null;
end
$$;
revoke execute on function public.count_stamps() from public, anon, authenticated;

create index pieces_stamped on public.pieces (stamp_total desc, created desc) where status = 'live';
create index pieces_subject on public.pieces (subject, created desc) where status = 'live' and subject is not null;
