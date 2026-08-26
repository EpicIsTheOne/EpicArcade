# 🎭 Character Customizer

A layered-2D avatar workshop: mix & match body, hair, face, outfit and extras with
instant SVG rendering, live preview thumbnails, presets, save slots, photo mode and
PNG export. Zero dependencies — pure vanilla JS + generated SVG.

## Run it

Static-file the run directory (no build step) and open `index.html`:

```bash
npx http-server -p 8080        # or: python -m http.server 8080
# → http://localhost:8080
```

Or run the self-contained verification suite (spins up its own isolated server):

```bash
node .e2e/test.mjs             # 36 automated checks + screenshots into shots/
```

## Features

| Area | Details |
|---|---|
| **Body** | 3 poses (relaxed / waving / hips), 3 builds (slim / regular / sturdy), 8 skin tones |
| **Hair** | 8 styles (buzz, crop, bob, long, ponytail, twintails, spiky, curly) × 12 colors |
| **Face** | 8 expressions (cheerful, neutral, smirk, surprised, determined, sleepy, wink, blissful) × 6 eye colors |
| **Outfit** | 8 outfits (tee, hoodie, dress, armor, suit, overalls, tank, coat) × 12 main × 12 accent colors |
| **Extras** | 6 headwear, 4 eyewear, 4 neck & back (cape/scarf/…), 4 finishing touches |
| **Presets** | 6 one-click looks: Adventurer, Pop Star, Scholar, Athlete, Royalty, Night Owl (keys 1–6) |
| **Randomize** | Seeded (URL `?random=1&seed=N`) or unseeded; sparkle burst on every roll (key R) |
| **Save slots** | 3 local slots with live mini previews + autosave of the current look |
| **Photo mode** | Full-bleed stage, parallax tilt, clean backdrop (key P / Esc) |
| **PNG export** | 720×1000 transparent-background download from editor or photo mode |
| **Help** | First-run overlay + `?` shortcut |

## Architecture

```
index.html          app shell (header / options panel / stage / presets+slots rail)
css/style.css       theme, layout, cards, photo-mode chrome, animations
js/character.js     parametric renderer: state → layered SVG string (pure functions)
                    palettes, geometry (bezier limbs, build scaling), 600-state-safe
js/app.js           UI shell: tabs, selection state, presets, slots, photo mode,
                    PNG export, keyboard, URL params, in-page selftest (?selftest=1)
```

The renderer is dependency-free and deterministic — the same state always yields the
same SVG, which makes the seeded randomizer reproducible and the E2E combo smoke exact.

## URL params (also used by the test harness)

`?preset=royal` · `?random=1&seed=42` · `?tab=outfit` · `?photo=1` · `?help=1` · `?selftest=1`

## Verification

`.e2e/test.mjs` (playwright-core, headless Chromium, isolated server on a probed free
port, self-closing) covers: file identity, first-run help, tab/option rendering,
selection persistence, seeded-random determinism, preset application, save→randomize→
load round-trip, slot clear, photo-mode enter/exit **with character visibility**,
PNG download + pixel sanity (transparent corners, painted head/feet), 600-state
validity/distinctness smoke, reset, and zero console/page errors. **36/36 PASS.**

Screenshots: `shots/01…09` (editor states, presets, photo mode, export) and
`shots/zoom-*.png` (high-res diagnostic closeups per hairstyle / preset face).

## Notes

- `localStorage` keys: `cc.state.v1` (current look, autosaved), `cc.slots.v1`, `cc.helpSeen.v1`.
- `.e2e/foreign-probes/` is NOT part of this project (relocated diagnostic PNGs
  from a concurrent session) — see RESULT.md "Concurrent-agent activity".
