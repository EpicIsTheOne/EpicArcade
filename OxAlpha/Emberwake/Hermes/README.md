# EMBERWAKE

*a lantern-lit pilgrimage through the endless night*

You are the last Keeper. The Mother Ember — the only warmth left in the world — rides in
your lantern, and five lantern-beetles follow you across a frozen valley toward the Dawn Gate.
Your light keeps them alive. Your light is also your only weapon. And every second of light
burns fuel.

**That's the game where your light keeps your family alive, and every second of light burns fuel.**

## Play

The game is served at: **http://127.0.0.1:8619/index.html**
(port recorded in `PORT.txt`; start the server with `python -m http.server 8619 --bind 127.0.0.1`
from this folder if it isn't running)

## Controls

| Input | Action |
|---|---|
| **WASD** | Move (camera-relative: W = up-screen, A = left, D = right) |
| **Mouse move** | Orbit camera |
| **Wheel** | Zoom |
| **SPACE** | Flare — detonate stored flame into a shockwave (18 fuel) |
| **F** | Bank / raise the flame |
| **1 / 2 / 3** | Lantern LOW / MED / HIGH |
| **SHIFT** | Sprint (burns hotter; never outrun those you protect for long) |
| **E** | Interact / relight wayshrines / leave shrine |
| **P / ESC** | Pause |

Click the canvas to capture the mouse.

## The Flame Economy

One resource — lantern fuel — is simultaneously:

- **Your family's health**: beetles outside your warm light freeze to death
- **Your weapon's ammo**: flares spend it
- **Your stealth budget**: bright = hunted harder by things that hate light
- **The safe zone itself**: the visible ring around you is the only safe place in the world

Banking the flame nearly stops the burn and lets you slip through the dark... but your caravan
huddles close and unprotected. HIGH lights a wide circle and feeds everyone — and drinks you dry.
Everything is legible on screen as light.

## The Journey

Four regions along one continuous pilgrim road:

1. **Ashfall Meadow** — learn to gather, bank, and walk together
2. **Glasswind Flats** — gusts fan your flame; frozen ponds slow you
3. **The Hushpines** — wisps imitate campfires and steal beetles who follow them
4. **The Cinder Reach** — lava fissures feed your lantern; Frost Wardens stalk the road

Relight all 8 wayshrines (each heals the caravan and sells upgrades for embershards),
then face **the Night-Wraith** at the Dawn Gate: dodge its telegraphed dives, burn it between
them, and reach the dawn. The ending counts who crossed with you. Ranks from STRAY FLAME to
EMBER LEGEND. Best result persists locally.

## Tech

- Original procedural everything — no external assets. Terrain, props, creatures, UI, music,
  sound effects are all generated in code at runtime.
- three.js r128 (vendored), vanilla ES2020, zero build step.
- Adaptive procedural score (WebAudio): three crossfading generative layers keyed per region,
  plus ~25 synthesized SFX.
- Pure-logic simulation module (`js/sim.js`) fully separated from rendering — the entire campaign
  can be played headlessly under Node (`node tests/test_sim.js`, 42 assertions incl. an autopilot
  full playthrough), which is how balance was tuned.
- QA mode `?qa=1` drops straight into gameplay with reduced effects for software-rendered CI;
  ULTRA quality preserves the intended experience on real GPUs. `?autopilot=1` plays the whole
  game by itself in the rendered browser.

## Tests

```
node tests/test_sim.js        # full logic suite + autopilot campaign (Node)
node tests/test_browser.js    # headless Chrome boot/input/shop/boss/pause QA
node tests/test_playthrough.js# headless Chrome FULL CAMPAIGN PLAYTHROUGH to victory
```

## Project

Built by Reika (Ox Alpha) for Epic — every line, note, and pixel generated in this session.
