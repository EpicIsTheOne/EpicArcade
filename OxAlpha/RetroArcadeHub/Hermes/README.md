# RETRO ARCADE HUB

A browser-based retro arcade hub with **4 original mini-games**, cabinet-style lobby,
local high scores, recent-runs ticker, and a career-score unlock system for cabinet themes.

> **Canonical entry: [`hubx/index.html`](hubx/index.html)**

## Launch

No build step, zero dependencies at runtime, works from `file://` or any static server:

```bash
# option A — just open it
start hubx/index.html

# option B — serve it
cd hubx && npx serve .          # or: python -m http.server
```

## Games

| Cabinet | Genre | Hook |
|---|---|---|
| **NOVA STRIKE** | Vertical shooter | Waves of grunts/divers/tanks, T·R·S power-up pods, wave-up bonuses |
| **HYPER DODGE** | Dodger | One-hit runs, phase dash, near-miss graze combos, velocity tiers |
| **BRICKSMASH** | Brick-breaker | Rotating level patterns, silver bricks, E/M/S/+ pods, combo pitch |
| **TURBO LANES** | Lane racer | Throttle control, overtake chain combos (×2–×6), slow-mo crash cinematics |

## Controls

Global: **← →** select cabinet · **Enter** play · **T** cycle theme · **H** help · **M** mute · **P** pause · **Esc** quit to lobby.
In-game controls are shown on each cabinet's ready screen and in the side panel (arrows/WASD + Space/Shift).

## Progression

Career score = sum of per-game bests. Thresholds unlock cabinet themes:
**MIDNIGHT** (start) → **SUNSET GRID** (3,000) → **POCKET GREEN** (8,000) → **VAPOR DRIVE** (15,000) → **GOLDEN AGE** (25,000).
High scores, recent runs, theme, and mute state persist in `localStorage`.

## QA

`hubx/qa/test.mjs` — self-contained E2E (in-process server on an ephemeral port, headless Chrome,
38 checks incl. file-identity assertions, controls-direction checks, deterministic fail loops,
persistence across reload, unlock flow). Run: `cd hubx/qa && npm i && node test.mjs`.
Screenshots in `hubx/shots/`.

## Note on folder layout

A concurrent foreign build ("RETRO-HUB-RUN02", `RH.*` modules) occupied the run-dir root during
development and repeatedly clobbered root `index.html`/`css/`. Per coexistence policy, this project
keeps **everything** isolated under `hubx/` and never touches foreign files. `hubx/` is fully
self-contained — the rest of the run directory can be ignored.
