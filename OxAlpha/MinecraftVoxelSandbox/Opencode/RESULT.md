# RESULT

- **Project:** Minecraft Voxel Sandbox — "VoxelForge"
- **Model:** `openrouter/stealth/ox-alpha`
- **Harness:** `opencode`
- **Run:** `01`
- **Benchmark:** `sweep-9f1928d5-7699-4740-b15f-7ecd66b41648`
- **Status:** **completed** (playable, re-verified end-to-end after final bug-fix pass, saved-state round-trip confirmed)

## Launch

```
URL:    http://127.0.0.1:8700        (server running: node serve.mjs, PID in server.pid)
Folder: D:\Ox model test\Minecraft Voxel Sandbox [model-openrouter-stealth-ox-alpha] [opencode] [run-01]
```

Restart from scratch: `PORT=<port> node serve.mjs` from this folder (note: the shell
exports a global `PORT=5733`; always set it explicitly). Click **▶ New World** (or
**Continue Saved World** — a verified save exists). Pointer lock engages on first click.

## Controls

Mouse look (standard, **not** inverted — verified by test: mouse-right → yaw decreases,
mouse-up → pitch increases), WASD move, Space jump/swim, Shift sprint, hold LMB mine /
attack, RMB place/use, 1–9 + wheel hotbar, E inventory, Q drop, Esc pause, F3 debug,
H help. All listed in-game under **Controls & Help**.

## Final-pass bug fixes (this session, all verified live)

1. `js/entities.js` — `spawnItem` crashed with `Assignment to constant variable`
   whenever an item icon was missing → death item-drops threw mid-loop.
   Fixed (`let` + predecoded icon images).
2. `js/player.js` — `applyDamage` called `window.__vvGame.onPlayerDeath()`, but that
   global is never assigned (leftover name; real handle is `window.__game`). Any
   **environmental death (fall / lava / drowning / starvation) soft-locked the game**:
   `dead=true` but no death screen, no item drops. Fixed to `window.__game` (plus a
   `__vvGame` alias in `main.js` for safety).
3. `js/player.js` — `respawnPlayer` used `this.player.maxHp`, which was **never
   defined** → respawn set `hp=undefined` → NaN propagation, broken HP HUD, player
   effectively unkillable afterwards. Fixed (`maxHp=20` in Player constructor).
4. `js/main.js` + `js/entities.js` — item icons are data-URL **strings** (UI contract)
   but `spawnItem` fed them straight into `THREE.CanvasTexture`, producing
   `texSubImage2D: Overload resolution failed` GL errors for every dropped non-block
   item. Fixed: boot now pre-decodes all 99 icons into `Image` elements
   (`game.iconImgs`) and drops use those (verified: complete 48×48 IMG texture, zero
   GL errors across repeated death-drops of 8 items).

## Verified by live headless testing (Playwright, real WebGL — final build)

- Boot → title → New World → play state; chunks stream to `pending: 0` (~260 chunks,
  ~1.34 M triangles in view), ~24–60 FPS headless software-GL.
- **Death cycle:** kill player → `state:'dead'`, full inventory drops as pickup-able
  entities (8/8 items), death UI appears, **0 console errors**; Respawn → `hp=20`,
  `maxHp=20`, play state.
- **Item-drop sprites:** dropped bread/wooden_pickaxe render with decoded IMG textures,
  zero `texSubImage2D` errors (regression-tested).
- **Save/Load round-trip:** `saveNow()` → `localStorage['vxforge.save.v1']` (seed,
  time, weather, edits, containers, meta, player) → page reload → **Continue Saved
  World** → identical seed (476020720), position (x/z exact), hotbar stack restored;
  time restored + advanced by elapsed play time (asserted programmatically).
- **Console: 0 errors, 0 warnings** on the final page through boot → play → save →
  reload → restore → play.
- Day/night rendering: noon sky/clouds/ocean/fog and midnight dark-sky (patched night
  palette — deep navy, moonlit clouds) both captured and inspected (see Screenshots).
