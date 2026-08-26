# Demolition Yard — Physics Destruction Playground

A browser-based physics destruction sandbox. Grab, throw, freeze, spawn, clone and
delete props, then blow up pre-built structures with explosives, projectiles,
force fields and a wrecking ball — with slow motion, fracturing debris,
particles and procedural impact audio.

## Run it

Any static file server from this folder, e.g.:

```
node serve.mjs 8077
```

then open `http://127.0.0.1:8077/`. (Python `http.server`, `npx serve`, etc. work too —
it is a fully static site. Opening `index.html` directly from disk also works.)

All dependencies (Three.js r160, Rapier physics 0.13 WASM) are vendored in `lib/` —
no network or CDN access needed.

## Controls

| Input | Action |
|---|---|
| LMB | Use selected tool |
| RMB drag | Orbit camera |
| MMB drag | Pan camera |
| Wheel | Zoom (or pull held object closer while grabbing) |
| 1 – 0 | Select tool |
| Space | Slow motion toggle |
| R | Reset world |
| M | Mute |
| H / Esc | Help panel |

## Tools

1. **GRAB** — drag objects; release to throw. Wheel while holding moves the object closer/farther.
2. **FIRE** — projectile launcher.
3. **BLAST** — explosive impulse at the aimed point; fractures nearby blocks.
4. **PULL** — hold to vacuum objects toward the cursor.
5. **PUSH** — hold to blast objects away from the cursor.
6. **FREEZE** — toggle any object between frozen-solid and dynamic.
7. **SPAWN** — crate / plank / ball / barrel / anvil (submenu appears above the toolbar).
8. **CLONE** — duplicate any prop.
9. **DELETE** — remove a prop.
0. **BALL** — drops a wrecking ball hanging from a chained crane anchor where you click.

## The yard

Precariously balanced 12 m tower (begging to be toppled), a brick wall with a
doorway, a two-story pavilion with heavy pancake-prone roof slabs, a crate
pyramid, a domino arc, barrels and loose props. Blocks fracture into debris
under extreme impacts. Everything resets with `R`.

## Tech

- Three.js (rendering, shadows, ACES tone mapping) + Rapier3D (WASM physics).
- Fixed 60 Hz physics stepping with render interpolation, so slow motion stays smooth.
- Contact-force-driven impact sounds: fully procedural WebAudio (no audio assets).
- Pooled GPU particle systems (dust / sparks / fire / smoke), pooled flash lights and shockwave rings.
- Body budget capped (~470 dynamic) with automatic fragment trimming; sleeping bodies are free.
