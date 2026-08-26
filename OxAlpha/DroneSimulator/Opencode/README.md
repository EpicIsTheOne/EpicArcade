# SkyRange — Drone Simulator

A browser-based 3D FPV drone simulator. Fly a racing quad through a 10-gate
circuit, chase your best lap time, or just rip around the practice range.

## Run it

Option A — any static server (recommended):

```
cd <this folder>
python -m http.server 8000
# open http://localhost:8000
```

Option B — double-click `index.html` (works from `file://`; all scripts are
classic scripts and every asset is generated at runtime, no network needed).

## Controls

| Key | Action |
| --- | --- |
| W / S | Pitch forward / back |
| A / D | Roll left / right |
| Q / E | Yaw left / right |
| SPACE / SHIFT | Climb / descend |
| C | Camera: FPV → Chase → Orbit |
| R | Restart flight |
| ENTER | Start / retry race |
| ESC | Pause & settings |
| M | Mute |
| H | Help overlay |

Gamepad supported (Mode 2: left stick = yaw + climb, right stick = pitch + roll;
A = restart, B = race, Y = camera, Start = menu).

## Features

- Approachable angle-mode flight physics with self-level + hover-hold assists,
  plus an acro (rate-mode) toggle for pilots who want the real thing
- FPV camera with motor vibration, artificial horizon and compass tape;
  smooth chase cam; cinematic orbit cam
- 10-gate timed circuit with start/finish arches, checkpoint respawns,
  next-gate 3D diamond + off-screen arrow, and persistent best time
- Practice range: heliport, hill terrain, lake, town, radio tower with beacon,
  windmills, hot-air balloon, rocks, forests, soft world boundary
- Telemetry HUD: throttle, battery with flight-time estimate and pad recharging,
  speed / altitude / vertical speed, minimap, warnings
- Crash detection with explosion, screen shake and fast auto-respawn
- Sensitivity sliders (pitch/roll, yaw, climb), FOV slider, assist toggles —
  all persisted to localStorage
- Procedural WebAudio motor/wind sound that follows throttle and airspeed

## Tech

Three.js (bundled locally, no CDN) + vanilla JS. No build step, no dependencies.
