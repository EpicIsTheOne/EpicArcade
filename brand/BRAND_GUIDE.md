# EPHIX Brand Guide

EPHIX is a mysterious, premium visual system built from the supplied master logo: black, white, and electric blue; hard diagonals; compact uppercase typography; and controlled grit. The logo artwork is locked. Do not redraw, stretch, skew, recolor, crop, or separate the Japanese mark, wordmark, accent, TM, or tagline except by using the supplied approved exports.

## Core tokens

- Ink: `#050608` for primary dark backgrounds.
- Void: `#0B0E13` for application surfaces.
- Paper: `#F4F6F8` for logo white and primary text.
- Steel: `#A8B0BC` for secondary text.
- Electric: `#1769FF` for the blue accent.
- Electric bright: `#3C86FF` for hover and focus only.
- Line: `#26303D` for borders and dividers.

Use Electric sparingly: one dominant blue action or accent per composition. Keep text high contrast. Pair angular panels with generous negative space. Grit belongs in backgrounds, stickers, and large display moments, never behind small body text.

## Asset map

`logos/` contains the locked supplied logo exports. `colors/` contains palette tokens and a swatch sheet. `type/` contains the typography system. `ui/` contains buttons, fields, cards, navigation, states, and loading. `icons/` contains the stroke icon system. `patterns/`, `shapes/`, `textures/`, and `backgrounds/` contain standalone transparent or full-bleed graphic assets. `social/` contains profile, banner, and sticker treatments.

Use SVG files directly in web products or import them into Figma. PNG logo exports are retained for contexts that require raster input. The logo reference used for this kit is the supplied raster master, copied without modification to `logos/ephix-master-reference.png`.

## GPT Image 2 expansion

The `generated-originals/` folder preserves the five original GPT Image 2 outputs. Production-ready copies and crops are under `backgrounds/generated/`, `patterns/generated/`, `textures/generated/`, `social/generated/`, and `stickers/generated/`. The `*-lockup.png` files are composites made after generation using the untouched original logo/icon exports. Do not feed those composites back into logo design or use them as replacement logo masters.

## Typography

Display: `Rajdhani`, `Arial Narrow`, sans-serif, uppercase, tight tracking. UI labels: `Barlow Semi Condensed`, `Arial`, sans-serif. Body: `Inter`, `Arial`, sans-serif. Use uppercase display type for titles and navigation, sentence case for explanatory copy.

## Logo clear space

Maintain clear space equal to the height of the logo's small Japanese line on all sides. On dark backgrounds use the full-color or white export. On light backgrounds use the black monochrome export. Never recreate the wordmark with a font.

## Expanded visual library (style pack 2)

The `generated-originals/style-pack-2/` sheets expand the brand library with 132 extracted assets across eight categories (symbols, stickers, frames, shards, grunge textures, pattern tiles, broadcast graphics, wildcard art). They live in `symbols/generated/`, `stickers/generated/`, `frames/generated/`, `shapes/generated/`, `textures/generated/`, `patterns/generated/`, `broadcast/generated/` and `wildcard/generated/`, with per-asset provenance in `generated-originals/style-pack-2/manifest.json`.

These generated assets **complement** the locked logo, the SVG design system and the original generated backgrounds — they do not replace or supersede them. All items are transparent PNGs carrying the pack's grain and distress; use them as decals, frames, section art and texture overlays following the existing rules: Electric sparingly, grit never behind small body text, and no recoloring of the artwork.
