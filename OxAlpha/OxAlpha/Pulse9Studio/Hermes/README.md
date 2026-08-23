# Nyx DAW — original browser music workstation

An independent, from-scratch digital audio workstation that runs entirely in the
browser. Inspired by the *workflow* of classic pattern-based DAWs (channel rack →
patterns → playlist), built with 100% original code, UI, and synthesized sounds.
No third-party frameworks, no samples, no build step.

## Launch

```bash
cd "FL Studio - Hermes (ox-alpha)"
node server.js
# open http://127.0.0.1:<port shown in console>   (default http://127.0.0.1:8760)
```

The server binds to 127.0.0.1 only and picks the next free port automatically if
8760 is taken — it never touches other processes' ports.

You can also open `index.html` directly via `file://`; everything works except
that some browsers restrict AudioContext autoplay without a gesture (click Play
once). The local server is the recommended way to run it.

## Workflow tour

1. **Channel Rack** (left): instruments with mute/solo LEDs, volume & pan knobs.
   Click cells in the step grid below to sequence drums/percussion.
2. **Instrument Browser** (right): click any drum or synth preset to add a channel.
3. **Piano Roll** (center tab): paint notes by clicking, drag to move, drag the
   right edge to resize, Alt+drag vertically for velocity, Shift+drag for
   marquee select, right-click deletes. Ctrl+wheel zooms time.
4. **Playlist** (center tab): click a pattern in the left palette to place a clip,
   drag clips in time/track, Alt+drag duplicates, right-click deletes.
5. **Mixer** (topbar button): 8 inserts + master, volume/pan knobs, M/S, live
   meters; click a strip to open its FX rack (EQ3, delay, reverb, distortion,
   compressor, chorus — all real DSP).
6. **Synth editor**: the ♪ button on a synth channel opens per-voice controls:
   dual oscillator waveforms/mix/detune/octave, resonant filter with envelope,
   ADSR — every knob changes the generated audio immediately.
7. **Transport**: play/pause (Space), stop, PAT/SONG modes, loop region, tempo
   (drag ↕ or type), swing %.
8. **File menu**: New / Demo ("Midnight Circuit"), Save (Ctrl+S) & Open `.nyx.json`
   projects, Export WAV (renders the whole song offline), Export JSON.

Autosave keeps your working state in localStorage; reload restores it.

## Architecture

```
js/
  wav.js        RIFF/WAVE 16-bit PCM encoder (+ test decoder)
  project.js    Project model · validation/sanitization · undo history · demo song
  engine.js     Web Audio engine:
                  - subtractive synth voice (2 osc -> filter+env -> pan -> insert)
                  - 7 synthesized drum voices (kick/snare/hats/clap/tom/rim)
                  - effect units (eq3/delay/reverb/distortion/compressor/chorus*)
                    *chorus is true-stereo (quadrature LFOs + ChannelMerger)
                  - mixer graph: strips -> FX chains -> master bus -> out
                  - lookahead scheduler on the AudioContext clock (25ms tick,
                    120ms horizon; sample-accurate note starts, swing offset)
                  - OfflineAudioContext rendering for export/tests
  ui/core.js    App state, transport, keyboard map, autosave, file IO, windows,
                knob widget (drag up OR right = increase; Shift = fine)
  ui/rack.js    Channel rack + step sequencer grid + instrument browser
  ui/pianoroll.js Canvas piano roll (paint/move/resize/velocity/marquee/snap/zoom)
  ui/playlist.js  Arrangement canvas (palette, clip edit, playhead, loop region)
  ui/mixer.js   Mixer strips, meters, FX rack windows
  ui/synth.js   Synthesizer editor window
server.js       Static server, localhost-only, dynamic port fallback
tests/          unit (Node) + e2e-audio + e2e-ui + perf (headless Chrome)
```

## Project format (`.nyx.json`)

```json
{
  "app": "nyx-daw",          // required tag
  "version": 1,              // future versions rejected cleanly, older migrated
  "name": "Midnight Circuit",
  "bpm": 124, "swing": 0,
  "channels": [ { "id","type":"synth|drum","name","color","volume","pan",
                  "mute","solo","mixerTrack","params"|("sample") } ],
  "patterns": [ { "id","name","length","color",
                  "notes": { "<channelId>":[{key,step,len,vel}] } } ],
  "mixer":     [ { "index","name","volume","pan","mute",
                   "effects":[{"type","enabled","params"}] } ],   // index 0 = Master
  "tracks":    [ { "id","name","color","clips":[{id,patternId,start,length}] } ],
  "automation":[ { "target":{"channelId|mixerTrack","param"},"points":[{step,value}] } ],
  "songLength": steps
}
```

All imported data is validated and clamped (`coerceProject`) — malformed files
fail with useful errors instead of corrupting state.

## Tests

```bash
npm test                      # Node unit tests (model/history/DSP math/wav codec)
node tests/e2e-audio.js       # headless Chrome: renders + PCM analysis of the real engine
node tests/e2e-ui.js          # headless Chrome: real input events, save/load, export
node tests/perf.js            # drift/fps/redraw benchmarks
```

The audio suite verifies non-silence, pitch (Goertzel), stereo balance,
tempo scaling, per-effect DSP impact, automation sweeps, and that exported WAVs
contain real musical content.

## Originality

Everything here — code, visual design, instrument designs, and the demo track
"Midnight Circuit" (Am–F–C–G progression with original melody/bassline) — was
written for this project. No proprietary assets, samples, or source code were used.
