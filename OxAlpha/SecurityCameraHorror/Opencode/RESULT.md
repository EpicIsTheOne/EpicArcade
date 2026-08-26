# RESULT

- **Project:** Security Camera Horror — "GRAYLINE — Night Shift"
- **Model:** openrouter/stealth/ox-alpha
- **Harness:** opencode
- **Run:** 01
- **Benchmark:** sweep-9f1928d5-7699-4740-b15f-7ecd66b41648
- **Status:** completed

## Launch

```
node tools/devserver.mjs     # prints SERVING:<port>
# open http://127.0.0.1:<port>/
```

Static site, zero dependencies, works from file:// too. Click **CLOCK IN**,
read/skip the briefing, **BEGIN SHIFT**. Survive to 6 AM.

## What was built

FNAF-style security-terminal horror with original characters, fully procedural
(Canvas 2D scenes + WebAudio synth, no assets, no CDNs):

- Fixed control booth with WEST/EAST doors, hall lights, overhead HATCH shutter.
- 8 camera feeds with distinct procedural scenes (corridor, crates, manifest
  office, cold store, service hall, boiler, loading dock, atrium), drifting
  per-cam signal, film grain/tears/scanlines, fake blips at low signal,
  hold-to-BOOST static cut-through.
- 3 original threats with readable, distinct rules:
  - **The Foreman** — west route, footsteps/knocks, blocked by WEST DOOR.
  - **The Mange** — fast east route, skitter cue, blocked by EAST DOOR.
  - **Wick** — vent ember that freezes while its camera is watched; HATCH
    shutter counters it.
- Battery economy (base + per-device drain), LOW/CRITICAL warnings, blackout
  state (locks release → doom timer → jumpscare unless 6 AM saves you).
- Escalation per hour and per night (localStorage progress), randomized
  movement/routes/timing every run, ambient red-herring events.
- Full flow: title → typed briefing → night (hour bells, toasts, audio cues
  panned L/R) → jumpscare (procedural face + scream) → lose screen with cause +
  tip, or 6 AM win screen with rank + stats → next night / retry.
- Mute, reduce-flashing setting, pause (ESC), auto-pause on tab hide,
  headphones hint, controls in briefing + SITE ORIENTATION screen.

## Verification

- `tools/headless-sim.cjs` — 10/10 Node sim checks pass (6AM win path,
  door-block/repel, grace-expiry breach, Wick freeze rule, blackout doom,
  progress save).
- Playwright E2E on the real served build: title → briefing → shift; cam
  switching; threat staging; door/light interactions; jumpscare; lose; win.
  Zero console errors on the final build. Screenshots in `screenshots/`:
  - `shot-01-title.png` title screen
  - `shot-02-cam-atrium.png` camera feed + sidebar + HUD
  - `shot-03-cam-foreman.png` Foreman silhouette on CAM 01
  - `shot-04-door-foreman.png` Foreman revealed at lit WEST door
  - `shot-05-jumpscare.png` Foreman jumpscare face
  - `shot-06-lose.png` FEED TERMINATED screen
  - `shot-07-win.png` 06:00 AM shift-complete screen

## Known issues / notes

- A **second concurrent agent instance** repeatedly clobbered files in this run
  folder mid-build (its leftovers are quarantined in `_attic/`, including an
  `instance-b/` sync-conflict copy of this project). Final disk state was
  verified file-by-file (integrity markers + byte-identical served copies) and
  the shipped build is the one described above. If anything ever looks
  "off-theme" (subway-yard text, 7 cams), that's the other instance's
  fragments — not this build.
- Audio requires a user gesture (handled: first click/keypress initializes
  AudioContext).
- Jumpscare strobe can be reduced via SETTINGS → REDUCE FLASHING.

## Artifacts

- Duration: multi-session (several provider-interrupted resumes; exact turn
  count not exposed by harness).
- Test tooling kept in `tools/` (devserver + headless sim) — safe to delete.
