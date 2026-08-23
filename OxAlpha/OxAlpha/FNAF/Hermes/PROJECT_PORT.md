# FNAF-Hermes — Project Port Record

- Harness: **Hermes** (Reika on Hermes Agent by Nous Research, desktop app, Windows)
- Assigned localhost port: **8520** (re-verified free on 2026-08-21 after a port race:
  another agent's process legitimately bound 8420 between our scan and launch; we relocated
  without touching it. Original claim was 8420 — see git history.)
- Server: `python -m http.server 8520 --bind 127.0.0.1` from this directory
- URL: http://127.0.0.1:8520/
- If 8520 is ever occupied at launch time, pick another free port, update this file,
  update test/qa.mjs URL_, never touch foreign processes.

## Isolation rules honored
- All project files under `C:\Users\Epic\Documents\ChatGPT\Ox model test\FNAF-Hermes\`
- No other FNAF-* harness directories exist or were touched.
- Headless Chrome (isolated headless=shell instance) for all automated QA.
- Foreign process on 8420 (PID 11776) left completely alone.
