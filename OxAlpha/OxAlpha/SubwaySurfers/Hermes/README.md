# SKYLINE RUSH

An original browser-based 3D endless runner (Hermes harness build).
Inspired by the *feel* of Subway Surfers — original world, characters, art and code.

## Play
```
cd "C:\Users\Epic\Documents\ChatGPT\Ox model test\SubwaySurfers-Hermes"
python -m http.server 8642 --bind 127.0.0.1
```
Open **http://127.0.0.1:8642/**  (port recorded in `PORT.txt`; re-verify it is free first)

## Controls (verified by automated QA — see below)
| Input | Action |
|---|---|
| `A` / `←` | move ONE lane LEFT |
| `D` / `→` | move ONE lane RIGHT |
| `W` / `↑` / `Space` | JUMP |
| `S` / `↓` | ROLL / SLIDE |
| `H` / double-tap | hoverboard |
| `P` / `Esc` | pause |
| swipe left/right/up/down (touch or mouse-drag) | same as keys |

## Systems
- Endless procedural course, 60-unit chunks streamed ahead/behind, 5 biomes:
  city, station, maintenance yard, bridge-valley, greenbelt park (+ tunnels).
- Parked trains (climbable roofs, coin trails) and moving trains (both directions).
- Obstacles: jump barriers, roll-under gantries, full blockades.
- Collectibles: coins, gems (+10 coins), stars (+600 score). Magnet attraction.
- Powerups (upgradeable durations): Magnet, Jetpack, Shield (absorbs one crash),
  Score ×2, Boost. Spawned in-world, HUD duration bars.
- Hoverboards (4 purchasable variants incl. speed & magnet perks) — absorb one crash.
- Chaser: Dawn Patrol drone + handler; closes in on stumbles, catches you at gap 0.
- Scoring: distance × multiplier (distance tiers + completed missions), coins,
  near-miss bonuses (+25), train-top running bonus, combos.
- Missions: 3 active, tiered pools, persist across sessions, each completion
  raises your base multiplier; full sets advance difficulty tier.
- Progression shop: powerup upgrade levels, boards, runners (outfits), trails.
  All purchases persist via localStorage (`skylinerush.save.v1`).
- Audio: fully procedural WebAudio synth music (tempo scales with speed) + SFX.

## Graphics modes
- **ULTRA** (default): ACES tonemapping, sRGB, PCF soft shadows, UnrealBloom,
  PMREM environment reflections, fog, CSS color grade, speed FOV/lines.
- **QA** (`?qa=1`): antialias off, pixelRatio capped at 1 — for automated runs.
- Rendering uses the real GPU when available (verified on RX 6800 XT / D3D11).

## Tests (all runnable, all passing at ship time)
```
node test/qasim.js        # procedural fairness sim: ~11k layouts, perfect-play model
node test/qa.js 8642      # 38 gameplay checks incl. control-direction law evidence
node test/ui.js 8642      # shop/missions/upgrade flows
node test/fps.js 8642     # frame-rate probe
node test/visualtour.js   # deterministic screenshot tour -> shots/
node test/longrun.js 8642 4   # 4-minute continuous play, memory/streaming audit
```
Latest results: fairness PASS · gameplay 38/38 · UI 5/5 · long-run PASS
(memory ratio 1.02 over 15 stints, chunks always bounded, zero page errors).

## Layout
- `index.html` + `js/core|world|game|ui/*.js` — no build step, three.js r128 (vendored),
  post-processing modules vendored under `vendor/post/`.
- `test/` — headless QA harnesses (puppeteer-core + system Edge/Chrome, `--headless`).
- `shots/` — QA screenshots + result JSONs.
