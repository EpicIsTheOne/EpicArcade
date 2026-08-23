# WONDERDROME — night shift

An original browser-based survival-horror game (inspired by the surveillance-horror
genre; no third-party characters, assets, or audio). Everything is procedural:
geometry from Blender builds, textures painted at boot, all sound synthesized live
via WebAudio.

## Play

    cd "C:\Users\Epic\Documents\ChatGPT\Ox model test\FNAF-Hermes"
    python -m http.server 8520 --bind 127.0.0.1

then open **http://127.0.0.1:8520/**

## You are the night keeper at the Wonderdrome family fun palace.
Survive 12AM–6AM. Five retired show robots wander the building after close.
Watch them. Listen for them. Manage one power budget. Reach 6AM.

## Controls

| Input | Action |
|---|---|
| Mouse | Look around the office |
| `A` / `D` | West / East door |
| `Q` / `E` | West / East door light |
| `S` | Vent seal |
| `Space` | Camera monitor (hold-to-wind music box on CAM 07) |
| `F` | Audio lure (pulls Bolt toward halls) |
| `Esc` | Pause |

## The cast

- **Orv** the bear (host) — slow, patient, watches the cameras back. Doors hold him... briefly.
- **Rivets** the badger (maintenance) — travels the vent network; seal the vent or flood him out with light cycles.
- **Sera** the ballerina (marquee) — doors mean nothing to her; she slips through cracks. She freezes while watched on cam.
- **Bolt** the clown (greeter) — sprints when unwatched; the audio lure redirects him.
- **Wonder-0** (the marionette) — hangs in the atrium until the music box runs out. Keep it wound.

## Nights & secrets

Six nights, each harder. Answering-machine tapes tell you what happened here.
Hidden FILES unlock across the run — anomalies on camera feeds are not glitches.
Beat night 5 for the ending; night 6 is the house's revenge.

## Tech

- three.js r128 (vendored), UnrealBloom + custom CRT/interference post chain
- Blender 4.3 headless character pipeline (`tools/build_characters.py`, `tools/charlib.py`)
  → GLB exports with named joint empties → runtime procedural rigs (`js/characters.js`)
- Per-character AI over a room graph (`js/ai.js`), power/breaker economy (`js/game.js`)
- Fully procedural WebAudio engine (`js/audio.js`) — ambience, servos, footsteps,
  music box, positional tells, screams
- QA: `node test/qa.mjs` (headless Chrome) — 32 checks covering boot, controls
  semantics, cameras, AI movement, death/blackout/win paths, progression, persistence;
  `test/perf.mjs`, `test/visual_sweep.mjs`, `tools/make_contact_sheet.py`

Character portraits: `screenshots/blender/*_front.png`. QA evidence: `screenshots/`.
