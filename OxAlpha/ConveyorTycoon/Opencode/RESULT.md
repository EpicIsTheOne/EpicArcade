# RESULT.md

**Project:** Conveyor Tycoon
**Model:** `openrouter/stealth/ox-alpha`
**Harness:** `opencode`
**Run:** `02`
**Benchmark:** `sweep-9f1928d5-7699-4740-b15f-7ecd66b41648`
**Status:** ✅ **completed**

## What was built

A polished, single-file browser factory tycoon: place extractors on ore
deposits, drag-paint conveyor lines, refine through multi-recipe machines
(Smelter → Assembler → Fabricator), and sell at the Market. Real-time item
simulation with visible items, spacing and jams; placement preview with
rotation; 70% demolition refunds; hover tooltips with live buffers/progress;
global upgrades (Belt Speed, Machine Overclock); objectives; income sparkline;
procedural audio; autosave/resume. Compact 30×22 map.

Four production tiers across 10 item types (ore → ingots → steel/gear/wire →
circuit → robot $190).

## Launch

Open `index.html` in any modern browser (double-click works — the file is
fully self-contained: zero external scripts, styles, fonts or network calls).
Or serve statically: `node tools/devserver.mjs`.

## Verification performed (headless Chromium via Playwright, isolated session)

- Boot: intro renders, zero console errors
- "Start Building" dismisses intro; real mouse clicks reach the canvas
- Real-input placement: belt placed by click; 5-belt line laid by one drag
  (auto-turning); `R` rotates buildings; right-click demolishes with correct
  70% refund ($10 belt → +$7)
- Economy end-to-end: extractor mined 17 ore in 30 s → smelter converted to 7
  ingots → 6 sold for $72; income stabilised at ~$144–156/min; balance grew
  $250 → $526 → $670+ while unattended
- Stats panel: live income sparkline, production tallies, upgrade shop with
  affordability gating, objective checkmarks (first_sale completed)
- Persistence: save → reload → "Resume Building" prompt → exact state restored
  ($526 / 9 cells / $276 earned; extractor+smelter+seller chain intact)
- `file://`-safety: verified zero external references by construction

## Screenshots (in `shots/`)

- `01-intro.png` — title screen
- `final-01-factory-running.png` — working iron line, $670 @ +$144/min, items on belts
- `final-02-stats-panel.png` — stats/upgrades/objectives with income sparkline
- `final-03-help.png` — in-game controls reference

## Major known issues

None functional. Notes:

- The run was impacted by a concurrent duplicate writer (a parallel session
  on the same reserved folder) that repeatedly overwrote sources mid-build.
  Resolution: adopted the furthest-along codebase (`.src/*` + single-file
  bundler), fixed a shipped showstopper — `#intro[hidden]` was still
  `display:flex`, so an invisible overlay swallowed every mouse click —
  patched in `.src/style.css` (`[hidden] { display:none !important; }`),
  killed the stale canonical-restoring watchdog, and rebuilt.
- `tools/ct-canonical.html` is the bundler's canonical output copy; harmless.

## Cleanup

Dev servers used for testing were terminated (ports 51535 / 51397); the
canonical-restoring watchdog process was stopped after the final rebuild.
No background processes remain.

## Duration / turns

Roughly 75 minutes wall-clock across multiple provider-interrupted
continuations; ~140 tool calls.
