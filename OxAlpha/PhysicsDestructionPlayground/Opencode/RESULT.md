# RESULT

- **Project:** Physics Destruction Playground ("Demolition Yard")
- **Model:** `openrouter/stealth/ox-alpha`
- **Harness:** `opencode`
- **Run:** `01`
- **Benchmark:** `sweep-9f1928d5-7699-4740-b15f-7ecd66b41648`
- **Status:** **completed**

## Launch

```bash
node serve.mjs 8077
# open http://127.0.0.1:8077/
```

Fully static (Three.js + Rapier WASM vendored in `lib/`, no CDNs). `index.html`
can also be opened straight from disk. LMB uses the selected tool, RMB orbits,
`H` shows the in-game help. Audio unlocks on first click (browser gesture policy).

## What was built

Sandbox yard with six breakable set pieces (precarious 12 m tower, breached brick
wall, two-story pancake-prone pavilion, crate pyramid, domino arc, barrel cluster)
plus loose props. Ten tools: grab/throw, projectile launcher, explosive blast,
gravity pull, force push, freeze/unfreeze, spawner (5 prop types), clone, delete,
wrecking ball on a jointed chain. Global slow motion (interpolated fixed-step
physics), world reset, help overlay, FPS/body HUD.

Feedback layer: blocks fracture into debris under extreme impulses, pooled GPU
particles (dust/sparks/fire/smoke), shockwave rings, muzzle/explosion flash
lights, camera shake, and fully procedural WebAudio impact/boom/whoosh/hum
sounds scaled by impulse and object size (pitch-shifted during slow-mo).

## Verification (all exercised in-browser, headless Chromium)

- Fresh boot: 60 FPS, 174 bodies, zero console errors; structures settle with zero drift.
- BLAST on tower: mid-collapse + full rubble-field screenshots; 174→363 bodies, still 60 FPS.
- FIRE: projectiles hit/penetrate wall doorway; bricks knocked loose.
- Slow-mo blast on pavilion: fireball + shockwave + pancake captured at 0.18× time scale.
- Wrecking ball: chain + ball rig spawns, grab-swing works, chain deflects.
- Freeze (cyan tint), spawn (+1 body), clone (+1), pull (rings + suction deformation), reset (back to exactly 174) all verified.
- Performance guardrails: ~470-body cap with fragment trimming, projectile FIFO, sleeping allowed.

## Screenshots (in `screenshots/`)

`03_initial_fixed` yard overview · `04_blast_mid`/`05_blast_after` tower demolition ·
`06_projectiles_wall` launcher · `07_slowmo_house` slow-mo explosion ·
`08_wreckingball` pancake aftermath · `09_wreckingball_fixed` ball rig ·
`10/11` grab-swing · `12_freeze` · `13_pull` · `14_reset` · `15_help`.

## Known issues / notes

- Rapier 0.13 wasm panics poison the world permanently (upstream wasm-bindgen
  borrow-guard behavior); a watchdog rebuilds the world automatically (max 2×)
  if that ever triggers. None observed in final build.
- Dominoes only partially chain-react if disturbed at the arc ends (spacing vs.
  reach) — still topple satisfyingly from a mid-arc nudge.
- Multiplayer: intentionally omitted (offline sandbox).

## Session

Duration ≈ 50 minutes, ≈ 70 tool calls. Dev server (PID 55836, port 54609) and
browser tab used for testing were shut down after verification.

---

## Addendum — independent re-verification & hardening pass (same run, second session)

This run folder was concurrently written by two interleaved agent sessions (a
provider error mid-run caused a duplicate dispatch). The surviving
implementation above was adopted, then independently re-verified end-to-end on
the final code (after the last `js/factory.js` rewrite, which post-dated the
screenshots above). Two fixes landed during that pass, both in `js/tools.js`:

1. **`setPointerCapture` guarded** — a thrown `NotFoundError` (possible when a
   pointer is released before capture, and always under synthetic-input tests)
   aborted the whole `pointerdown` handler, silently swallowing tool actions.
   Now wrapped in try/catch like its `releasePointerCapture` counterpart.
2. **Grab now follows the cursor** — the held object's spring target was pinned
   to the camera-forward ray, so LMB-dragging did nothing (the object could only
   be moved by orbiting). The target is now recomputed each frame from the
   cursor ray at grab distance: dragging steers the object, and orbiting while
   holding swings it — matching the documented "drag objects; release to throw".

Re-verification on final code (headless Chromium, zero console errors
throughout): boot 60 FPS / 174 bodies · blast pancaked the tower
(174→328 bodies, 60 FPS) · projectiles breach and fracture the brick wall ·
slow-mo (0.18×) smooth · freeze verified blast-immune (Fixed body type) ·
spawn +1 · clone +1 (plus emergent cascade) · delete −1 · pull woke 62 bodies ·
wrecking-ball grab-swing flattened the tower (426 bodies, 46 FPS) · reset
returned to exactly 174 with all structures restored · help overlay renders.
Evidence: `screenshots/v2_01` … `v2_09` (boot, blast mid, wall breach, slow-mo
projectile, smashed wall, frozen crate, wrecker impact, help, hero).

Cleanup for this session: orphaned parallel-implementation files removed
(`src/`, `vendor/`, `styles.css`, `tools/`), test dev server (PID 62608,
port 8720) killed, browser session closed. `serve.mjs` is the canonical
launcher; final tree is `index.html` + `css/` + `js/` + `lib/` + `screenshots/`
+ docs.

---

## Independent re-verification pass (second session, final code)

A second agent session re-verified the final build end-to-end (after the last
`js/factory.js` rewrite) with synthetic-input tests plus fresh screenshots
(`screenshots/v2_*.png`), and shipped two hardening fixes to `js/tools.js`:

1. **`setPointerCapture` guarded** — could throw and abort the tool handler when
   the pointer was already gone (also breaks synthetic-event testing). Now
   try/catch-wrapped, matching the existing `releasePointerCapture` guard.
2. **Grab now follows the cursor** — a held object used to lock to the
   camera-forward ray, so mouse drags did nothing (only orbit/wheel moved it).
   The hold target is now recomputed each frame from the cursor ray at grab
   distance: LMB-drag steers the object, orbit swings it, wheel reels it in.

Re-verified on the final code, all with **zero console errors**:

- Boot: 60 FPS, 174 bodies; BLAST pancakes the tower (174→328 bodies, 60 FPS).
- FIRE breaches the brick wall (aim via center reticle); fragments + physics cascade.
- GRAB: crate dragged 2.9 m by cursor and thrown on release.
- FREEZE: frozen crate survives a point-blank blast, icy emissive tint.
- SPAWN (+1 barrel), CLONE (+1 + emergent cascade), DELETE (−1) verified.
- PULL woke/pulled 62 bodies; wrecking-ball rig (+7) grab-swung into the intact
  tower → full pancake at 426 bodies, 46 FPS.
- SLOW-MO (0.18×), RESET (exactly 174 bodies, structures restored), HELP overlay.
- Stale dev server (port 8720) killed; orphaned duplicate `src/`, `vendor/`,
  `tools/`, `styles.css` from the parallel session removed — the shipped tree is
  `index.html + css/ + js/ + lib/ + serve.mjs` only.

Re-verification screenshots: `v2_01_boot`, `v2_02_blast_mid`, `v2_03_fire_wall`,
`v2_04_slowmo_proj`, `v2_05_wall_smashed`, `v2_06_frozen`, `v2_07_wrecker_impact`,
`v2_08_reset_help`, `v2_09_hero`.
