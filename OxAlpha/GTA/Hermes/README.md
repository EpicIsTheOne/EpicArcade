# NEON MERIDIAN — GTA-Hermes

An original browser open-world crime/action game. Built from scratch on
three.js r128 (vendored, no build step). Not affiliated with any existing
game franchise; all content, names, city and characters are original.

## Play

    python -m http.server 8421 --bind 127.0.0.1
    -> http://127.0.0.1:8421/index.html

Port is recorded in PORT.md. Bind is localhost-only.

## Controls (non-inverted, defaults)

| Input | Action |
|---|---|
| Mouse | Camera (right = right, up = up) |
| W A S D | Move (camera-relative) |
| Shift | Sprint |
| Space | Jump / handbrake in vehicle |
| E | Enter/exit vehicle, interact, start mission |
| Right mouse | Aim |
| Left mouse | Attack / fire |
| Q or 1-5 | Weapon switch |
| Esc | Pause (releases pointer lock) |

Invert X/Y exist in Settings and default OFF.

## Content

- 896m procedurally generated city: Meridian Core (downtown towers),
  Ashford Heights (residential), Old Harbor, Rustyard Docks (industrial),
  Halcyon Park, Sable Strand beach + ocean. 172m Meridian Spire landmark.
- 5 story missions (3 contacts: Mara, Dex, Yun) + street race + 10 hidden
  packages + shops (Pay'n'Spray, gun shop, food).
- 7 vehicle classes with distinct handling, damage, lights.
- 5-star wanted system, witness-driven crimes, pursuit + search AI,
  foot cops, respray to clear heat.
- Day/night cycle, sunset/dawn, stars, rain, fog, bloom + color grade,
  emissive windows, traffic lights, street lights.
- Save/load (autosave every 45s + manual), settings with live quality
  switching (Ultra/High/Medium/Low/QA).

## Tests

    node tests/test_controls.js   # 35 checks — non-inverted control contract
    node tests/test_citygen.js    # 21 checks — city layout validity

## Layout

    js/core     config, utils, controls_math, input, state, game, grade
    js/world    citygen (pure data), world builder, procedural textures
    js/entities vehicle, player, npc (peds/traffic/police)
    js/systems  sky, combat, wanted, missions, audio
    js/ui       hud, menus
    tests       node-run test suites
