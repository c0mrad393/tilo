-- Animation (3.2). A pixel piece can have frames: groups of its layers, each shown for a
-- time, played as a loop. The frames and their times are kept here, beside the layers
-- (every layer names its frame in `f`); a still has none. The API checks the shape of it.
-- An animated piece also has img/{id}.gif beside its picture, written by the image check.
alter table public.pieces add column if not exists anim jsonb;
