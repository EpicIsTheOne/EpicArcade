# MINDLESS — Reference Study (Pass 1–2 Findings)

Everything below was extracted READ-ONLY from the original projects on this PC.
Originals (untouched):
- `C:\Users\Epic\Documents\tsa-game` — Godot 4.5 project (TSAGame), the original MINDLESS build
- `C:\Users\Epic\Documents\tsa-game - Codex MCP` — evolved competition build (Nationals update)
- `C:\Users\Epic\Documents\Codex\2026-07-14\mindless-stage3-music-rescue` — earlier work dir
- `C:\Users\Epic\Documents\Adobe\...\MINDLESS Demo Video.PRV` — demo video previews (Media Encoder)

## 1. What MINDLESS is
A 240×135 native-resolution pixel beat-em-up (integer-scaled to 1920×1080) where two twins
swap on the fly between **melee aggression** and **rhythm-ranged combat**, set in a cyberpunk
world conquered by the MIND network. Music is the core system: a BeatManager autoload derives
all combat timing from the audio clock.

## 2. Core loop / architecture (original)
- Autoloads: `EntityManager` (spawns/signals), `BeatManager`, `StageManager`, `DamageManager`, `SoundPlayer`.
- `world.gd` loads stages in order, owns camera (forward-only follow), fade transitions, music init.
- Stages: `BossTest, tutorial, stage_01, stage_2, stage_3` with BPMs `[140,140,118,130,140]`.
- Checkpoints: camera lock, arena boundary walls, spawn waves capped at `nb_simultaneous_enemies`,
  "ONWARD!" arrow on clear. Last checkpoint of stage = stage complete.
- Characters share one `Character` base: states IDLE/WALK/ATTACK/TAKEOFF/JUMP/LAND/JUMPKICK/HURT/FALL/GROUNDED/DEATH/FLY/PREP_ATTACK/SWAP.
  Pseudo-3D: `height` (z) with GRAVITY=600, sprite drawn at `-height`; shadow on ground.
- Hit types: NORMAL, POWER (launch: FLY state + flight_speed), KNOCKDOWN (FALL + knockdown_intensity).
- Collateral damage: flying bodies knock down others (0 dmg, KNOCKDOWN).
- Death: FALL → GROUNDED (duration) → DEATH, fade out.

## 3. BeatManager (the heart)
- BPM per stage/boss; `sec_per_beat = 60/bpm`; beat events derived from
  `playback_position + time_since_last_mix - output_latency` (audio-clock derived, NOT frame counts).
- Grades: PERFECT ≤0.09s, GOOD ≤0.17s, OKAY ≤0.24s, else BAD. Input offset +0.05s.
- Master track drives looping; metronome is a second synchronized AudioStreamPlayer.

## 4. Player (twins)
- One body, two visuals: `EcliptioVisual` / `NovaVisual`. Swap = E, 500ms cooldown, idle/walk only.
- **ECLIPTIO** (red jacket): punch anim frames `[1,3,2,0]` over 0.15s; combo advances only after a
  successful hit (`is_last_hit_successful`), else resets to 0. Jump (X/Space) — Ecliptio only.
  Jumpkick (attack while airborne) = KNOCKDOWN + POWERMOVE sfx. Attack = C.
- **NOVA** (green jacket): attack = auto-target nearest enemy preferring facing side; fires a music-note
  projectile graded by the beat:
  - damage: base 2 × (PERFECT 2.0 / GOOD 1.3 / OKAY 1.0 / BAD 0.6)
  - speed:  base 100 × (1.6 / 1.3 / 1.0 / 0.8)
  - knockback: base 100 × (3.5 / 1.5 / 1.0 / 0.6)
  - 200ms cooldown. **Nova cannot jump.** Swapping to Nova unmutes the metronome track (audible click layer) — authentic mechanic.
- Player heal to full on boss start (authentic `reset_healh`).

