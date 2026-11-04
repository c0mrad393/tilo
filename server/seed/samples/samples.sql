-- The tilo account, which holds the prototype's sample pieces, so the gallery isn't empty
-- on day one and remixes of a sample credit it like any piece. migrate.sh applies this once
-- (it is recorded in tilo_meta.migrations), so a sample that is taken down stays down.
-- The pieces' files sit beside this one: {id}.tl and {id}.webp.
-- They were made by publishing src/data/samples.ts through the studio's own publish path.

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('71100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'hello@tiloart.com', now(), '{"provider": "email", "providers": ["email"]}', '{}', now(), now())
on conflict do nothing;

insert into public.profiles (id, handle, name, bio, role)
values ('71100000-0000-4000-8000-000000000001', 'tilo', 'Tilo',
        'The Tilo team. These pieces were drawn for the prototype, stroke by stroke, and are here to replay and remix.', 'admin')
on conflict do nothing;

insert into public.pieces (id, title, paper, shape, layers, strokes, minutes, format, bytes, subject, remix_of, picture, created, owner)
select v.*, '71100000-0000-4000-8000-000000000001'::uuid from (values
    ('tilowindow', 'A window at night', 'smooth', 'land', '[{"id": 0, "name": "Layer 1", "blend": "source-over", "opacity": 1}]'::jsonb, 73, 9.6, 2, 9683, 312, null, 'webp', now() - interval '8 hours'),
    ('tilokazbegi', 'Kazbegi, 7 a.m.', 'smooth', 'land', '[{"id": 0, "name": "Layer 1", "blend": "source-over", "opacity": 1}]'::jsonb, 41, 22, 2, 9503, null, null, 'webp', now() - interval '7 hours'),
    ('tilobalcony', 'Sololaki balcony', 'smooth', 'land', '[{"id": 0, "name": "Layer 1", "blend": "source-over", "opacity": 1}]'::jsonb, 112, 31, 2, 13665, null, null, 'webp', now() - interval '6 hours'),
    ('tilocat', 'A window at night, with Pilpili', 'smooth', 'land', '[{"id": 0, "name": "Layer 1", "blend": "source-over", "opacity": 1}]'::jsonb, 88, 4, 2, 10331, null, 'tilowindow', 'webp', now() - interval '5 hours'),
    ('tilopomegranate', 'Pomegranate study', 'smooth', 'land', '[{"id": 0, "name": "Layer 1", "blend": "source-over", "opacity": 1}]'::jsonb, 86, 9, 2, 9623, null, null, 'webp', now() - interval '4 hours'),
    ('tilooneline', 'One line, no lifting', 'smooth', 'land', '[{"id": 0, "name": "Layer 1", "blend": "source-over", "opacity": 1}]'::jsonb, 5, 3, 2, 5612, null, null, 'webp', now() - interval '3 hours'),
    ('tilowaves', 'Batumi, low tide', 'smooth', 'land', '[{"id": 0, "name": "Layer 1", "blend": "source-over", "opacity": 1}]'::jsonb, 22, 12, 2, 9711, null, null, 'webp', now() - interval '2 hours'),
    ('tilotram', 'Last tram home', 'smooth', 'land', '[{"id": 0, "name": "Layer 1", "blend": "source-over", "opacity": 1}]'::jsonb, 47, 9.8, 2, 9492, 312, null, 'webp', now() - interval '1 hours')
) as v(id, title, paper, shape, layers, strokes, minutes, format, bytes, subject, remix_of, picture, created)
on conflict do nothing;
