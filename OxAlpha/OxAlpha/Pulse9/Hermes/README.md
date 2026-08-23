# PULSE-9 — Browser Studio

An original, zero-dependency digital audio workstation that runs entirely in the browser.
Built from scratch (no frameworks, no build step, no external assets) as an independent
capability demonstration. Not affiliated with or derived from any commercial DAW.

![PULSE-9](tests/shots/01_default.png)

## Launch

```powershell
# from this directory
node scripts/serve.js 8734
# then open
#   http://127.0.0.1:8734/
```

Any static file server pointed at this folder works (`python -m http.server`, etc.).
The app also works from `file://` if you prefer double-clicking `index.html`
(autosave uses localStorage, which is per-origin — file:// has its own storage).

## The 30-second tour

1. **CHANNEL RACK** (left): click steps to program drums per channel. Shift+click accents,
   right-click clears. Click a row's name to select it for piano-roll editing.
   `+ ADD` creates synth / bass / keys / drum voices / sampler channels.
2. **PIANO ROLL** (bottom center): click to draw notes for the selected channel.
   Drag to move, grab the right edge to resize, right-click deletes, alt+drag sets velocity.
   Wheel scrolls, shift+wheel scrolls horizontally, ctrl+wheel zooms time.
3. **PLAYLIST** (top center): pick a pattern in the CLIP selector, click empty lanes to
   paint clips, drag to arrange, ctrl+drag duplicates, right-click deletes.
   Drag on the ruler to move the loop region (shift+drag resizes its end).
4. **MIXER** (right): faders/pans/mutes/solos per insert; click an FX slot to add
   delay / reverb / filter / distortion / compressor / chorus. Click a lit slot to edit it.
5. **TRANSPORT**: PAT loops the current pattern, SONG plays the arrangement.
   Drag the BPM number vertically; swing shuffles odd 16ths.

The bundled demo song **"Neon Transit"** (original composition, 128 BPM, F minor)
loads on first run: drums, bassline, chord stabs, arp lead, mixer routing, per-strip FX,
and filter/level automation over an 8-bar arrangement.

## Keyboard

| Key | Action |
| --- | --- |
| Space | play / pause |
| Enter | stop & rewind |
| L / P | loop toggle / pat-song mode |
| Ctrl+Z / Ctrl+Y | undo / redo |
| Ctrl+S | save project (json download + browser storage) |
| Ctrl+E | export WAV |
| Delete | delete selected notes / clip |
| F1 | help |

## Architecture

```
js/core/model.js        project data, validation/sanitization, undo history, autosave
js/core/sequencer.js    pure scheduling math: step->time (with swing), event collection,
                        automation interpolation, mute/solo audibility
js/core/wav.js          16-bit PCM WAV encoder + audio stats
js/audio/dsp.js         drum synthesis (kick/snare/hat/clap/tom/rim/crash), waveshapers
js/audio/engine.js      one graph builder used by BOTH live playback and offline render:
                        channels -> mixer strips (insert FX) -> master chain -> out
js/audio/transport.js   look-ahead scheduler (25ms tick / 140ms horizon), offline renderer
js/ui/*                 rack, piano roll (canvas), playlist (DOM+canvas), mixer, editors
js/demo.js              the demo song as generated data
tests/                  Node core suite + in-browser audio/UI batteries + E2E driver
```

**Why it stays in time:** the transport never uses `setInterval` for musical timing.
It anchors to `AudioContext.currentTime` and schedules events 140 ms ahead of the
audio clock; the interval only tops up the queue. Offline rendering (export, tests)
runs the identical `scheduleWindow`/`buildGraph` code through `OfflineAudioContext`,
so what the tests verify is what you hear.

## Project format (`.pulse9.json`)

```jsonc
{
  "format": "pulse9.project",
  "version": 3,
  "name": "Neon Transit",
  "bpm": 128, "swing": 0, "masterVolume": 0.85,
  "channels":  [ { "id", "type": "synth|bass|keys|drum|sampler", "name", "color",
                   "volume", "pan", "muted", "solo", "mixer": <strip 0-31>, "params": {...} } ],
  "patterns":  [ { "id", "name", "length": <steps>,
                   "notes": [ { "id", "ch", "start", "dur", "pitch", "vel" } ],
                   "steps": { "<chId>": [0|1|1.27, ...] } } ],
  "clips":     [ { "id", "patternId", "start": <step>, "track": <lane>, "length": <steps> } ],
  "automation":[ { "id", "target": "ch.<id>.cutoff | mixer.<n>.volume", "points": [{"t","v"}] } ],
  "mixerStrips":[ { "index", "name", "volume", "pan", "muted", "solo", "fx": [ {type, params} ] } ],
  "loop": { "on", "startStep", "endStep" },
  "playMode": "pattern|song", "currentPattern": 0, "tracks": 8
}
```

Untrusted files are deeply sanitized on load (clamps, unknown-id rejection, version gate);
malformed input raises a readable error and never corrupts the current session.
Autosave lands in localStorage (`pulse9.autosave.v1`, debounced 400 ms).

## Tests

```powershell
node tests/run_core.js                 # 47 assertions: model, serialization, seq math, WAV
node scripts/serve.js 8734             # then, with headless Chrome on :9224:
node scripts/run_audio_tests.js 9224   # 16 offline-render proofs (pitch/timing/fx/export)
node scripts/run_ui_tests.js    9224   # 17 interaction tests incl. inversion checks
node scripts/run_e2e.js         9224   # 5 end-to-end workflow checks
node scripts/capture_shots.js   9224   # screenshots -> tests/shots/
```

Latest full run: **47 + 16 + 17 + 5 = 85 passing, 0 failing.**

## Notes & limits

- Live playback needs an audio-output device; in fully headless environments the
  AudioContext cannot leave `suspended`, so the app tells you instead of pretending.
  All audio verification is therefore done through the offline renderer (same code path).
- The sampler plays user-loaded files at C3–C6 with root C4; samples are not embedded
  in saved projects (only the file name is remembered).
- Automation targets channel volume/pan/cutoff/resonance/attack/release/detune and
  mixer volume/pan; lanes are global (song-time) curves editable in the project JSON.