- Mobs observed live: cow wandering a beach (day), zombie spawned at night.

## Systems implemented

Infinite seeded terrain (9 biomes, rivers, beaches, mountains), spaghetti+cheese caves,
depth-gated ores (coal/iron/gold/diamond/redstone), lava lakes, trees (oak/birch/spruce),
cacti, flowers; chunked meshing with per-vertex AO + smooth sky/block lighting; PCF sun
shadows; full day/night cycle (sun/moon/stars/sunrise/sunset), procedural clouds, fog,
animated water (fresnel + waves), HDR bloom + ACES tonemap + vignette, underwater
fog/tint, first-person held item with swing/bob; health/hunger/saturation/air, fall &
lava damage, drowning, death/respawn, beds (night skip + spawn set, hostile check);
inventory/hotbar, 2×2 + 3×3 crafting (~35 shaped/shapeless recipes), furnace smelting
(fuel + progress), chests (persistent), tool tiers ×5 with durability + gating, farming
(hoe/farmland/wheat/bread), torches/lamps/glowstone; redstone-lite circuits (lever→wire→
lamp), TNT with chained explosions; 6 mobs (pig, sheep, cow, chicken, zombie, creeper)
with wander/flee/chase/fuse AI, drops, night spawning, dawn burn; item-drop entities
with magnet pickup; weather (rain cycles + audio); synthesized audio (footsteps by
material, dig/place/break, hurt, eat, splash, pickup, explosions, zombie groans, rain,
wind, generative music); pause/settings (quality Low–Ultra, render distance, FOV,
sensitivity, invert-X/Y default OFF, volumes), help overlay, F3 debug, autosave every
25 s + on pause/quit.

## Graphics modes

Low / Medium / High / Ultra (render distance, pixel ratio, shadows, bloom, cloud
detail). Default High; Ultra for showcase GPUs. Headless QA ran fine on software GL.

## Screenshots (in `screenshots/`)

- `final-verify-day.png` — **final build**, noon: sky gradient, procedural clouds,
  ocean, beach, trees, wandering cow, textured hotbar
- `final-night-sky.png` — **final build**, midnight: patched dark-night palette
  (deep navy zenith, moonlit clouds), dark terrain
- `final-forest-closeup.png` — grass/dirt cliff close-up: texture atlas, per-vertex AO,
  fog, ocean backdrop (diamonds in hotbar)
- `final-01-day.png` … `final-05-restored.png` — earlier-pass verification set (spawn,
  block edit, inventory, save→Continue restore)
- `iso-01-spawn.png` … `iso-04-restored.png`, `FINAL-boot-check.png`,
  `final-verify-day.png` (superseded by the new one), `01`–`03` — earlier QA passes

## Known limitations

- No multiplayer (single-player by design; no server needed).
- No XP/enchantments/villages/nether; bow is craftable but has no arrow entity.
- Mobs and dropped items are not persisted across save/load (respawn naturally).
- Water is static (no flow simulation).
- Headless software-GL screenshots undersell the real GPU image quality.
- Latent (guarded, inert): `main.js` references `player.bobA`/`bobAmp()` in a dead
  branch of the viewmodel bob (field is never set, so the branch never runs);
  `player.protectT` is written on respawn but never read.

## Notes

- Duration ≈ 4 h wall-clock across three interleaved agent passes (two interrupted
  provider turns resumed; all passes converged on one codebase; final reconciliation,
  bug-fix pass and QA by this session). ~5,800 lines across 17 modules.
- Port 8700 chosen after scanning occupied ports (8613 is another project's server);
  recorded in `PORT.txt`, server PID in `server.pid`. The shell exports a global
  `PORT=5733` — `serve.mjs` reads `process.env.PORT`, so set it explicitly when
  restarting.
- This machine runs multiple concurrent browser-automation agents; the shared browser
  required stamp/atomic-assert discipline (isolated-e2e protocol) throughout QA.
