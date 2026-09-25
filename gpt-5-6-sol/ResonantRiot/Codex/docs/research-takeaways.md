# Research Takeaways: Dead as Disco

## Sources consulted

- 80 Level interview with Brain Jar Games, 9 May 2026: https://80.lv/articles/interview-how-dead-as-disco-synchronizes-combat-to-player-uploaded-music
- Game Developer audio and design coverage: https://www.gamedeveloper.com/audio/insight/the-making-of-dead-as-disco-s-soundtrack and https://www.gamedeveloper.com/audio/designing-rhythm-action-gameplay
- IGN Early Access review, 5 May 2026: https://www.ign.com/articles/dead-as-disco-review
- Gematsu game page: https://www.gematsu.com/games/dead-as-disco
- Steam store description and controls: https://store.steampowered.com/app/1854270/Dead_as_Disco/
- OpenCritic listing: https://opencritic.com/game/19599/dead-as-disco

The pages were also saved under `research/` for auditability. This is a design study, not a source of copied game content.

## What the sources establish

1. The action layer is the foundation. A player can improvise movement, attacks, dodges, and counters; the music makes those actions more expressive rather than replacing control.
2. Timing is graded. The IGN review describes attacks that always land on the beat and stronger hits, dodges, counters, and Fever Meter when the player synchronizes. The browser version therefore keeps off-beat actions valid but rewards them.
3. Combat is built around musical structure. The 80 Level interview describes BeatWarping, BPM sections, authored animation markers, event tracks, and moveset syncs rather than a plain metronome.
4. Music is a world-building and encounter-design tool. The reference game ties combat, performance, and a dramatic reunion story together, so the original uses sound restoration as both fiction and level progression.
5. Flow protects readability. The IGN review highlights rapid transitions, moving and grooving, enemy variety, and the ability to exit animations, suggesting that flexibility matters more than one button pressed on every beat.
6. The strongest impact comes from alignment. The interview calls out placing knockouts on the end of a musical sync for extra emphasis. Resonant Riot applies that principle to finisher hits, boss phase changes, and environmental flashes.

## Original design decisions

- The protagonist is Vela, a courier painting a color wake through Luma, not a performer or resurrected idol.
- The combat verbs are light chain, heavy pulse, launch, aerial finisher, dodge, parry, and Overdrive. They are readable from a static browser build and do not imitate the reference game's exact moveset.
- Rhythm rewards are visible through a timing ribbon, Flow grade, damage multiplier, particle color, and short camera punches. They never lock movement or cancel a normal attack.
- Enemy pacing is authored to musical markers. Echo throws on offbeats, Pulse dashes on the next beat, and Sable opens a guard window on the following phrase.
- The boss changes both combat behavior and the soundtrack: phase two begins at a clear drop, raises the BPM from 120 to 144, and turns the arena into a faster call-and-response defense sequence.

