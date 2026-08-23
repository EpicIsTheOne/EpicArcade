# EMBERWAKE — Design Document

## Title
**EMBERWAKE**

## Elevator pitch
You are the last Keeper of the Mother Ember. An eternal night has swallowed the valley, and
the only warmth left in the world rides in your lantern — while your family of lantern-beetles
follows you toward the Dawn Gate, trusting your light to keep them alive. But light is fuel,
fuel is scarce, and in the dark, *things have learned to imitate light*.

"That's the game where your light keeps your family alive, and every second of light burns fuel."

## Genre
Atmospheric action-survival escort journey (3D, third-person, single continuous overworld).

## Core fantasy
To be the small brave flame in an enormous cold dark — provider, protector, and last hope.

## Core gameplay loop (30–90 second cycles, nested in a ~25–40 min campaign)
1. **Move the caravan** along the pilgrim road toward the next Wayshrine.
2. **Manage the flame**: lantern HIGH = wide safe aura + fast fuel burn; LOW = stealthy, slow burn;
   BANKED (F) = near-zero burn, near-zero protection — hide in the grass and let danger pass.
3. **Fight or evade**: Flare (SPACE) detonates stored heat in a shockwave that annihilates nearby
   Hollows — but costs fuel and leaves you dim and vulnerable during recovery.
4. **Gather**: embershard crystals, embermoss tufts, shrinekindling — all feed the lantern.
5. **Reach the Wayshrine**: relight it, spend shards at the Kindling Post (upgrades/heal beetles),
   breathe, continue. Regions escalate; the Wraith hunts brighter flames.

## Unique mechanic — the Flame Economy (one resource = safety, weapon, and clock)
The lantern level is simultaneously:
- **HP of everyone you love** (beetles die when hollows reach them in the dark),
- **Your weapon's ammo** (Flare spends it),
- **Your stealth budget** (dim = unseen; bright = hunted harder),
- **A visibility system** (the light radius IS the safe zone — no abstract aggro meters).
Banking trades all four away temporarily for economy. Every choice is legible on screen as light.

## Controls (verified directional semantics)
| Input | Action |
|---|---|
| WASD | Move relative to camera (W = away from camera/up-screen, S = toward camera/down-screen, A = screen-left, D = screen-right). Camera-relative, camera never spins → directions always match screen space. |
| Mouse move | Orbit camera around caravan (mouse right → view rotates right; up/down → pitch, clamped) |
| Wheel | Camera distance zoom |
| SPACE | FLARE — detonate stored flame into a shockwave (costs 18 fuel, 0.9 s recovery) |
| F | BANK / UNBANK the flame |
| 1 / 2 / 3 | Lantern LOW / MEDIUM / HIGH |
| SHIFT | Sprint (caravan keeps pace; brief stamina-free burst, slight extra burn) |
| E | Interact (wayshrines, kindling posts, shrines) |
| P / ESC | Pause |

## Player abilities (upgradeable at Wayshrine Kindling Posts, cost: embershards)
- **Wick Trimming I–III** — −20% fuel burn per tier.
- **Flare Focus I–III** — +35% flare radius & damage per tier.
- **Ember Heart I–III** — +25 max fuel per tier.
- **Beetle Mettle I–II** — beetles gain 2 shield layers (absorb one hit each, regrow at shrines).
- **Moss Affinity I–II** — embermoss yields +50%.
- **Warm Aura I–III** — +12% lantern safe-radius per tier.

## World — The Long Dark Valley (single contiguous procedural map, 4 regions west→east)
1. **Ashfall Meadow** (tutorial-ish): rolling ash-grass, sparse hollows, generous moss. Teaches
   banking, gathering, first shrine.
2. **Glasswind Flats**: wind gusts (visible streaks) push the caravan and *fan the flame*
   (+burn in gusts); frozen ponds slow you. Teaches route choice.
3. **Hushpines**: dense forest, low canopy, wisps (light-lures that mimic campfires and drag
   beetles off the path). Teaches "not all light is yours."
4. **The Cinder Reach**: broken obsidian fields, lava fissures (warm = free fuel trickle, but
   hollows spawn faster), culminating at the **Dawn Gate** — where the Night-Wraith waits.
