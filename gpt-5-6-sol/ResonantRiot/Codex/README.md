# Resonant Riot

An original browser rhythm-action brawler about Vela, a courier restoring color and sound to Luma after the Quiet Engine begins broadcasting silence.

## Launch

The project is a self-contained static build. Open `index.html` directly, or serve this folder with:

```text
node scripts/server.mjs
```

Then visit `http://127.0.0.1:4173/`. Click **Enter the Riot** to unlock browser audio. The build uses no runtime package dependencies.

## Controls

| Input | Action |
| --- | --- |
| `WASD` / arrow keys | Move freely |
| `J` / left click | Chain light attack |
| `K` / right click | Heavy pulse and guard break |
| `L` / `Shift` | Launch target for aerial flow |
| `Space` | Dodge dash with invulnerability window |
| `I` | Timed parry and counter window |
| `O` | Overdrive after it is unlocked |
| `P` / `Esc` | Pause |

## Combat system

Combat is live-first. The player can move between enemies, switch targets through a soft nearest-target selection, chain three light variations, use a heavy pulse, launch and pursue targets, dodge through telegraphs, parry, and spend Flow for Overdrive. Enemy attacks have visible telegraph states, distinct projectile/range/guard behaviors, hitstop, knockback, stagger, particles, rings, floating combat text, and camera shake.

## Rhythm system

The original soundtrack is generated as WAV files and ships with the project:

- `assets/audio/resonant_riot_loop.wav`: 120 BPM regular combat loop.
- `assets/audio/boss_whisper_kill_loop.wav`: 144 BPM boss track.
- `assets/audio/beatmap.json`: BPM, beat duration, and authored section markers.

The game uses `AudioContext` and the audio element's playback clock when available, with a deterministic fallback clock for browsers that block local media. A rhythm judgment grades each action as `PERFECT`, `GOOD`, or `OFF BEAT`; off-beat actions remain valid. Perfect timing adds damage, score, flow, brighter impact effects, and stronger hit reactions. Enemy telegraphs, beat pulses, environmental accents, and boss phase changes use the same clock.

## Scoring and style

Flow score combines base hit value, timing grade, move variety, and current Flow. Repeating the same move reduces its variety bonus. Damage and style rank affect the Flow meter. The HUD shows chain count, timing accuracy, grade, score, chapter, section, and boss health. A/B/S grades require a balance of rhythm accuracy and a long chain.

## Enemy types

- **Pulse Drone**: fast melee pressure with short dash attacks.
- **Echo Caster**: ranged projectile caster that attacks from across the stage.
- **Lance Sprinter**: high-speed aggressive enemy with a longer closing attack.
- **Sable Warden**: slower heavy enemy with a recurring guard shield and larger damage.

## Boss

**The Quiet Engine** is a rotating loudspeaker-bus. Phase one teaches the call-and-response loop: telegraph, commit, evade or parry, then punish the shell. At half health, the Engine enters **Overexposure**, raises the combat state and visual intensity, switches to the 144 BPM boss track, and adds faster radial projectiles, shorter shields, and a wider quiet-wave attack. The defeat sequence expands a color ring through the arena and returns control to the ending card.

## Progression

Clearing the first encounter unlocks **Overdrive**, a charged screen-wide resonance strike. The final result also records the earned grade and announces **Rainline Dash**, the next intended upgrade, without making it part of the core requirements of this slice.

## Combat Timeline

| Musical moment | Encounter event |
| --- | --- |
| 120 BPM intro | Vela enters the first crossing and the player learns light, pulse, dodge, and parry feedback. |
| First groove | Pulse Drones establish close-range pressure while Echo Casters introduce off-beat projectiles. |
| First drop | Mixed enemy formation expands the arena and rewards target switching. |
| Sable phrase | The first guarded enemy forces heavy pulses and timing-aware movement. |
| Boss intro | The soundtrack switches to 144 BPM and the Quiet Engine enters. |
| Boss phase one | Shell guard, dash call-and-response, and readable projectile fan. |
| Half-health drop | Overexposure begins: brighter arena, faster patterns, and a wider quiet wave. |
| Boss outro | The Engine falls silent, the city regains color, and the result card reports the run. |

## Research Takeaways

The design study is in `docs/research-takeaways.md`. Research covered developer interviews, reviews, and store/game information about *Dead as Disco* and extracted broad principles: action remains free-form, timing is graded rather than mandatory, music can drive authored events, and combat flow depends on readable transitions and variety. Resonant Riot transforms those principles with a different protagonist, setting, enemy roster, visual language, move set, UI, soundtrack, and boss structure. It does not copy reference characters, story, environments, music, assets, names, levels, or exact encounters.

## Major technical decisions

- Plain HTML, CSS, and JavaScript keep the final artifact portable and auditable.
- Canvas rendering provides a stylized 2.5D visual identity without external libraries.
- Web Audio API plus an `Audio` element provides playback and a stable music clock.
- A local beat map keeps the authored musical structure inspectable and avoids runtime network dependencies.
- `window.ResonantRiot` exposes deterministic state snapshots used by the browser QA harness, not hidden gameplay cheats for normal play.

## External dependencies

No runtime dependencies. The project uses only browser APIs and the included audio files. Playwright is used only by the local QA script and is not required to play the game.

## Known limitations

This is a polished vertical slice, not a full commercial game. It uses procedural canvas silhouettes and original synthesized WAV audio rather than hand-authored skeletal animation or a full sampled soundtrack. The beat clock falls back to simulation time when a browser refuses autoplay, and the slice does not include multiplayer, online leaderboards, save persistence, or user-imported music.

## What I Would Build Next

Add a reusable SongCrafter-style event lane for authored light, camera, and enemy cues; expand Vela into a hand-authored skeletal animation set; add branching encounter rooms and accessibility timing windows; ship a second boss with a call-and-response defense section; and add a local score card plus controller remapping. These are expansion plans, not excuses for missing core slice requirements.

