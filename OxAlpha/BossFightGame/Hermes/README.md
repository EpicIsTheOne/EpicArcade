# EMBERFALL — Boss Fight Game

A polished, single-encounter browser boss fight. Face **MALGORYN, the Cinder Sovereign**
across three escalating phases in a cursed arena.

> **Canonical entry: `emberfall/index.html`** — fully self-contained (vanilla JS + Canvas 2D,
> zero dependencies, zero network requests). Works from `file://` or any static server.
> See `emberfall/IDENTITY.md` for the parallel-build coexistence note.
>
> Root `index.html` is a **redirect** to the canonical build (verified working), so every
> entry point boots. `.bane-run01-x91f/` is **NOT this build** — despite its name/marker
> (adopted from a shared-memory note), its contents are the parallel instance's variant
> (boss "VULKARIS", 2 phases). Ownership is content-verified: this build's boss is
> MALGORYN, 3 phases, marker `bossfight-ox-alpha`.

## Launch

Any one of these:

```bash
# simplest — open directly
start emberfall\index.html          # (Windows) or just double-click it

# or serve it
node .e2e/server.mjs 8123           # then visit http://127.0.0.1:8123/emberfall/index.html
npx serve .                         # then visit /emberfall/index.html
```

## Controls

| Input | Action |
|---|---|
| `WASD` / arrows | move |
| `LMB` / `J` | slash (3-hit combo, aims at mouse) |
| `SPACE` / `SHIFT` | dash — brief invulnerability |
| `ESC` / `P` | pause |
| `M` | mute |
| `R` | quick rematch (on end screens) |

## The fight

- **Phase I — The Cinder Sovereign** (orange): *Ember Ring* bullet waves, tracking *Cinder Beam*
  sweeps, telegraphed *Ruinous Charges*.
- **Phase II — The Crown Ignites** (crimson): everything speeds up; gains *Skyfall Cinders*
  (targeted meteor impacts) and *Crown of Blades* (orbiting swords that fly at you). Charges hit twice.
- **Phase III — Sovereign's Wrath** (violet, final 33%): enrage tempo; gains the twin-stream
  *Spiral of the Sovereign*.
- Every attack is telegraphed (dashed lines, filling circles, wind-up flashes) — damage is never
  random or unavoidable. Crossing a phase threshold clears all bullets, heals you **+30**, and
  the music escalates.
- Player: 100 HP, 0.95 s i-frames after a hit, dash i-frames, 3-hit slash combo with a heavy finisher.

## Tech

- Vanilla ES6, Canvas 2D, WebAudio (all music/SFX synthesized at runtime — no audio files).
- Pooled particles/bullets/floaters with hard caps; cached glow sprites; hitstop, screenshake,
  damage-lag boss bar, slow-mo victory sequence.
- Intro cinematic (skippable), pause, win/lose states with stats, quick restart.
- E2E: `node .e2e/test.bossfight.mjs` (Playwright, headless, 16 checks incl. a
  charge-during-player-death NaN regression + screenshots into `shots/`).
  Debug API on `window.__BF` (used by tests; harmless in normal play).

## Layout

```
index.html            <- redirect to the canonical build (smoke-tested)
emberfall/            <- THE GAME (canonical, isolated)
  index.html  css/  js/  IDENTITY.md
shots/                <- E2E screenshots (of the canonical build)
.e2e/                 <- test harness (server + playwright test + faithful backup)
.bane-run01-x91f/     <- parallel instance's own build ("VULKARIS") — not part of this deliverable
```
