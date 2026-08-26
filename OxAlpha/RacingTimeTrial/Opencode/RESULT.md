# RESULT.md

- **Project**: Racing Time Trial
- **Model**: `openrouter/stealth/ox-alpha`
- **Harness**: `opencode`
- **Run**: `01`
- **Benchmark**: `sweep-9f1928d5-7699-4740-b15f-7ecd66b41648`
- **Status**: **completed**

## Launch

Open `index.html` in a modern browser (works from `file://` or any static
server — zero dependencies, zero network requests). Keyboard required.

## What was built

A polished top-down racing time-trial game ("Apex Circuit"):

- One hand-tuned 1.8 km closed spline circuit with curbed corners, start/finish
  gantry, checker line, grandstand, and tree-lined surroundings (all
  procedurally generated, pre-rendered to an offscreen layer).
- Arcade drift physics: throttle/brake/reverse, speed-sensitive steering,
  handbrake drifting with slip-based tire smoke + persistent skid marks,
  drift-charged boost (SHIFT) with drift-exit surge, grass penalty off-road.
- 3-lap time trial with 10-gate sequential checkpoint + lap validation
  (infield-cut proof), live lap timer, best-lap tracking, per-checkpoint
  delta popups vs your ghost lap, wrong-way warning, checkpoint respawn (T).
- Ghost replay of your best lap (recorded 20 Hz, interpolated playback),
  drawn translucent in-world + on the minimap.
- Medal targets (Gold 0:56 / Silver 1:03 / Bronze 1:15 for 3 laps), results
  screen with medal, PB badge, and retry.
- Free-drive practice mode, pause menu, instant restart (R), mute (M).
- Speed feedback: FOV-style zoom-out, speed lines, vignette, boost flames,
  screen shake off-road, camera look-ahead.
- Synthesized audio (engine pitch, skid noise, wind, boost sweep, countdown
  beeps, checkpoint/lap/finish jingles) — unlocked on first user gesture.
- Menu attract mode: the built-in reference AI laps the circuit behind the UI.

## Verification

- Full AI races complete cleanly and repeatedly (laps ~19.8/18.0/18.0 s,
  total ~55.8 s) with correct lap/checkpoint/PB/ghost flow.
- Medal thresholds calibrated to measured AI reference pace (AI total lands
  on the gold boundary).
- Manual-drive tests confirmed throttle/steer/handbrake/boost input paths,
  countdown, pause/resume/quit, free drive, restart, results, PB + ghost
  persistence, and off-road dust/skid/smoke particle rendering.
- No console errors (only an early favicon 404, fixed with an inline icon).
- `file://` safe by construction: classic scripts only, no fetch/modules/
  workers/CDNs; storage wrapped in try/catch.

## Screenshots (in `screenshots/`)

| File | Shows |
| --- | --- |
| `01-menu.png` | Main menu with medal targets and controls |
| `02-countdown.png` | 3-2-1 countdown over the grid |
| `03-race-start.png` | Player on grid just after GO |
| `04-racing.png` | On-road cornering at 109 km/h |
| `05-highspeed.png` | Flat-out at 217 km/h with skid marks |
| `06-results.png` | Finish screen: GOLD, 0:55.88, new PB |
| `07-ghost.png` | Ghost car overlapping player at race start |
| `08-pause.png` | Pause overlay |
| `09-freedrive.png` | Free-drive mode |

## Known issues / notes

- The ghost lap is measured line-to-line; lap 1 from a standing start is
  ~0.3–0.5 s slower than the ghost's first split (standard standing-start
  handicap, consistent across all runs).
- Touch/mobile input is not supported (desktop keyboard game).
- `?autodrive=1` debug flag hands the car to the reference AI (used for
  calibration; also runs the menu attract demo).

## Duration / turns

Not exposed by the harness. Session spanned multiple provider interruptions;
work was resumed and completed in place.
