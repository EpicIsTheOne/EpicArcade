# NEON DRIFTER — an interactive music video

A self-contained, browser-based interactive music video. An original synthwave
track (100 BPM, 2:46, seven sections) drives seven distinct visual scenes that
evolve across the song — dawn horizon, ignition, neon drive, starlight,
convergence, hyperdrive, afterglow — ending on a FIN card with instant replay.

## Run it

Everything is local — no CDN, no backend, no build step.

- **Static server** (recommended): `python -m http.server 8000` in this folder,
  then open `http://localhost:8000/`.
- **Direct file**: double-click `index.html` (works from `file://` too — the
  audio engine falls back to a media element there automatically).

## Interact

| Input | Effect |
| --- | --- |
| Move mouse | Parallax camera drift |
| Click canvas | Shockwave pulse + sparks |
| Scroll wheel | Visual intensity 45%–220% |
| `1`–`7` | Force a specific scene (remix any section) |
| `A` | Back to auto (scene follows the song) |
| `Space` | Play / pause |
| `←` / `→` | Seek ±5s (also drag the seek bar) |
| `R` | Restart |
| `M` | Mute |
| `F` | Fullscreen |
| `H` | Hide/show the control bar |

The experience also works as pure watch-mode — every interaction is optional.

## Architecture

```
index.html          shell: canvas + landing/endcard/controls UI
style.css           neon-synthwave UI styling
js/timeline.js      song timeline data (7 sections, 100 BPM, duration)
js/audio.js         audio engine: decodeAudioData + BufferSource (accurate
                    seek on any static server), <audio> fallback for file://,
                    virtual-clock fallback when audio is unavailable;
                    WebAudio analyser feeds beat/energy data
js/scenes.js        seven canvas scene renderers + shared primitives (grid,
                    sun, tunnel, starfield, kaleido, particles) + palette
js/main.js          conductor: sync, section title cards, input, UI, seek,
                    performance guard (auto DPR drop under load)
audio/              the track (Neon Drifter.mp3) + its generator scripts
screenshots/        captured states of the shipped build
song/               unused alternate track pipeline (reference only)
```

No dependencies, no workers, no network. Pools particles, caps DPR at 1.75,
and degrades resolution automatically if frame times sag.