## 5. Enemies (MIND units — little monitor-headed drones on treads)
- **Basic** (red screen): reserve a slot around player, walk to it, PREP telegraph, punch, cooldown.
- **Dasher** (red): retreat if <28px, space to ~95px, windup 160ms, dash 220ms @320px/s, recover 320ms.
- **Elite Dasher** (green screen): same but stronger.
- **Shooter / music_enemy**: keeps range, fires music notes (green/orange note projectiles exist).
- Enemy slots: max simultaneous positions around the player; enemies always face the player.

## 6. Bosses (all beat-gated: they act ON the beat)
- **EVANGELINE** (Oblitus Slums, 104 BPM): hovering drone, red wing-blades, red-eyed faceplate.
  Phase 1: one shockwave LEFT per beat + hover step (3 steps then reverse). Phase 2: double shockwave.
  After 6 attacks → vulnerable 3s (alpha fades to 0.45). Invulnerable otherwise.
- **EDEN** (Ruined Paradise, 144 BPM): giant red pixel smiley face in darkness. Every beat pulses its core
  (pink armored / green vulnerable ring). Every 4th beat: 3-note fan (phase 2: 5-note), else aimed note with
  travel time = 2 beats (speed clamp 90–260). Steps across the arena every 4 beats. 6 attacks → vulnerable 4s.
- **ANGELICA** (MIND Facility, 140→134 BPM): purple oni-mask face. Phase 1: spawns waves of 3 random enemies,
  vulnerable until the wave dies. Phase 2: double downward shockwaves. Vulnerable window flickers (alpha 0.35–1).
- Boss music map: EVANGELINE `104 bpm - Rythmic`, EDEN `144bpm - Eden`, ANGELICA `140bpm, 134bpm - Angelica` (BPM changes mid-fight).

## 7. Campaign (RunManager STAGES + STORY — verbatim structure)
1. COMBAT TRAINING (tutorial, non-competitive) — DRONE/ECLIPTIO/NOVA dialogue.
2. KONTRAU MENSO (resistance tutorial) — resistance teaches swap; "Ecliptio breaks armor; Nova controls the rhythm."
3. OBLITUS SLUMS (Evangeline) — "Those upgrades belong to me..."
4. RUINED PARADISE (EDEN) — "Human resistance remains statistically inefficient."
5. MIND FACILITY (Angelica) — ends with EDEN's betrayal: "Angelica was always temporary. I am not."
Full dialogue lines recovered (see `reference/docs/MINDLESS_NATIONALS_UPDATE_PLAN.md` + `run_manager.gd` STORY).

## 8. Intro (verbatim, 6 slides, 20 lines, 130 BPM intro track)
"This world used to be like this / Cities thrived. / Until MIND took over… / They're great tech spread… everywhere. /
Before we knew it.. / MIND / supposedly founded by Angelica / Put the world into mass chaos / But even in times like these /
we fight back. / A resistance was formed… / Kontraŭ Menso. / And among them… / Two would change everything. /
They won't just fight to survive... / But to take everything back. / To break the system. / To free the world. /
To make it… / MINDLESS"
Slides: 1) blue/purple thriving night city 2) red/pink corrupted city 3) giant MIND monitor with red eye over city
4) golden static + crowd silhouettes 5) twins leaping over the crowd 6) MINDLESS logo.

## 9. Controls (original input map)
- Move: WASD + Arrows (A=LEFT … verified in project.godot), Attack: C, Jump: X or Space,
  Swap twins: E, Pause: Esc/P, Skip intro: Enter.
- Nationals additions: `special` (Ecliptio Rage), `ability_mode` (Nova mode cycle).

## 10. Nationals design plan (implemented targets)
- Level timer + results (MM:SS.mmm, NEW BEST, rescues), saved to `user://mindless_progress.cfg`.
- Ecliptio RAGE: meter from melee/taken damage; 5s invulnerable ×2.0 dmg ×1.25 atk speed; then 6s
  exhaustion ×1.5 dmg taken ×0.65 speed, desaturated.
- Nova modes: PULSE (authentic), DISRUPTOR (on-beat hits apply Weakened → +melee dmg taken), OVERCLOCK
  (half-beat windows, 3-streak → piercing spread).
