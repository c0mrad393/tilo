# Tilo

A free browser studio for hand-made digital art, with a gallery where every piece keeps its full replay.

- `npm run dev` starts the app on http://localhost:4640
- `npm run build` typechecks and builds to `dist/`
- Plan and stage order: [docs/ROADMAP.md](docs/ROADMAP.md)
- `prototype/tilo.html` is prototype 0.1, kept for reference

## Layout

- `src/engine` drawing engine with no framework code: stroke model and renderer, pointer capture, replayer, hand-drawn shape generator
- `src/data` sample pieces, workbenches, wall doodles, per-device storage
- `src/components`, `src/pages` React UI
- `src/styles` design tokens, base, materials, app styles
