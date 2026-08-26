# STARWEAVE — Visual Bible

## One-line pitch
The sky shattered a century ago. Constellation-islands drift through a luminous Aether Sea.
You are the last Weaver: rekindle the Astral Loom, weave fallen starlight into living
companions (the Weaveborn), and hold back the Gloam.

## Art direction
- **Style:** "Celestial storybook" — stylized lowpoly 3D worlds + painted vector-anime 2D portraits.
- **Palette:** deep indigo night (#12102b–#232057), aurora teals (#39d0c4), warm gold (#ffcf6e),
  rose dawns (#ff9e9e). Elements carry accent colors (below).
- **Light:** everything glows a little — starlight is the world's magic. Bloom on crystals,
  runes, weapons, eyes of the Gloam. Soft hemisphere light + golden key.
- **Materials:** clean lambert/toon-ish shading, no realistic textures. Grass = two-tone green,
  stone = cool violet-gray with emissive runes.
- **Recurring symbols:** the Loom (ring-gate of woven light), constellations, moth (Veiled clan),
  sun-halo (Dawn Order), thread/stitch motifs in UI dividers.
- **Enemies (Gloam):** matte void-black soft bodies, single/multi cyan-white pinprick eyes,
  ember-violet smoke. Never humanoid faces — keep them abstract and eerie.

## Element language
| Element | Color | Motif |
|---|---|---|
| Radiance | #ffd76e gold-white | sun halo, rays |
| Umbra | #b06cff violet | moth, eclipse ring |
| Ember   | #ff7847 orange-red | sparks, forge |
| Gale    | #6ee7b7 mint | leaf streaks, wind lines |
| Stone   | #d9a066 amber-brown | strata, crystals |
| Tide    | #5aa9ff blue | bubbles, pearls |

Counter-wheel: Ember→Gale→Stone→Tide→Ember (×1.35). Radiance↔Umbra shred each other (×1.25).

## Character design language
- Silhouette-first: each hero owns ONE signature shape (Solvaine's sun-ring, Vesperine's moth
  veil, Bastienne's tower shield, Pip's rocket hat…).
- Hair = identity: exact hue + highlight band + silhouette locked per character.
- Eyes: large iris with element-tinted gradient + white sparkle; consistent per character params.
- Outfits: adventure-fantasy with faction accents (Dawn white/gold, Veiled dusk-violet lace,
  Cinder red apron-straps, Wayfarers teal).
- Portraits are painted by a deterministic parametric renderer (`js/portraits.js`) —
  the SAME parameter set paints EVERY appearance of a character (roster card, splash,
  dialogue, summon reveal, HUD icon): consistency by construction.

## World architecture
- **Dawnrest Isle** (hub): rolling meadow island under a giant broken ring of the old Loom;
  sanctum gate, elder's terrace, starwell, quest board, merchant cart.
- **Lightbridge** → **Meadowal Fields**: ruins arches, Gloam camps, sunshard pedestals.
- **Gloamwood**: indigo forest, dense trunks, fireflies replaced by drifting ash-motes.
- **Fracture Spire**: shattered observatory rock rising from the sea; boss arena on top.

## UI language
Dark-indigo glass panels, thin gold frames with stitched-corner notches, constellation dots
in backgrounds. Serif display type (Palatino/Georgia stack) with wide letterspacing for titles;
clean sans for body. Rarity: 3★ steel-blue, 4★ violet, 5★ gold with animated shimmer.
No fake countdowns, no fake scarcity — honest rates shown on every banner.
