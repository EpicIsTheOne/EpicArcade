# RESULT — Glasslight Requiem

- **Project:** Glasslight Requiem
- **Model:** gpt-5.6-sol
- **Harness:** Codex
- **Run:** oxa-manual-audiovisual-20260925-26 / oxa-manual-audiovisual-20260925-40
- **Benchmark:** Manual benchmark result for prompts 26 and 40
- **Status:** completed

## What was built

An original 96.9-second audiovisual experience about one ember surviving inside a sealed observatory. The music is deterministic procedural composition, and the visuals are an authored six-act Canvas film synchronized to the same score timeline.

## Launch

```text
python -m http.server 4191 --bind 127.0.0.1
```

Open `http://127.0.0.1:4191/`.

## Verification

- `music/Glasslight_Requiem_preview.mp3` decoded successfully with FFmpeg.
- `node --check app.js` passed.
- Chromium QA checked the real audio buffer transport, all six sections, ending, replay, pause, and a 390x844 mobile layout.
- A live HTTPS performance probe measured about 29.6 FPS at 1440x900 in headless Chromium after glow/particle optimization, with no page errors.
- An uninterrupted live HTTPS pass completed the full 96.903-second piece in 97.578 seconds, reached `96.903`, showed the ending card, and reported no page errors.
- Browser report: `qa/browser_report.json`.
- Screenshots: `screenshots/01-intro.png` through `screenshots/08-mobile-intro.png`.
- Ephix route: `https://techexplore.us/OxAlpha/GlasslightRequiem/Codex/`
- Tracker rows: prompt 26 `oxa-manual-audiovisual-20260925-26` and prompt 40 `oxa-manual-audiovisual-20260925-40`.

## Known notes

The artifact is a static experience with no required runtime server. The high-resolution WAV and composition source are included locally. The public Ephix route is served by the documented arcade fallback. Community listing was not created because the configured Ephix Community profile is not signed in; the tracker rows and public route are complete.
