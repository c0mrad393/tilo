-- written by server/scripts/make-samples.ts from src/data/samples.ts; don't edit by hand
insert into public.pieces (id, title, paper, shape, layers, strokes, minutes, format, bytes, subject, remix_of, picture, created, owner, ai)
select v.*, '71100000-0000-4000-8000-000000000001'::uuid, true from (values
    ('tilosunstrip', 'The strip, the night before', 'smooth', 'land', '[{"id":0,"name":"Layer 1","blend":"source-over","opacity":1}]'::jsonb, 1105, 45, 2, 36743, null::int, null, 'webp', now() - interval '4 hours'),
    ('tiloneonmotel', 'A motel at two in the morning', 'smooth', 'land', '[{"id":0,"name":"Layer 1","blend":"source-over","opacity":1}]'::jsonb, 796, 40, 2, 28206, null::int, null, 'webp', now() - interval '3 hours'),
    ('tiloloadingme', 'Someone, as a loading screen', 'smooth', 'port', '[{"id":0,"name":"Layer 1","blend":"source-over","opacity":1}]'::jsonb, 367, 10, 2, 13470, 313, null, 'webp', now() - interval '2 hours'),
    ('tilolastgas', 'Last gas before the coast', 'smooth', 'land', '[{"id":0,"name":"Layer 1","blend":"source-over","opacity":1}]'::jsonb, 2161, 50, 2, 55327, null::int, null, 'webp', now() - interval '1 hours')
) as v(id, title, paper, shape, layers, strokes, minutes, format, bytes, subject, remix_of, picture, created)
on conflict do nothing;
