# VOLT RUSH — project record
harness: Hermes (desktop app, Reika agent)
port: 8461 (127.0.0.1, python http.server)
started: 2026-08-21

## PORT RULES
- This project binds 127.0.0.1:8461 ONLY.
- If 8461 is taken by an unrelated process, pick another free port — never kill anything.
- Server: `python -m http.server 8461 --bind 127.0.0.1` from this directory.

## VERIFIED MAX SPEEDS (headless Chrome, software GL)
- dash-panel chain: ~75 u/s (270 km/h HUD)
- rails: 52 u/s · hard ceiling: 60 u/s · boost: 42 u/s
- substepping engaged from ~20 u/s; no tunneling at v=60 into walls/floors

## QA COMMANDS
node tests/test_engine.js   # 77 assertions, must stay green
node tests/smoke.js         # boot + console errors
node tests/play.js          # gameplay telemetry (PLAY_OK)
node tests/tour.js          # 4-level visual sweep (TOUR_OK)

## KNOWN ARCHITECTURE NOTES
- levels extend toward +Z; spawn faces +Z via chase.yaw = PI
- level teardown preserves: character, lights, sky dome, aurora, fx pools
- r128: no CapsuleGeometry (use cylinders); classic global build only
- UMD modules attach window.* ALWAYS; module.exports is additive (Node QA)
- CatmullRom3 builds arc-length table eagerly in ctor (totalLength needed early)
- resolveCapsule: ramps are heightfield-surface branch, NOT boxes;
  segment endpoints clamped only when OUTSIDE box Y-range (anti-trampoline)
