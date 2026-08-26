# VoxelForge — a browser voxel sandbox

A complete Minecraft-style survival sandbox built from scratch in vanilla ES modules +
three.js (bundled locally, no CDN). All textures, item icons and audio are generated
procedurally at boot — the game has zero external assets and runs fully offline.

## Run it

```bash
node serve.mjs        # serves http://127.0.0.1:8613
```

Then open <http://127.0.0.1:8613>. Any static file server pointed at this folder works
(`npx serve`, `python -m http.server`, etc.). The page also works from `file://` in
most browsers since there are no fetches/CORS dependencies.

## Controls

| Input | Action |
|---|---|
| Mouse | Look (standard, non-inverted; invert toggles in Settings) |
| `W A S D` | Move |
| `Space` | Jump / swim up |
| `Shift` | Sprint |
| Left click (hold) | Mine block / attack |
| Right click | Place block / use (crafting table, furnace, chest, bed, lever, eat) |
| `1`–`9`, mouse wheel | Hotbar slot |
| `E` | Inventory + 2×2 crafting |
| `Q` | Drop held item |
| `Esc` | Pause menu |
| `F3` | Debug overlay |
| `H` | Controls & help |

## What's inside

- **World** — infinite seeded terrain: plains / forest / birch / desert / snowy / taiga /
  mountains / ocean / beaches / rivers; spaghetti + cheese caves; coal/iron/gold/diamond
  (+ redstone) ore veins by depth; lava lakes; oak/birch/spruce trees; cacti; flowers.
- **Rendering** — custom GLSL3 pipeline: texture-array chunk shader with per-vertex AO +
  smooth sky/torch light, PCF sun shadows, day/night cycle with sun/moon/stars/sunsets,
  procedural cloud layer, distance fog, animated water with fresnel, HDR bloom +
  ACES composite pass, underwater fog/tint, first-person held-item view with swing/bob.
- **Survival** — health, hunger + saturation, drowning with air bubbles, fall damage,
  lava damage, death/respawn, bed sleep (skips night, sets spawn, blocks when mobs near).
- **Crafting & blocks** — 36-slot inventory + hotbar, 2×2 and 3×3 shaped/shapeless
  crafting (~35 recipes), furnace smelting with fuel + live progress, chests with
  persistent contents, tool tiers wood→diamond with durability and mining-speed/gating,
  torches/lamps/glowstone lighting, ladders, farming (hoe → farmland → wheat → bread).
- **Redstone-lite** — lever + wire + lamp power propagation; TNT with chained explosions.
- **Mobs** — pigs, sheep, cows, chickens (wander, flee, drops), zombies (night spawn,
  chase, melee, burn at dawn), creepers (approach, fuse, explode, terrain crater).
  Item drops magnetize to the player.
- **Persistence** — deterministic seed; block edits, containers, time, weather and full
  player state autosave to localStorage every 25 s and on demand; Continue restores
  everything (verified round-trip).
- **Audio** — fully synthesized WebAudio: per-material footsteps, dig/break/place,
  hurt, eat, splash, pickup, explosions, zombie groans, rain loop, wind ambience and a
  generative music bed. Volume sliders in Settings.

## Graphics settings

Quality presets (Low → Ultra) control render distance, pixel ratio, shadows, bloom and
cloud detail; FOV, sensitivity, invert-X/Y (both default OFF) and volumes are adjustable
in Settings. On capable GPUs the default (High/Ultra) is the intended look.

## Project layout

```
index.html            entry + import map
css/styles.css        HUD/menus
js/main.js            game loop, input, streaming, save, interactions
js/world.js           chunks, edits, lighting queries, circuits, explosions
js/worldgen.js        seeded terrain/biomes/caves/ores/trees
js/mesher.js          chunk mesh builder (AO, smooth light, water, plants)
js/render.js          GLSL3 shaders, shadow pass, sky, post chain
js/atlas.js icons.js  procedural texture atlas + item icons
js/blocks.js items.js craft.js   registries, recipes, smelting, fuel
js/player.js entities.js         physics/controller, mobs & drops
js/ui.js audio.js     HUD/menus, synthesized sound
js/noise.js mathutil.js config.js
vendor/three.module.js           bundled three.js (no CDN)
serve.mjs             tiny static server (port 8613)
```