Named beetles (procedural names, distinct shell colors): they chirp when safe, scream when struck.
You will learn their names. Some will not make it. The ending counts who did.

## Enemies
- **Hollows** — crab-like husks of cold; avoid strong light, rush beetles in darkness. Die to flare
  shockwave or sustained lantern contact. Drop nothing; their threat is time and attention.
- **Wisps** (Hushpines+) — fake lights; drift toward beetles; if a beetle follows one >4 s it is
  lured off-road. Destroyed by flaring near them or holding HIGH on them.
- **Frost Wardens** (Cinder Reach mini-elites) — slow, tall, extinguish a beetle-shield on touch;
  require two flares or baiting into lava fissures.
- **The Night-Wraith** (boss) — a moving cold front. Phases: circles the caravan snuffing light;
  summons hollow tides; must be burned down by flares timed between its dives. Killable only with
  fuel discipline — the fight is literally your remaining winter.

## Progression
- Campaign: 8 wayshrines across 4 regions → Dawn Gate boss → ending (ranked).
- Ranks by score: EMBER LEGEND / DAWNFATHER / LANTERN-SAINT / KEEPER / STRAY FLAME.
- Score: beetles alive ×1500 each, shrines ×400, distance ×2/m, shards banked, time bonus.
- Persistence: localStorage best rank/score/settings; New Journey+ (harder night, +20% burn).

## Win / Lose
- **Win**: defeat the Wraith at the Dawn Gate → dawn sequence, epilogue scales with survivors.
- **Lose**: Mother Ember dies (fuel 0 for 6 s grace) OR all beetles die → elegy screen, restart from
  last wayshrine (campaign keeps region progress; score resets to checkpoint baseline).

## Visual identity
Long-exposure winter night: deep indigo-teal darkness, warm amber/candle-orange as THE hero color.
Region accent grading: Ashfall (grey-violet grass), Glasswind (steel blue ice), Hushpines
(blue-black spruce), Cinder Reach (ember-red cracks). Aurora ribbons, drifting snow/ash motes,
god-ray-ish fog. Low-poly stylized geometry with hand-tuned flat shading, soft blob shadows,
bloom-lite additive glow sprites for every flame source. UI: candlelit parchment-dark panels,
serif display type, no neon.

## Audio direction (100% original, procedural WebAudio — zero assets)
- **Adaptive score**: three crossfading generative layers — "Ember Hymn" (warm pad chords +
  music-box motif, safe), "The Cold Verse" (low drone + detuned bells, danger), "Dawn Chorale"
  (major-key swell, victory/shrines). Key centers shift per region.
- **SFX synth graph**: flare whoosh-boom, lantern crackle loop (filtered noise, level-scaled),
  beetle chirps (FM blips, individualized pitch per beetle), wisp whisper (ring-mod), hollow
  skitter, wind gusts, shrine relight chord, UI ticks. All synthesized at runtime.
- Silence is a feature: BANKED mode ducks the whole mix except wind and heartbeat.

## UI direction
Diegetic-leaning HUD: bottom-left lantern gauge (flame height = fuel), bottom-right caravan strip
(beetle icons w/ shields), top center objective ribbon, minimal compass tick strip. Menus: title,
pause, shrine shop, death elegy, victory scroll. Full settings: volumes, quality (LOW/HIGH/ULTRA),
camera shake, reduced flash, color-safe enemy markers.

## Scope
~25–40 min campaign, replayable ranks, New Journey+. Single-player, offline-capable after first load.

## Technical architecture
- Vanilla ES2020 + **three.js r128** (vendored classic global build). No build step.
- `rng.js` — mulberry32 RNG + value-noise/fBm (dual-export for Node tests).
- `world.js` — deterministic region terrain gen + prop scatter (dual-export).
- `audio.js` — WebAudio synth engine, adaptive music director (browser-only).
- `main.js` — renderer, entity systems, AI, combat, UI, save, QA hooks (`?qa=1`, `window.__EW_DEBUG`).
- Serve: `python -m http.server 8619 --bind 127.0.0.1` (port recorded in PORT.txt).
- QA: Node stub-boot tests (`node --check`, `tests/test_*.js`) + headless Chrome gameplay/visual QA.
