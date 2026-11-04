-- Remixing across accounts (2.4): the artist decides whether a piece may be remixed

alter table public.pieces add column remixable boolean not null default true;

-- the artist may switch it either way later; tilo-api refuses a remix of a piece that is off
grant update (remixable) on public.pieces to authenticated;
