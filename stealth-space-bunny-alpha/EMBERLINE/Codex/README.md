# EMBERLINE: Last Nightmail

An original 2D side-scrolling action RPG vertical slice built from scratch with HTML5 Canvas, vanilla JavaScript, CSS, and procedurally synthesized Web Audio. No third-party game, art, or audio assets are used.

## Concept

The Nightmail is a living storm railway that stores forgotten memories in its luggage compartments. You play **Mira**, a Lantern Warden who fights back the **Static Choir** before the final carriage tears open. The route covers a rain-soaked platform, a moonlit forest, a signal-tower climb, and the exposed locomotive deck.

The visual identity is a cut-paper theatrical silhouette: deep indigo night, hot lantern orange, electric cyan, bone-white rain, and bold red phase escalation. Every character, prop, particle, and interface element is drawn procedurally.

## Controls

- Move: `A` / `D` or Left / Right Arrow
- Jump: `W`, Up Arrow, or Space
- Light combo: `J`
- Heavy attack / combo finisher: `K`
- Storm ability: `L`
- Dash: `Shift`
- Interact: `E`
- Pause: `Esc` or `P`
- Restart after death or victory: `R`
- Mute audio: `M`

Touch controls are included for mouse and touch devices.

## Engine / Framework

- HTML5 Canvas 2D, vanilla JavaScript modules, CSS, and the Web Audio API.
- No runtime dependency is required.

## How to Launch

Open `index.html` directly in a modern browser, or run:

```powershell
npm run play
```

Then open `http://127.0.0.1:4173` (or the port set in `PORT`).

## Combat Mechanics

- Three-hit lantern combo with distinct reach, launch, and finisher windows
- Heavy attack that breaks shield armor and staggers nearby targets
- Directional air combo with a different finisher behavior
- Storm Nova, an area burst powered by rechargeable signal charges
- Shoulder dash with invulnerability frames
- Damage, armor, stagger, knockback, hitstop, particles, damage numbers, screen shake, and impact flashes
- Charged Ember Core pickup that powers the special and extends maximum resolve

## Enemy Types

- **Cinder Skater**: fast rusher with a telegraphed lunge
- **Tin Chorister**: armored support enemy that blocks frontal light attacks
- **Courier Spark**: fast flying harasser with dive attacks
- **Bellwether**: heavy shockwave brute with armor and windup
- **The Conductor**: two-phase boss with staff sweeps, rail bolts, shockwaves, adds, and a defeated-howl sequence
- **Steam Warden**: lane-switching mini-boss guarding the final gate

## Progression Systems

The route contains three fixed **Ember Cores** and four **Sigil Fragments**. Sigil fragments fill the Ember Track. Every level grants permanent run bonuses to maximum health, light damage, Storm Nova damage, and signal capacity. Bosses award the Warden's Star. Completion requires defeating both The Conductor and the Steam Warden.

## Level Structure

1. **Rain Platform** - tutorial combat, first encounter, Ember Core, rail jump
2. **Moonlit Forest** - mixed encounter, bridge, high ledges, second Ember Core
3. **Signal Tower** - vertical rail ascent, flying enemies, Bellwether, steam vents, sigil shrine
4. **Locomotive Deck** - Conductor phase one, Steam Warden escalation, Conductor phase two, ending

## Major Technical Decisions

- Fixed-step simulation with a capped accumulator keeps combat deterministic.
- Swept X/Y collision and one-way platform eligibility support authored level geometry.
- Enemy AI uses telegraph, active, recovery, cooldown, and stagger states.
- Audio is generated at runtime, so the project has no binary asset dependency.
- Fixed internal canvas resolution and letterboxed scaling keep gameplay consistent across display sizes.
- Deterministic combat formulas live in `src/game/combat.js` and are unit-tested in isolation.

## Testing

```powershell
npm test
```

The game includes a deterministic browser QA mode: open with `?qa=1`, press `0` to create a bot, then press `9` to start full-route verification. `?qa=1&bot=1` starts it automatically. QA reports checkpoint, encounter, boss phase, route completion, and error count.

The real-browser smoke test uses the installed Chrome runtime. Start the local server in one terminal, then run the test in another:

```powershell
# Terminal 1
$env:PORT = "4187"
npm run play

# Terminal 2
$env:PORT = "4187"
npm run test:browser
```

## External Resources / Dependencies

None at runtime. The game uses browser APIs, local source files, and procedural generation only.

## Known Limitations

- Combat is tuned primarily for keyboard and pointer input; touch support is present but not extensively ergonomically tuned.
- The route is a complete authored vertical slice, not a procedural roguelite.
- Audio begins after the first user gesture to comply with browser autoplay rules.

## What I Would Add Next

- A branching character route with shared respec at the Lantern Halt
- Weapon infusions and relic synergies layered onto the Ember Track
- Local co-op with independent combo scaling and assist difficulty
- Reduced-shake, color-safe-tell, remapping, and difficulty accessibility options
- A second Nightmail route with moving platform schedules and vertical parallax
- Seeded challenge contracts while preserving the authored story encounters
