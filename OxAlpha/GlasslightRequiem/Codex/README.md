# Glasslight Requiem

## Title

**Glasslight Requiem**

## Concept

Glasslight Requiem is a 96.9-second audiovisual work set inside a sealed observatory after its surrounding light has failed. A single ember survives at the center of a glass-and-metal lattice. The music and the visuals are both driven by the same six-act score: the ember wakes, learns to travel, opens into a choir of lines, fractures the observatory under pressure, settles into an afterglow, and returns as a chosen current.

The visual language is intentionally specific to the music. It uses a single glowing ember, a vertical filament, radial glass shards, orbiting pressure rings, and particles that echo the frequency bands in the analysis rather than a generic bar graph.

## How the music was created

`music/compose_requiem.py` is a deterministic original composition engine. It synthesizes glass partials, organ-like choir tones, sub bass, synthesized kick, snare, hats, noise sweeps, sparks, and impacts. The same script writes the score timeline used by the browser experience. No stock song or external sample is used.

The final master is included as `music/Glasslight_Requiem.mp3`. The browser delivery copy is `music/Glasslight_Requiem_preview.mp3`, and the lossless intermediate is `music/Glasslight_Requiem.wav`.

## Musical structure

- **I. Waking Glass, 0:00-0:15:** sparse glass motif, soft low pulse, and a closing rise.
- **II. Ember Current, 0:15-0:31:** pulse bass, measured percussion, and the first traveling glass phrase.
- **III. Choir of Lines, 0:31-0:54:** broader harmonic movement, organ choir layers, and a mid-act surge.
- **IV. The Fracture, 0:54-1:02:** compressed percussion, high glass accents, and the strongest authored event.
- **V. Afterglow, 1:02-1:17:** drums recede, glass returns, and the scene breathes.
- **VI. Ember Return, 1:17-1:33:** full current, bass movement, glass melody, and final release into a four-second tail.

The exact measured timing and event list are in `music/score.json`.

## Launch

From this folder, run any static server, for example:

```text
python -m http.server 4191 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4191/` in a browser. The static `index.html` entry point also works when hosted by a static server.

## Controls

- **Begin the Requiem:** starts the buffer-based audio transport and the film.
- **Pointer movement:** changes the resonance field and gently biases the visual response.
- **Progress bar:** seeks to an exact time without restarting the visual loop.
- **Space:** pauses or resumes.
- **R:** replays from the beginning.
- **Replay:** returns from the ending card to the opening.

## Synchronization and visuals

The film clock is the Web Audio `AudioContext` clock, not a free-running visual timer. The browser delivery MP3 is fetched and decoded into an `AudioBufferSourceNode`; seeking restarts that node at an exact offset, so section boundaries cannot drift during a seek. An analyser supplies smoothed frequency energy for small motion and particle responses, while authored section and event times in `music/score.json` control the large transformations.

The canvas renderer draws a layered observatory: radial gradients and dust establish depth, a vertical filament carries the harmonic contour, shards and rings expand with the authored energy, and the ember responds to beat and impact energy. Fracture uses a red pressure field and extending seams. Afterglow removes the aggressive pressure lines. Ember Return restores them with a new resonance state.

## Technologies

- Original HTML, CSS, and JavaScript
- Web Audio API: `AudioBufferSourceNode`, `AnalyserNode`, and a context-clock film transport
- Canvas 2D for the visual film
- Python, NumPy, SciPy, and FFmpeg for the music source and analysis
- No runtime dependencies or server API are required

## Timeline / Visual Structure

The browser uses the same timeline as the score. `I` is a quiet teal observatory with a small central ember and sparse stars. `II` introduces a red traveling current and denser ring motion. `III` widens the halo and fills the lattice with choir-like particles. `IV` turns the frame red, opens radial seams, and lets the ember throw long fracture rays. `V` removes most pressure lines and returns to green-black calm. `VI` rebuilds the rings and rays around the returning ember, then resolves to the ending card.

## Verification

`qa/run_qa.py` launches the isolated static build in Chromium, checks the real audio source and buffer transport, visits each authored act, checks the ending, replay, pause, canvas dimensions, and a 390x844 mobile layout. Screenshots and the machine-readable result are in `screenshots/` and `qa/browser_report.json`.

## Known limitations

- The visual film is 2D Canvas rather than a 3D engine.
- Pointer resonance is a subtle field response, not a rhythm-game scoring mechanic.
- The Google Fonts stylesheet is progressive enhancement; local system fallbacks keep the experience usable if the network is unavailable.
- The MP3 is the delivery master; the WAV is included for higher-quality local playback and reproduction.

## What I would add with more time

- A manually tuned stereo vocal texture recorded specifically for the choir act.
- A second playable mode where resonance is scored rather than only felt.
- A physically modeled observatory interior with depth-of-field and camera drift.
- An alternate export with chapter markers and a director's commentary track.

These are extensions to a complete core experience, not missing requirements.
