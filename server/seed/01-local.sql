-- Local data only (SEED=true); safe to rerun. Never used on the server.
insert into public.invites (code) values ('LOCAL-0001'), ('LOCAL-0002'), ('LOCAL-0003')
on conflict do nothing;
