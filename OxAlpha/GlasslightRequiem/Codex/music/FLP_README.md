# Glasslight Requiem music source

The reproducible master is `compose_requiem.py`. It is intentionally self-contained and uses only the Python standard library, NumPy, SciPy, and FFmpeg. Running it recreates:

- `Glasslight_Requiem.wav` at 48 kHz
- `Glasslight_Requiem.mp3` at 256 kbps
- `score.json` with the section and event timeline
- `analysis.json` with measured duration, peak/RMS, onset times, and frequency-band peaks

Run from the project root:

```text
python music/compose_requiem.py
```

The arrangement is six authored acts in D minor at 124 BPM. It is not a loop export: each act changes harmony, instrument density, percussion, and visual event language. The source uses original procedural synthesis for glass tones, organ-like choir tones, sub bass, percussion, noise sweeps, and impacts.

An `.flp` is not included because the deterministic Python source is the canonical project data for this standalone benchmark artifact. The exported audio is the finished master used by the experience.
