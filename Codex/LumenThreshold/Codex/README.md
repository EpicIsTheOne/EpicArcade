# Lumen Threshold: Astra's Relay

An original rhythm precision platformer made for this benchmark. The game is a self-contained static web build with a custom level, original procedural music, Canvas visuals, and no external runtime libraries.

## Concept

Astra carries the last living spark through a threshold that wakes, breaks, floats, loops, and finally ignites around her. The level is built around readable pulse timing, quick retries, and a progression from a gentle awakening to a high-energy supernova.

## Controls

- `Space`, `ArrowUp`, `W`, `X`, or a mouse click: pulse movement.
- Hold the same input through `Starlift`: rise while held, fall when released.
- `P` or `Escape`: pause and resume.
- `R`: restart the current full run or practice section.
- Touch controls can be enabled in Settings.

## Engine and launch

- Engine: vanilla JavaScript, HTML5 Canvas 2D, and Web Audio.
- Runtime dependencies: none.
- Local launch from this folder:

```text
npm start
```

Then open `http://127.0.0.1:4173/`.

The game also runs from any static HTTP server. Opening the files directly through `file://` is not supported because ES modules require a local origin.

## Gameplay mechanics

1. **Awaken**: a low-pressure opening that teaches the pulse and horizontal flow.
2. **Bloomstep**: tap-driven jump arcs through bright ground hazards.
3. **Fracture Choir**: tap-driven inversion between floor and ceiling language.
4. **Starlift**: hold/release flight through cloudways and moving air hazards.
5. **Sieve of Stars**: switch between two readable rails on the pulse.
6. **Supernova Loom**: the finale cycles through the movement languages while the score drops into its highest-intensity section.
7. **Aster Relay**: a short quiet release and completion state.

The full run is approximately 2:30, contains 49 authored hazards, 25 memory motes, and checkpoints at every major section.

## Music and synchronization

The track is generated in the browser as an original 126 BPM synth score. It uses Web Audio oscillators and noise sources for kick, snare, hats, claps, bass, plucks, pads, sweeps, and stingers. The beat map and level use the same 126 BPM beat grid, so the musical events, hazard spacing, section changes, and visual pulses share one timeline.

Audio starts after the first user gesture to comply with browser autoplay rules. The Web Audio clock drives the music scheduler while the fixed 60 Hz game loop drives movement, keeping the input and collision response stable.

## Practice and progress

- **Practice Sections** opens the saved checkpoint room with all major sections.
- Progress stores best completion percentage, best beat, attempts, deaths, completions, best time, collected memory motes, and practice bests.
- Settings persist locally in `localStorage`: volume, mute, reduced motion, high contrast, and touch controls.
- Progress and settings stay in the current browser. No account or server is required.

## Technical decisions

- Static ES modules keep the benchmark build easy to launch and publish.
- A fixed 60 Hz simulation step makes collisions and input timing deterministic.
- The renderer uses procedural Canvas drawing instead of copied third-party art.
- Procedural memory motes and environment shapes provide collectible and visual variety without asset licensing ambiguity.
- Checkpoint replay and the hidden `window.__LUMEN_DEBUG__` harness support repeatable validation.

## Level Timeline

| Time | Section | Music relationship | Mechanic |
| --- | --- | --- | --- |
| 0:00 | The Waking Garden | Low pads, sparse percussion, a rising sweep | Introductory pulse and visual language |
| 0:11 | Bloomstep | Kick, bass, and bright plugs enter on recurring beats | Tap-driven ground hops |
| 0:38 | Fracture Choir | Snare accents and syncopated bass | Floor/ceiling inversion sequence |
| 1:08 | Starlift | Pad-led breakdown with long sustain tones | Hold/release flight |
| 1:39 | Sieve of Stars | Faster plucks, claps, and repeating ostinato | Two-rail switching |
| 2:05 | Supernova Loom | Full percussion, drops, and stacked harmonic stings | Finale combining all languages |
| 2:28 | Aster Relay | Pad and chime resolution | Safe ending and completion card |

## What I would add next

- A second fully authored level with a different movement grammar and palette.
- Replay ghosts and a best-run comparison line.
- A small level editor with beat-snapped obstacle authoring.
- More accessibility options, including color-safe hazard shapes and a timing-practice overlay.
- Optional stem mixing and a downloadable original soundtrack export.

## Known limitations

- The game is a browser Canvas project, not a native mobile build.
- Progress is local to one browser profile and has no cloud sync.
- Audio is synthesized in real time, so very low-end devices may have different scheduling quality.
- The authored level is intentionally a single polished vertical slice; more sections and a second difficulty tier are future work.
