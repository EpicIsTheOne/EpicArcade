# SKYLINE DASH — Parkour Playground
### 3D Parkour Playground · sweep-9f1928d5 prompt-31 · piagent run-01

A compact 3D parkour speedrun playground built with **three.js (local `vendor/three.min.js`, no CDN) + vanilla JS**. Zero build step, zero runtime dependencies beyond the vendored three.js.

## ▶ Run it

**Canonical entry: `index.html` (this folder's root).**

- Either open `index.html` directly (`file://` boots fine — verified), or
- serve the folder statically. A static server is currently **running**:
  - **URL:** http://127.0.0.1:20504
  - Windows PID **37320** (recorded in `server.json`; kill only that PID at teardown). If it's down: `cmd /c .e2e\start-server.cmd` restarts it on the same port.

## 🎮 Controls

| Key | Action |
|---|---|
| **WASD** | Move |
| **Shift** | Sprint |
| **Space** | Jump / Wall-jump (with coyote time + input buffer) |
| **C** | Slide (boosts speed, lowers hitbox — slide under gates) |
| **Q** | Dash (2 charges, regenerating; air-dash once per airtime) |
| **R** | Restart run |
| **H** | Help overlay |
| **Esc** | Pause / release pointer lock |

## 🏁 The course

Start line → **A** basic gaps → **B** slide gates (underside y=3 — stand and you bonk) → **C** dash gaps → **D** wall-run pit (wall on the left; commit or fall) → **E** chimney wall-jump climb → **F** finale descent → finish gate. 5 checkpoints; falling respawns you at the last one (deaths counted).

**Medals:** 🥇 GOLD ≤ 50s · 🥈 SILVER ≤ 80s · 🥉 BRONZE ≤ 130s. Personal best persists in `localStorage` (`skyline_pb_ms`) and shows on the HUD.

**Shortcuts for route nerds:** S1 high beam past the slide gates, S2 risky mini-pad hops across the wall-run pit.

**Free roam:** after a finish (or via the overlay) — practice every move with no timer.

Movement tech: sprint 10 m/s top speed, slide boost to ~13.8 m/s, dash burst 17 m/s, wall-run target 12.5 m/s, alternating chimney wall-kicks.

## 🧪 Verification

- `.e2e/test.skydash.mjs` — canonical suite (43 checks): identity fingerprinting, boot, controls-direction, walk/sprint speeds, jump, dash (burst/charge/regen), slide (engage/hitbox/boost/**pass-under-gate**), wall-run (engage/side/sustain), chimney wall-jumps, checkpoint + death respawn, timer/finish/PB, reload persistence, `file://` boot, zero console/page errors. **43/43 PASS.**
- `.e2e/test.verify-run01.mjs` — independent cross-verification suite (13 checks, own server on 23400+). **13/13 PASS.**
- Screenshots: `shots/e2e-01..06*.png` + `shots/verify-01..05*.png` — all visually inspected.

See `RESULT.md` for the full verification report and session notes.
