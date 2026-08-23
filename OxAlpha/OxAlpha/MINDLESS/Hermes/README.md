# MINDLESS — Browser Recreation (Hermes)

A faithful, polished browser reconstruction of **MINDLESS** (original Godot project by Epic &
team), rebuilt from read-only reference study. The original project was NOT modified.

## Play

- URL: `http://127.0.0.1:8590/index.html`
- Graphics: `?gfx=low|med|high|ultra` (default **ultra**, full VFX)
- QA reduced mode: `?qa=1` (lighter rendering for headless/software GPUs)
- Headless autopilot demo: `?autopilot=1` (bot walks, fights, swaps, dodges)
- Skip intro: `?skipintro=1`

## Controls (authentic to the original)

| Key | Action |
|---|---|
| A / D or ← / → | Move LEFT / RIGHT (never inverted) |
| W / S | Depth lean (visual only) |
| X or SPACE | Jump (**Ecliptio only** — Nova cannot jump, as in the original) |
| C | Attack: melee combo (Ecliptio) / beat-graded music note (Nova) |
| C in air | Jumpkick (knockdown) |
| E | Swap twins (500 ms cooldown; idle/walk only) |
| Q or Tab | Cycle Nova mode (PULSE → DISRUPTOR → OVERCLOCK) |
| V | Ecliptio RAGE when meter is full (5 s invulnerable ×2 dmg → 6 s exhaustion) |
| ESC / P | Pause |
| Enter / C | Advance dialogue · menus |

## The authentic systems

- **BeatManager**: every attack grade derives from the AUDIO CLOCK
  (`AudioContext.currentTime` anchored at song start), never frame counts.
  Grades: PERFECT ≤90 ms, GOOD ≤170 ms, OKAY ≤240 ms (original windows).
  Nova shots scale damage ×2/1.3/1/0.6, speed ×1.6/1.3/1/0.8,
  knockback ×3.5/1.5/1/0.6 by grade — the original tables.
- **Twin swap**: swapping to Nova unmutes the metronome layer of the stage music
  (you literally hear the click track while playing her). Swapping back silences it.
- **Bosses act ON the beat** and open vulnerability windows after N attacks:
  - **EVANGELINE** — Oblitus Slums, 104 BPM. Hover drone, red wing-blades;
    shockwaves + hover steps; phase 2 doubles waves.
  - **EDEN** — Ruined Paradise, 144 BPM. Giant red smiley; note fans every 4th beat,
    aimed notes with travel time = beats, arena steps; green vulnerable ring pulse.
  - **ANGELICA** — MIND Facility, 140 BPM. Purple oni mask; phase 1 spawns enemy
    waves (vulnerable until cleared), phase 2 shockwaves.
- Boss damage model is the original's: fixed damage per landed hit, phase advance
  every 3 hits, death at 4 hits total. Missed punish = boss escapes.
- **Checkpoint arenas**: camera locks, boundary walls, capped simultaneous spawns,
  ONWARD! arrow on clear. Last checkpoint = boss. Stage clear → timer/results,
  saved best times (`localStorage`, mirrors `user://mindless_progress.cfg`).
- **Rescue drone**: on death the drone descends, lifts the twins away, restarts the
  level, rescue counter increments (Nationals spec).
- **Story**: verbatim intro narration (20 lines), per-stage opening/checkpoint/boss/
  completion dialogue from the original RunManager STORY data. EDEN's betrayal line
  closes the campaign.

## Campaign

1. COMBAT TRAINING (140 BPM) — tutorial prompts from the resistance
2. KONTRAU MENSO (118 BPM)
3. OBLITUS SLUMS (118 BPM) — Evangeline
4. RUINED PARADISE (130 BPM) — EDEN
5. MIND FACILITY (140 BPM) — Angelica → *"Angelica was always temporary. I am not."*

## Recreation-only additions (from the Nationals plan)

Ecliptio Rage/Exhaustion, Nova modes (Pulse authentic / Disruptor weaken /
Overclock streaks), level timer + best times, rescue counter, results panel,
reduced-flash setting. All flagged as extensions of the documented plan.

## QA

Headless suite: `node tests/qa.js` (requires `npm i playwright` once).
Covers boot, control-direction semantics (LEFT/RIGHT verified via player x),
jump height, swap behavior, Nova no-jump rule, beat-clock drift probe,
pause/resume sync, all five stages, all three bosses, autopilot progression run.

## Layout

```
src/index.html        entry (240x135 canvas, integer-scaled)
src/js/*.js           engine modules (no build step, vanilla JS)
src/assets/art        sprites/backgrounds/audio copied from the ORIGINAL (read-only sources)
tests/qa.js           headless Playwright suite
reference/            study copies + FINDINGS.md source-of-truth document
screenshots/          visual QA captures
FINDINGS.md           what the original is and how it works
```

Original project: `C:\Users\Epic\Documents\tsa-game` (+ Codex MCP evolution copy).
Untouched. Kontraŭ Menso rises.
