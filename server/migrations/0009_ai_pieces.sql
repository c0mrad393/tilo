-- Pieces drawn by an AI (2.8). The samples on the tilo account were drawn by Claude, in code,
-- stroke by stroke, and the site says so on every one of them. Only the seed sets this: no
-- member grant covers the column, and tilo-api never writes it.
alter table public.pieces add column ai boolean not null default false;
