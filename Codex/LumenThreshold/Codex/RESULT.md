# Lumen Threshold: Astra's Relay

- **Project:** Lumen Threshold: Astra's Relay
- **Type:** Original static browser rhythm platformer
- **Status:** Playable and locally validated
- **Entry point:** `index.html`
- **Run command:** `npm start`
- **Local URL:** `http://127.0.0.1:4173/`
- **Ephix arcade route:** `https://epic.techexplore.us/Codex/LumenThreshold/Codex/`
- **Model:** Not specified for this benchmark artifact
- **Harness:** Custom local browser and Node validation harness
- **Screenshots:** `screenshots-browser-live.png`, `screenshots-bloom-60hz.png`, `screenshots-orbit-60hz.png`, `screenshots-finale-60hz.png`, `screenshots-live-epic.png`, `screenshots-live-epic-gameplay.png`

## Validation summary

- Node unit suite passes with level, music-grid, fixed-step movement, drift, progress, and full deterministic completion checks.
- Browser smoke test passes with a real Web Audio context and no page errors.
- A real browser autopilot run reached completion in approximately 2:30.
- The deterministic completion test uses the same 60 Hz fixed step as the game loop.
- The public Ephix arcade route returned HTTP 200 and booted with Web Audio after a user gesture.
