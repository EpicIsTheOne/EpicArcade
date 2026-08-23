# ISLEBREAK — Battle for Kestrel Isle

An original browser battle royale (48 players, storm, building, destruction).
Built from scratch on three.js r180. No game-engine SDK, no proprietary assets —
every model, texture, and sound is procedurally generated.

## Play

```
cd "C:\Users\Epic\Documents\ChatGPT\Ox model test\Fortnite-Hermes"
node server.js          ->  http://127.0.0.1:8420/
```

Port is reserved for this project in `PORTS.txt` (8420). The server re-checks
availability at startup and picks a nearby free port if taken, then logs it.

## Controls (defaults, non-inverted)

| Input | Action |
|---|---|
| Mouse | Camera (RIGHT = right, UP = up; invert options default OFF) |
| W A S D | Forward / LEFT / BACK / RIGHT (camera-relative) |
| Shift | Sprint (also dive while gliding) |
| Space | Jump / mantle / deploy glider / exit barge |
| C | Slide (while sprinting) or crouch toggle |
| Left click | Fire / place build / swing pickaxe |
| Right click | Aim down sights |
| R | Reload (rotate ramp in build mode) |
| E | Interact (chests, floor loot) |
| B | Toggle build mode |
| 1–4 | Wall / Floor / Ramp / Cone (in build mode; also weapon slots otherwise) |
| T | Cycle build material tier |
| G | Edit an owned wall (solid → door → window → half) |
| Mouse wheel / 1–5 | Weapon & item slots |
| Esc | Pause / release pointer |

## Match flow

Lobby → skybarge flight → freefall → glider → loot → fight → build →
8-phase shrinking storm → Victory Kestrel / Eliminated → Play Again.
47 bots drop in hot zones, loot, rotate with the zone, fight each other,
heal behind cover, and panic-build when hurt.

## Weapons (original)

Raptor AR · Stinger SMG · Breaker Pump · Longshot DMR · Skycracker (bolt sniper) ·
Boomer Bomb (rocket launcher). Ammo: medium/light/shells/heavy/rockets.
Heals: Bandage, Medkit, Shield Cell, Big Shield.

## Systems map

```
src/
  game.js         orchestrator, match state, autopilot, QA hooks
  world.js        island heightfield + POI layout (seeded)
  worldmesh.js    terrain chunks, ocean, sky shader, POIs, roads, piers, forests
  physics.js      swept-AABB bodies, raycasts, ground queries
  player.js       controller: sprint/slide/crouch/mantle/swim/glide/build/edit
  camera.js       third-person orbit rig (verified non-inverted look)
  input.js        pointer lock + key/mouse state (invertX/Y default OFF)
  combat.js       hitscan/projectile fire, terrain-aware LOS, damage
  bots.js         47-bot AI: drop/loot/rotate/fight/heal/panic-build, LOD sim
  build.js        4m-grid walls/floors/ramps/cones, HP tiers, edit states
  harvest.js      pickaxe damage -> materials -> destruction
  projectiles.js  rockets: arc, splash, structure damage
  storm.js        8 phases, animated wall shader, ring marker, tick damage
  loot.js         chests, rarity rolls, floating pickups, inventory
  fx.js           pooled tracers/impacts/debris/explosions
  audio.js        procedural WebAudio SFX (no files)
  ui.js           HUD, minimap, killfeed, prompts
test/
  math.test.js    control-contract unit tests (look/strafe semantics)
  qa.test.js      headless full-match QA (drop→…→victory/defeat→restart)
  probe*.js       live diagnostics   visualqa.js   POI screenshot tour
qa/shots/         screenshots from every QA run
```

Quality presets: Low (QA/software renderers), High (default), Ultra (4096 shadows,
stronger bloom, full pixel ratio).

## Testing

```
npm run test:math     # control semantics contract
npm run test:qa       # smoke: boot/drop/land/fire/build/harvest
node test/qa.test.js --full   # plays complete matches headlessly
```

Latest runs: VICTORY (#1 of 48) and defeat (#2 of 48) paths both verified,
plus restart regression.
