-- written by server/scripts/make-samples.ts from src/data/samples.ts; don't edit by hand
insert into public.pieces (id, title, paper, shape, layers, strokes, minutes, format, bytes, subject, remix_of, picture, created, owner, ai)
select v.*, '71100000-0000-4000-8000-000000000001'::uuid, true from (values
    ('tilonarikala', 'Narikala at night', 'plaindark', 'pxland', '[{"id":0,"name":"Layer 1","blend":"source-over","opacity":1}]'::jsonb, 936, 40, 4, 12404, null::int, null, 'webp', now() - interval '4 hours'),
    ('tilokhinkali', 'Khinkali, steaming', 'plaindark', 'px32', '[{"id":0,"name":"Layer 1","blend":"source-over","opacity":1}]'::jsonb, 183, 20, 4, 2634, null::int, null, 'webp', now() - interval '3 hours'),
    ('tilobatumisun', 'Batumi, the sun going into the sea', 'plain', 'px64', '[{"id":0,"name":"Layer 1","blend":"source-over","opacity":1}]'::jsonb, 1452, 35, 4, 18918, null::int, null, 'webp', now() - interval '2 hours'),
    ('tilobrotseuli', 'Brotseuli', 'plain', 'px16', '[{"id":0,"name":"Layer 1","blend":"source-over","opacity":1}]'::jsonb, 66, 10, 4, 1036, null::int, null, 'webp', now() - interval '1 hours')
) as v(id, title, paper, shape, layers, strokes, minutes, format, bytes, subject, remix_of, picture, created)
on conflict do nothing;
