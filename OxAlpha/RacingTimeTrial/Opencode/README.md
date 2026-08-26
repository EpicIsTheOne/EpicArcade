# Racing Time Trial

A self-contained, zero-dependency top-down racing time-trial game for the browser.
One polished circuit ("Apex Circuit"), drift-charged boost, ghost replay, medal
targets, and instant restarts.

## Launch

Open `index.html` in any modern browser — directly from disk (`file://`) or via
any static file server. No build step, no dependencies, no network access needed.

```
python -m http.server 8080        # then visit http://localhost:8080
```

## How to play

| Key | Action |
| --- | --- |
| `W` / `↑` | Throttle |
| `S` / `↓` | Brake / reverse |
| `A` `D` / `←` `→` | Steer |
| `SPACE` | Handbrake drift (charges boost) |
| `SHIFT` | Burn boost for extra speed |
| `R` | Instant restart |
| `T` | Respawn at last checkpoint |
| `M` | Mute |
| `ESC` | Pause / back |

- **Race mode**: 3 laps against the clock. Gold / Silver / Bronze targets shown
  on the menu and in results. Your best lap is saved as a ghost that replays
  against you (toggle visibility any time it's on track).
- **Free drive**: no timer — learn the track, practice drifting.
- Drifting (handbrake + steering) charges the boost meter; a clean drift exit
  gives a small surge. Off-road grass is slow — stay on the asphalt.
- Personal bests, ghost, and mute preference persist in `localStorage`.

## Medal targets (3-lap total)

| Medal | Time |
| --- | --- |
| Gold | 0:56.0 |
| Silver | 1:03.0 |
| Bronze | 1:15.0 |

Calibrated against the built-in reference AI (`?autodrive=1`), which laps at
~18.0s / ~55.9s total — right at the gold boundary. Beating gold means beating
the reference pace.

## Technical notes

- Pure vanilla JS + Canvas 2D, single page, ~1200 lines of game code.
- Fixed-timestep physics (120 Hz) with drift-focused arcade car model
  (separate longitudinal/lateral velocity, speed-sensitive steering,
  surface-dependent grip).
- Track is a closed Catmull-Rom spline (312 samples) used for rendering,
  checkpoint/lap validation (sequential gates + centerline proximity guard
  against infield cuts), minimap, and the AI.
- All graphics procedurally generated at load (road, curbs, trees, grandstand);
  all audio synthesized with WebAudio (engine, skid, wind, boost, jingles).
- Ghost recorded at 20 Hz, interpolated on playback; stored in localStorage.
- `?autodrive=1` URL flag enables the reference AI (also drives the menu
  attract-mode demo).
