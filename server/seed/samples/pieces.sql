-- written by server/scripts/make-samples.ts from src/data/samples.ts; don't edit by hand
insert into public.pieces (id, title, paper, shape, layers, strokes, minutes, format, bytes, subject, remix_of, picture, created, owner, ai)
select v.*, '71100000-0000-4000-8000-000000000001'::uuid, true from (values
    ('tilonightlamp', 'A window at night', 'smooth', 'land', '[{"id":0,"name":"Layer 1","blend":"source-over","opacity":1}]'::jsonb, 945, 10, 2, 52844, 312, null, 'webp', now() - interval '8 hours'),
    ('tilogergeti', 'Gergeti, first light', 'smooth', 'land', '[{"id":0,"name":"Layer 1","blend":"source-over","opacity":1}]'::jsonb, 503, 40, 2, 31062, null::int, null, 'webp', now() - interval '7 hours'),
    ('tilomoonwatch', 'A window at night, with someone watching', 'smooth', 'land', '[{"id":0,"name":"Layer 1","blend":"source-over","opacity":1}]'::jsonb, 965, 4, 2, 53563, 312, 'tilonightlamp', 'webp', now() - interval '6 hours'),
    ('tilooldtown', 'Old Tbilisi, dusk', 'smooth', 'land', '[{"id":0,"name":"Layer 1","blend":"source-over","opacity":1}]'::jsonb, 1528, 55, 2, 65404, null::int, null, 'webp', now() - interval '5 hours'),
    ('tiloharvest', 'Pomegranates on linen', 'smooth', 'square', '[{"id":0,"name":"Layer 1","blend":"source-over","opacity":1}]'::jsonb, 491, 35, 2, 25833, null::int, null, 'webp', now() - interval '4 hours'),
    ('tiloblacksea', 'Batumi, low tide', 'smooth', 'land', '[{"id":0,"name":"Layer 1","blend":"source-over","opacity":1}]'::jsonb, 913, 30, 2, 39142, null::int, null, 'webp', now() - interval '3 hours'),
    ('tiloraintram', 'The last tram, in the rain', 'smooth', 'land', '[{"id":0,"name":"Layer 1","blend":"source-over","opacity":1}]'::jsonb, 1613, 45, 2, 89528, null::int, null, 'webp', now() - interval '2 hours'),
    ('tilorkatsiteli', 'Rkatsiteli in October', 'cold', 'port', '[{"id":0,"name":"Layer 1","blend":"source-over","opacity":1}]'::jsonb, 522, 50, 2, 33562, null::int, null, 'webp', now() - interval '1 hours')
) as v(id, title, paper, shape, layers, strokes, minutes, format, bytes, subject, remix_of, picture, created)
on conflict do nothing;
