# RESULT — Resonant Riot
- **Project:** Resonant Riot
- **Model:** gpt-5.6-sol
- **Harness:** Codex
- **Run:** oxa-manual-codex-20260925
- **Benchmark:** Run-level result; no prompt ID assigned
- **Status:** completed

## What was built

Resonant Riot is a self-contained original rhythm-action beat-'em-up vertical slice. It includes a title and control primer, two regular encounters, three primary regular enemy behaviors plus a fourth pressure enemy, beat-graded light/heavy/launch/aerial/dodge/parry combat, Flow scoring, Overdrive progression, a two-phase music-driven boss, and a complete result sequence.

## Launch

Open `index.html`, or run `node scripts/server.mjs` and open `http://127.0.0.1:4173/`.

## Verification

- `test/qa.cjs` completed a real browser playthrough on port 43127.
- Title, primer, combat, boss entrance, result, and restart paths rendered.
- Keyboard actions, damage, movement, target selection, score, timing judgment, enemy states, boss phase two, defeat, and result handoff were observed in live state.
- Both original WAV tracks returned HTTP 200 with content lengths above 1 MB.
- Observed BPMs: 120 for regular combat and 144 for the boss.
- QA report: `test-results/qa-report.json`.

## Known notes

No runtime external dependencies. The build uses procedural canvas characters and original synthesized WAV music. See `README.md` for the full limitations and design rationale.
