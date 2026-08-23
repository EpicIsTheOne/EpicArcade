# ⚡ VOLT RUSH

An original, fully playable browser-based **3D high-speed action platformer** built from
scratch (three.js r128, zero build step). Momentum physics, rails, loops, wall-runs,
Surge Attacks, 4 handcrafted levels, ranks & replay chase.

> You are **VOLT** — a courier-speedster in the neon-late city of Meridian.
> Rings are data. Shards are truth. Momentum is a language; speak it fluently.

## PLAY

```
http://127.0.0.1:8461/index.html
```
(Server: `python -m http.server 8461 --bind 127.0.0.1` from this directory.)

Click a sector → click the game canvas to capture your mouse → GO.

## CONTROLS (defaults — NOT inverted)

| Input | Action |
|---|---|
| **W / A / S / D** | Move (camera-relative; S brakes/reverses) |
| **Mouse** | Camera (right = right, up = up; invert options in Pause) |
| **Space** | Jump · double jump · **Surge Attack** (airborne, near enemy) |
| **Shift** | Boost (ground) · Air Dash (air) · hold while turning = **Drift** |
| **Q / E** | Quick-step dodge left/right |
| **Esc** | Pause (options: invert X/Y, music, sfx, graphics tier) |

## MOVEMENT SYSTEM

- Slope-projected acceleration: downhills build real speed, uphills bleed it
- Overspeed carries (slope/panel/rail speed lingers and decays slowly)
- Drift-charging with 2 tiers → drift-dash boost on release
- Coyote time + jump buffering + variable jump height
- Substepped capsule collision (up to 8 substeps) — no tunneling at 60 u/s
- Rails (arc-length splines), loops (spline-locked w/ radial camera roll),
  wall-runs, springs, dash panels, moving platforms, updrafts

## LEVELS

1. **NEON DISTRICT** — night city: loops, rooftop hub, elevated freeway, alley shortcut
2. **SKYSHARD ISLES** — floating islands: sky rails, spring tower, arch gateways
3. **FOUNDRY DEPTHS** — industrial gauntlet: lava canyon, piston platforms, gantry rail
4. **AURORA SUMMIT** — mountain finale: crevasse rail bridge, glacier descent, spire rail

Each: main route + alternates, 3-4 Data Shards (secrets), rings, enemies,
checkpoints, finish gate. Clear a sector to unlock the next.

## COMBAT (flow-first)

- **Sparkdrones** — hover patrols (Surge targets)
- **Strutsentinels** — ground patrollers
- **Voltspheres** — proximity mines (avoid or bait)
- **Prismturrets** — plasma orbs (dodge or rush)
Chain Surge kills for combo callouts. Getting hit scatters rings (recoverable);
zero rings + hit = respawn at checkpoint.

## RANKS

S/A/B/C/D from time vs par, ring %, shard %, combat chain, damage & deaths.
Best time/rank/shards persist per level (localStorage).

## GRAPHICS TIERS

- **LOW** — rasterizer only (QA/software-rendering mode)
- **HIGH** (default) — dynamic shadows, bloom, fog, particle FX
- **ULTRA** — 4096² shadows, 2× pixel ratio

## HEADLESS QA (this repo)

```
node tests/test_engine.js   # 77 assertions: physics, controls, rails, loops, surge…
node tests/smoke.js         # boots real Chrome headless, console-error capture
node tests/play.js          # drives gameplay: W-hold, jump, boost, telemetry
node tests/tour.js          # visits all 4 levels, screenshots every biome
node tests/trace_slope.js   # slope-physics tracer
```

## TECH

three.js r128 (classic global build, vendored) · UnrealBloom post FX · procedural
WebAudio music/SFX (no assets) · procedural rigged character with state-driven
animation · spatial-hash collision world · arc-length Catmull-Rom spline systems.
No external services; fully offline-capable after first load.

*Original IP — character, world, story, mechanics and code are original works.*
