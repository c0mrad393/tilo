-- Pixel sheets (3.1). A pixel sheet is a shape with a grid: 16, 32, 64 or 128 cells square,
-- or 64 × 48. The paper column already takes any short id, so the plain papers need nothing.
alter table public.pieces drop constraint if exists pieces_shape_check;
alter table public.pieces add constraint pieces_shape_check
  check (shape in ('land', 'port', 'square', 'px16', 'px32', 'px64', 'px128', 'pxland'));
