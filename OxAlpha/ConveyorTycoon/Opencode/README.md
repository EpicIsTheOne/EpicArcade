# Conveyor Tycoon

A browser-based conveyor-belt factory tycoon. Mine ore deposits, refine goods
through multi-recipe machines, and sell them at the market — then reinvest in
a bigger, faster factory.

## Run it

Open `index.html` in any modern browser — the game is a single self-contained
file (no server, no network, no dependencies). It also runs from any static
file server.

```
# optional local server
node tools/devserver.mjs
```

## How to play

- Drop **Extractors** on ore deposits (iron / copper / coal).
- Paint **Conveyors** (drag) into **Smelters**, **Assemblers** and the
  **Fabricator**.
- Sell ingots, gears, circuits and robots at the **Market**, or buffer them in
  **Storage**.
- Reinvest in global upgrades (Belt Speed, Machine Overclock) and complete
  objectives.

### Controls

| Key | Action |
| --- | --- |
| `1`–`8` | Select build tool |
| `R` / wheel | Rotate ghost or hovered building |
| `X` | Demolish tool (70% refund) |
| Right-click | Quick-demolish hovered building |
| Drag | Paint conveyor lines (auto-turns) |
| `Space` | Pause simulation |
| `Tab` | Stats & upgrades |
| `H` | Help |

## Production chains

- 2× Iron Ore → **Iron Ingot** ($12) — Smelter
- 2× Copper Ore → **Copper Ingot** ($14) — Smelter
- 2× Iron Ingot + 1× Coal → **Steel** ($30) — Smelter
- 2× Iron Ingot → **Gear** ($34) — Assembler
- 1× Copper Ingot → 2× **Wire** ($17) — Assembler
- 1× Wire + 1× Iron Ingot → **Circuit** ($48) — Fabricator
- 1× Steel + 1× Gear + 2× Circuit → **Robot** ($190) — Fabricator

## Features

- Real-time item simulation on belts (visible items, spacing, jams)
- Multi-recipe machines that auto-select recipes from available inputs
- Placement preview with rotation, drag-painting, 70% demolition refunds
- Per-building hover tooltips (buffers, progress, throughput)
- Global upgrades, objectives, income sparkline, lifetime stats
- Autosave every 5 s + on exit; resumes exactly where you left off
- Procedural sound effects (mutable), pause, compact 30×22 map

## Project layout

```
index.html          <- shipped game (single file, generated)
.src/*.js           <- readable sources (defs, audio, sim, render, ui, main)
.src/style.css      <- stylesheet source
css/style.css       <- legacy copy kept for tooling compatibility
tools/build-single.mjs  <- bundles .src/* + css into index.html
tools/devserver.mjs     <- tiny static server (node tools/devserver.mjs)
shots/              <- verification screenshots
```

To modify the game: edit `.src/*`, then run `node tools/build-single.mjs`.
