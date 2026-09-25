# Resonant Riot: Vertical Slice Design

## Core promise

Resonant Riot is a free-flow rhythm-action brawler about a courier restoring color and sound to a city. The player can move and attack between musical beats, but attacks that land on authored beat markers grow stronger and more stylish. The design treats rhythm as pressure, choreography, and escalation rather than a gate that stops play.

## Player-facing loop

1. Move with WASD or arrow keys.
2. Chain light attacks with J or left click.
3. Break enemy guard with a heavy pulse using K or right click.
4. Launch a target with L, then use a timed aerial finisher while airborne.
5. Dodge with Space, with a short invulnerability window.
6. Parry with I, then counter on a nearby beat for a larger hit and score.
7. Spend meter with O for a screen-clearing Overdrive.

## Combat and style

The player is a courier named Vela, moving through the flooded mural district of Luma. Her attacks paint temporary color into a monochrome world. Hush drones are enemies that drain resonance, a blocking Sable, a ranged Echo, and a dash-hunting Pulse. The Resonance system rewards variety, clean defense, and beat accuracy while a visible Flow meter drains after taking damage or repeating the same move.

## Structure

- Opening card: one-screen controls primer with optional practice targets.
- Beat 1: Calibrate the chorus, a tutorial encounter with Pulse and Echo.
- Beat 2: Paint the crossing, a larger mixed encounter with all three regular enemies and a Sable finisher.
- Boss: The Quiet Engine, a rotating loudspeaker-bus that alternates call-and-response pulses, shield windows, and a final exposed core phase.
- Ending: The city’s murals flare back to color and the run summary shows grade, accuracy, best combo, and unlocked ability.

## Music model

The original 120 BPM `resonant_riot_loop.wav` is used for the tutorial and regular encounters. The original 144 BPM `boss_whisper_kill_loop.wav` starts on the boss title drop and switches to a brighter, faster mix during phase two. `assets/audio/beatmap.json` stores BPM, bar markers, and section labels. The game derives a stable beat clock from `AudioContext.currentTime`, not frame time, and uses the same marker to trigger music pulses, hit evaluation, enemy telegraphs, and environmental accents.

## Research transformation

Research sources describe a rhythm-action game as a free-form action system where attacks, counters, dodges, transitions, and enemy behavior align to music, with authored sync points and a forgiving fallback. Resonant Riot keeps the underlying principle of beat-warped anticipation and musical call-and-response, but changes the fiction, controls, visual language, enemy roster, and boss structure. It uses a simple authored beat map instead of copying a reference game's data or assets.