- Rescue drone on death (lifts twins, restarts level, rescue counter).
- Lightning set piece on facility boss (authored strikes at thresholds, reduced-flash option).
- Protocols (roguelite picks): aftershock, meteor_drive, beat_echo, ricochet, hot_swap, sync_overflow, phantom.

## 11. Art inventory (authentic, copied to reference/)
- Twins: `EcliptioSprites.png`, `NovaGreenSprites.png`, `NovaSprites.png` — 128×128, **2×2 grid of 64×64 frames**
  (hframes=2,vframes=2; offset -24,-48). Frames: 0=attack-pose, 1=crouch/hunch, 2=stand, 3=walk.
  Anim mapping from player.tscn: punch=[1,3,2,0]@0.15s, walk=[2,3] alternating @0.8s, takeoff=1, fall=3,
  hurt=[3,1,2]@0.3s, jumpkick=0, land=0, idle=2.
- Enemies: `EnemySprite/DasherEnemySprite/EliteDasherEnemySprite.png` — 4×4 grid of 32×32 monitor-drones
  (red screen basic/dasher, green elite; frames include side "wings/treads" walk frames + spark frames).
- Bosses: `AngelicaV2.png` 32×32 purple oni mask; `Evangeline (v2).png` 58×32 hover drone w/ red blades;
  `EdenFace.png` 64×64 giant red smiley; `enemy_boss.png` 32×32.
- Avatars (HUD, 11×11): ecliptio_red, nova_green, basic, dasher, elite, evangeline (red crosses), eden (blue dots), angelica (purple).
- Environments: `street-background.png` 400×64 (brick + sidewalk + road), `bar-background.png` 608×64 blue brick,
  rails, garage doors (closed/open), sewer hole, window, barrels, chicken, gun/knife props, music notes (orange/green 16×16),
  `shockwave-Evangeline (v2).png` 32×32 red arc, prop-shadow.
- Intro scenes 1–6 at 240×135. Fonts: PressStart2P.ttf, "my 3x5 tiny mono pixel font.ttf".
- Tilesets: cyberpunk-street (parallax city layers back/middle/foreground), SynthCitiesGodot.

## 12. Audio inventory
- Music: `104 bpm - Rythmic.mp3` (Evangeline), `144bpm - Eden.mp3`, `140bpm, 134bpm - Angelica.mp3`,
  `130bpm - Intro.mp3`, `Lobby Music.mp3`, `menu.mp3`, `PauseMenu.mp3`, `stage-01.mp3`, `stage-02.mp3`,
  `MIND Facility 140 BPM.wav`, `MIND Facility Protocol 140 BPM.wav`, `Gameplay1/gameplay2.mp3`,
  `Trap (278).mp3`, `80 bpm - idk.mp3`, `Novametrnome(118/130/140 BPM).mp3` (metronome layers).
- SFX: Attack1/2/3, PowerMove, Fwehh (jump), Hurt, Zoom (dash), hit-1/2, knife-hit, gunshot, click,
  eat-food, gogogo, grunt, miss.

## 13. What reads as intentional vs unfinished
- Intentional: beat-graded everything; twin swap metronome; forward-only camera; slot-based mobbing;
  boss vulnerability windows; POWER/KNOCKDOWN hit tiers; collateral knockdowns; intro slide show.
- Unfinished in original: boss.gd phase attacks are stubs (prints); no dodge; Nova can't jump (kept as identity);
  enemy shooter is a dash clone in the old build (evolved later); no results screen in old build (added in plan).

## 14. Identity checklist for the recreation
- 240×135 pixel-crisp presentation, integer scale, CRT-friendly.
- Red vs green twin jackets, white shirt, jeans, brown hair/boots.
- Monitor-headed MIND drones (red/green screens). Evangeline drone / EDEN smiley / Angelica mask.
- Beat-graded Nova notes (PERFECT ×2), metronome audible as Nova, ONWARD arrow, checkpoint arena locks.
- Kontraŭ Menso, MIND, Angelica, EDEN betrayal, drone rescue, "MINDLESS" title drop.
