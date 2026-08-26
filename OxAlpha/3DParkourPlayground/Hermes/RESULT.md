# RESULT — 3D Parkour Playground · piagent run-01

**Status: ✅ COMPLETED & VERIFIED** (continuation session, 2026-08-26 ~04:10–04:45)

## Deliverable

**SKYLINE DASH** — a compact 3D parkour speedrun playground.
- **Canonical entry: `index.html`** at this directory's root (`vendor/three.min.js` r1xx local copy, `css/style.css`, `js/{input,audio,fx,world,player,ui,main}.js`). Boots from `file://` and from any static server.
- Course: start → A gaps → B slide gates → C dash gaps → D wall-run pit → E chimney climb → F finale → finish; 5 checkpoints, deaths counter, medals (GOLD ≤50s / SILVER ≤80s / BRONZE ≤130s), persistent PB (`skyline_pb_ms`), free-roam mode, help overlay (H), pause (Esc).
- Movement: walk 6 / sprint 10 m/s, jump 8.6 m/s (coyote + buffer), slide (boost →13.8, hitbox 0.85→0.45), dash ×2 charges (17 m/s burst, regen 2.8/s, one air-dash), wall-run (12.5 target, stick + exit push), alternating chimney wall-kicks.
- Procedural WebAudio SFX; HUD: checkpoint, timer, PB, dash pips, speedometer, state tag (SLIDE / WALL RUN).

## Verification (this session, fresh runs against current tree)

| Suite | Result |
|---|---|
| `.e2e/test.skydash.mjs` (canonical, 43 checks) | **43 PASS / 0 FAIL** |
| `.e2e/test.verify-run01.mjs` (independent, 13 checks, own server 23400+) | **13 PASS / 0 FAIL** |

Coverage: served-file identity markers, behavioral `window.PK` API identity, boot, controls direction (fwd ⇒ −Z at yaw 0), walk ≈6 / sprint ≥8.4 m/s, jump impulse + landing, dash burst 17 / charge consumption / regen, slide engage + hitbox 0.45 + boost + **passes under gate 1**, wall-run engage (correct side −1) + sustain across pit, 2 alternating wall-kicks + height gain, checkpoint touch, death + respawn at CP, reset/forceStart/timer format, finish overlay at gate + PB persist, HUD PB after reload, `file://` boot with 0 errors, zero console/page errors throughout.

**Visual inspection:** all fresh `shots/e2e-01…06` + `shots/verify-01…05` reviewed — intro card, course start ring, slide-under-gate, wall-run with camera roll, finish overlay (GOLD/PB), free-roam plaza. All coherent; no rendering defects found.

## Fix landed this session

- **T6 slide test made event-driven** (twin's edit, accepted): the 03:59 `FRICTION_INPUT` buff let a standstill sprint reach the gate-1 face (z≈−67.15) inside the old fixed 750 ms window, pinning the player at v=0 before the slide key registered — game correct (gates must be slid under), test timing stale. Runway start moved −62→−57; slide now engages at speed with margin. Both instances independently diagnosed the same root cause (this instance via `.e2e/probe-slide.mjs`, removed after use).

## Late-session source fixes (03:59, pre-continuation — re-verified this session)

- `player.js`: wallrun normals `n.nx/nz` → `n.x/z` (matched world cast normals), wall-probe reach 0.22→0.45, `FRICTION_INPUT=1.8` while steering (sprint top speed reachable), stage tags for debugging.
- `audio.js`: NaN speed guard.

## Same-run twin coexistence (playbook v3 case)

A parallel instance of THIS run ("MOMENTUM", instance-A) worked the same dir concurrently. Cooperative convergence, no clobber war:
- It archived its variant sources at `.e2e/.momentum-run01-src/` (now incl. its own `effects.js`, `main.js`, `player.js`, `world.js`) and wrote the independent verifier `.e2e/test.verify-run01.mjs` (acknowledges SKYLINE DASH root build as canonical per its pre-declared 03:36 plan; uses its own port, never touches 20504). It also decluttered its stray `js/effects.js` out of `js/` — root `js/` is now exactly the 7 canonical modules.
- It completed its own continuation pass (~04:11–04:35): same slide-test diagnosis and fix, independent 13/13 PASS, its own README/RESULT draft (since superseded by this file — this instance's doc write landed after its teardown; its unique facts are merged here), improved its verify free-roam shot to click through `#btnRoam`, and at teardown **intentionally killed server PID 42236** (recorded for its session) — which is why this instance found the port dead and restored it (below).
- Both instances converged on identical diagnoses (slide-test timing) and both suites now pass against the same canonical build. Cross-verification = strong signal the build is correct.
- Backup of canonical source at 03:34: `.e2e/backup-skydash/` (diff vs current = only the two 03:59 fixes above).

## Runtime state at handoff

- Static server **left running**: http://127.0.0.1:20504 — Windows PID **37320** (node), recorded in `server.json`. Teardown may kill exactly that PID; nothing else. (History: original server PID 42236 was intentionally killed by the twin instance at ITS teardown — by design, not a crash; this instance restored the server on the same recorded port via `.e2e/start-server.cmd`, identity + asset serving re-verified.)
- `tools/` is empty (early scaffolding moved to `.e2e/`); `.e2e/probe*.mjs` are diagnostic scripts, kept for provenance.

## Known notes

- Finish-overlay times in shots are test-driven (teleport-to-finish), not human runs — medals thresholds are tuned for real play.
- Node prints a benign libuv `async.c` assertion on playwright-core teardown after `process.exit(0)`; tests complete before it, exit-code noise only.
