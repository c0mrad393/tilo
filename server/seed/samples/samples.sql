-- The tilo account, which holds Tilo's sample pieces, so the gallery isn't empty on day one
-- and remixes of a sample credit it like any piece. Claude (an AI) drew the samples in code,
-- stroke by stroke (src/data/samples.ts), and every one is marked as AI-made. migrate.sh
-- applies this file and pieces.sql once (recorded in tilo_meta.migrations as
-- seed:samples-ai), so a sample that is taken down stays down.
-- The pieces' files sit beside this one: {id}.tl and {id}.webp, written with pieces.sql by
-- `npm run samples`.

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('71100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'hello@tiloart.com', now(), '{"provider": "email", "providers": ["email"]}', '{}', now(), now())
on conflict do nothing;

insert into public.profiles (id, handle, name, bio, role)
values ('71100000-0000-4000-8000-000000000001', 'tilo', 'Tilo', '', 'admin')
on conflict do nothing;

update public.profiles
set bio = 'Tilo''s sample pieces were drawn by Claude, an AI, in code, stroke by stroke, to show what the tools can do. They are here to be replayed, remixed and beaten by hand.'
where id = '71100000-0000-4000-8000-000000000001';

-- the first samples, drawn for the prototype, which these replace
delete from public.pieces
where owner = '71100000-0000-4000-8000-000000000001'
  and id in ('tilowindow', 'tilobalcony', 'tilocat', 'tilokazbegi', 'tilooneline', 'tilopomegranate', 'tilotram', 'tilowaves');
