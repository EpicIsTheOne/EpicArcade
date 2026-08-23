# LIMINAL DYNAMICS — Aperture Research Annex (Portal-Hermes)

Original browser-based first-person portal physics puzzle game. Built by Reika
(Hermes Agent) from scratch — no external assets, no build step.

## Run

```
python tools/server.py
```
Serves http://127.0.0.1:8613 (port recorded in PORT.txt). Any static file server
for this folder works too.

## Play

Open the URL, click BEGIN ORIENTATION. Pointer locks; ESC pauses.

- WASD move · mouse look (non-inverted)
- LMB blue rift · RMB amber rift (white panels only)
- SPACE jump · E pickup/drop · R reset chamber
- ` toggles perf HUD

## Chambers

01 FIRST LIGHT — pair placement, first traverse
02 CARRY — mass cell through portals, load plate
03 VERTICAL THINKING — ceiling-rift elevation to a high shelf
04 BALLISTICS — momentum fling across acid
05 THE GAUNTLET — combined multi-step final

## Tech

Three.js r180 (vendored), custom AABB physics with portal-frame velocity
transforms, screen-space recursive portal rendering with oblique near-plane
clipping, HDR bloom/grade composer, procedural textures & WebAudio SFX.
Quality presets: ULTRA / HIGH / MEDIUM / QA (headless testing).
