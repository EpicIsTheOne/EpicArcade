# LUMENCRAFT

A fully playable, original voxel sandbox/survival game for the browser.
Built from scratch: custom WebGL2 renderer, seeded procedural worlds,
Minecraft-style flood-fill lighting, survival systems, crafting, mobs, circuits —
no external assets (all textures, icons and sounds are generated procedurally).

**Project isolation:** OpenCode harness · port **8791** (see `PORT.md`).

## Run it

```
node serve.mjs
# open http://127.0.0.1:8791
```

Click **New World**, optionally type a seed (same seed = same world), pick a slot,
then **Enter World** to capture the mouse. Continue resumes your last save.

## Controls

| Input | Action |
|---|---|
| Mouse move | Look (right = turn right, up = look up) |
| W A S D | Move / strafe (camera-relative) |
| Space | Jump / swim up |
| Shift | Sprint |
| X | Fly mode (Space up · C down) — sandbox scouting |
| Left click | Mine block / attack |
| Right click | Place block / use item / interact |
| Wheel / 1–9 | Hotbar select |
| E | Inventory |
| Q | Drop held item |
| T | Chat (multiplayer) |
| Esc | Close window / pause |
| F3 | Debug overlay |

## Systems

- **World:** 16×128×16 chunks streamed from a worker pool; deterministic seeds;
  biomes (plains, forest, desert, snowy peaks, mountains, beach, ocean);
  caves (spaghetti + caverns), ores by depth (coal/iron/gold/diamond/ember),
  lava lakes, trees per biome, ruins & dungeon structures with loot chests.
- **Lighting:** Minecraft-style skylight + blocklight flood fill baked per-vertex
  with smooth lighting & ambient occlusion; dynamic sun shadow map (PCF);
  torch/glowstone/lava emissives glow through darkness.
- **Rendering:** HDR pipeline (bloom → ACES tonemap → split-tone grade, vignette),
  procedural sky (sun/moon/stars/sunset), volumetric-look clouds, animated water &
  lava shaders, weather with rain/snow particles, underwater fog/tint/bubbles,
  day/night cycle, block-break particles, crack decals, first-person hand.
- **Survival:** health, hunger/exhaustion/regen, fall damage, drowning/breath,
  swimming, ladders, sprinting, death & respawn (bed sets spawn).
- **Sandbox:** mining with tool tiers/durability & correct-tool drops; placing with
  support rules; inventory/hotbar; 2×2 & 3×3 crafting with recipe book;
  furnace smelting (fuel/progress UI); chests; farming (hoe→farmland→wheat→bread);
  beds; spark circuits (lever/wire/lamps); water spreading; falling sand/gravel.
- **Mobs:** Glooms (night hostiles, burn in sunlight), Skitters, sheep/pigs/chickens
  (drops), AI wander/chase/flee, combat with knockback & crits.
- **Ambient music:** three original synthesized pieces ("Sunfall" F-major piano
  ballad, "Hollow" A-minor arpeggios, "Starfield" C-major pad study) in the calm
  C418 spirit — diatonic maj9/m7/sus2 harmony, pentatonic-leaning melodies that
  resolve to chord tones, rubato humanization, convolution reverb. Tracks play
  at random intervals (with long silences between) on the title screen and
  in-world; separate Music volume setting.
- **Persistence:** 3 save slots (localStorage): seed + block edits + containers +
  player state + time/weather; autosave every 45 s and on quit.
- **Multiplayer:** two modes over WebSocket (ox-live backend, `server.mjs`).
  **Site SMP world** — one persistent world shared with everyone on the site;
  the edit log is saved to disk (debounced) and survives server restarts, and
  new joiners spawn next to an existing player. **Private rooms** — pick a
  room code and share it; first player in decides the seed. Synced: block
  place/break, player positions/avatars with name tags, chat (T), death
  notices, shared day/night clock. Local-only by design: mobs, drops,
  inventory and containers. Server handler hot-reloads resync live clients
  automatically (rejoin prompt).

### Multiplayer backend

`server.mjs` implements the ox-live contract (see `ox-live/README.md` in the
EpicArcade repo): ESM, stdlib-only, default-exports `create(ctx)` returning
`{open, message, close, tick, stop}`. Rooms are ephemeral in-memory state
(seed + edit log + peer states); the platform owns the socket and reloads the
module on change. Route: `/ws/lumencraft`, declared in `arcade.json`.

Endpoint resolution on the client: `?ws=` URL param → `localStorage
'lumencraft_ws'` → `ws(s)://<host>/ws/lumencraft`. For local testing run
ox-live (`LIVE_DIR=<repo layout> LIVE_PORT=8099 node server.js`) and open the
game with `?ws=ws://127.0.0.1:8099/ws/lumencraft`.

## Graphics modes

Presets **Low / Medium / High / Ultra** (settings screen): render distance,
shadows, bloom, fancy water, clouds, resolution scale, FOV, sensitivity,
invert-X/Y (off by default), volume. Ultra targets beefy GPUs (rd 14).

## Tests

`node tests/qa.mjs` — 47 headless gameplay assertions (camera semantics verified
directionally, movement, mining/drops/placing, crafting via real UI clicks,
furnace smelting, circuits, water CA, day cycle, mobs/combat, fall damage,
swimming, menu hygiene, save/reload persistence).
`node tests/music.mjs` — ambient-music assertions (diatonic composition checks,
melody/accompaniment balance, audible render, volume mute).
`node tests/shots.mjs`, `tests/biomes.mjs`, `tests/perf.mjs` — visual tour,
biome scenes and performance snapshots (headless software rendering).
`node --test tests/mp-server.test.mjs` — multiplayer backend protocol tests
(join/leave, block relay + edit log, rate limits, sanitization, state ticks).

Known limitations: flowing-water CA is simplified (finite spread levels);
mobs are not individually persisted across saves. Multiplayer: mobs/drops/
containers are local-only; block *face* metadata for furnaces/chests defaults
on late join; private rooms reset on ox-live restart (only the SMP world is
persisted); SMP edit log caps at 200k edits (oldest dropped after that).
