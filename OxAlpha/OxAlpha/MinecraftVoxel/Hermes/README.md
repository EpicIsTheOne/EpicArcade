# VOXELHELM — Voxel Sandbox (Minecraft-Hermes)

An original browser voxel sandbox built from scratch by the Hermes harness:
procedural infinite terrain, survival gameplay, crafting progression, mobs,
day/night, weather, procedural audio — no game engine, no external assets.

## Play

    node server.js
    open http://127.0.0.1:8477/

Port policy lives in PORT.md.

## Controls

| Input | Action |
|---|---|
| Mouse | Look (non-inverted; invert in Options) |
| W A S D | Move |
| Space | Jump / swim up |
| Shift | Sprint |
| Left click | Break block / attack |
| Right click | Place block / use / eat / interact |
| 1-9 / wheel | Hotbar |
| E | Inventory & crafting |
| Q | Drop item |
| N | Skip half a day (time skip) |
| F | Toggle flight (creative only) |
| Esc | Pause / close screens |

## Systems

- Infinite chunked world (16x128x16), deterministic seeds, 6 biomes + rivers/beaches
- Caves, ores (coal/iron/gold/diamond/redstone), trees (oak/spruce/birch), cacti, flowers
- Sky+block lighting with incremental BFS relighting on edits, smooth lighting + AO
- Survival: health, hunger, regen, fall damage, drowning, lava, death/respawn, XP levels
- Mining tiers: wood→stone→iron→gold→diamond tools with speed, durability, damage
- Crafting: 38 recipes w/ recipe book; furnace smelting with fuel; chest storage
- Farming: hoe→farmland→wheat growth ticks→bread
- Redstone-lite: lever→wire→lamp propagation
- Mobs: pigs, sheep (passive), zombies, skeletons (burn at dawn), drops, combat
- Day/night cycle (10 min), stars/moon, sunrise/sunset palettes
- Weather: rain/thunder cycles, lightning flashes, snow-tinted precip
- Particles: break bursts, burn effects; procedural WebAudio SFX/ambience/rain
- Post FX: bloom, ACES tonemap, vignette, split-tone grading, underwater wobble+fog
- Saves: autosave 20 s to saves/world.json via local API; settings in localStorage
- Graphics presets: Ultra/High/Medium/Low (+QA software-render mode)

## Layout

- src/shared — registry (55 blocks, 97 items), noise, atlas painters (all textures procedural)
- src/gen — worldgen worker (terrain/caves/ores/trees) + light + mesher pipeline
- src/world — chunk manager (worker pool, streaming, edit relight), stations, redstone
- src/render — materials/shaders, sky dome, cloud dome, post chain, weather, particles
- src/entities — player controller, mobs, dropped items
- src/ui — HUD, inventory/crafting/chest/furnace screens, menus, input, persistence
- tests — headless Node suites: 38/38 engine checks pass
- tools — Puppeteer QA: gameplay_qa.js (13/13), visual_sweep.js, perf_profile.js

## Verification

    npm test                     # engine suite (no browser needed)
    node tools/gameplay_qa.js    # real-Chrome gameplay checks (server must run)
    node tools/perf_profile.js   # fps vs render distance
