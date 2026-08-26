# GRAYLINE — Night Shift

A browser-based security-camera survival horror game. You are the night operator
for Grayline Freight & Storage: watch the cameras, manage one battery, and keep
three original threats out of your booth until 6:00 AM.

## Run it

Any static server from this folder, e.g.:

```
node tools/devserver.mjs        # prints SERVING:<port>, probes a free port
```

Then open `http://127.0.0.1:<port>/`. The game also works from `file://`
(no modules, no external assets — everything is procedural Canvas 2D + WebAudio).

## How to play

- Survive **12 AM → 6 AM** (~5 minutes). Everything drains one shared battery;
  at 0% the locks release.
- **SPACE** — raise/lower the camera monitor · **1–8** or **←/→** — switch feeds
- **B** (hold) — signal boost: cuts through static, drains battery
- **A / D** — west / east door · **Q / E** — west / east hall light · **W** — hatch shutter
- **M** mute · **ESC** pause

Threats (all original):

| Threat | Pattern | Counter |
| --- | --- | --- |
| **The Foreman** | Walks the west rooms to your WEST DOOR (footsteps, knocking) | Light to confirm, shut the door until he leaves |
| **The Mange** | Fast, erratic, east service halls (skittering) | Slam the EAST DOOR early, release when quiet |
| **Wick** | Ember in the vents; only moves when its camera is unwatched | Pin it on a feed, drop the HATCH SHUTTER when the hatch LED blinks |

Camera signal drifts all night and low-signal feeds lie (fake blips). Boosting
clears static for a battery cost. Difficulty escalates every hour and every
consecutive night (progress persists in localStorage).

## Project layout

```
index.html          entry (7 classic scripts, no build step)
css/styles.css      terminal/CRT chrome
js/util.js          helpers
js/audio.js         WebAudio synth engine (all SFX procedural)
js/world.js         map graph, 8 procedural camera scenes, office, figures, post-FX
js/entities.js      threat AI (Foreman / Mange stalkers + Wick)
js/game.js          state machine: clock, power, signals, flow
js/ui.js            DOM screens, HUD, toasts, jumpscare player
js/main.js          boot, input, RAF loop, ?autotest=1 hooks
tools/devserver.mjs static server (free-port probe)
tools/headless-sim.cjs  Node smoke tests for the sim loop
screenshots/        captured gameplay states
_attic/             superseded drafts from a parallel aborted pass (not referenced)
```

`?autotest=1` exposes `window.__TEST__` (snap/start/skipTo/forceEntry/kill/
winNow/ts/…) used by the automated verification run.
