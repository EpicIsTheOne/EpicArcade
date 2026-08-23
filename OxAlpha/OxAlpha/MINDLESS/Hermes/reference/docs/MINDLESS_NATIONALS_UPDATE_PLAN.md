# MINDLESS Nationals Update Plan

## Update goal

Turn MINDLESS from a functional beat-em-up prototype into a competitive, story-driven action game with stronger twin identities, visible progression, and memorable level events.

The update should strengthen the game's original pull point: swapping between aggressive melee combat and rhythm-based ranged combat while pushing through a ruined cyberpunk world controlled by the MIND network.

## Design pillars

1. **Competitive clarity** — every level produces a meaningful completion time and personal best.
2. **Story during play** — narrative appears at level openings, checkpoints, encounters, and bosses instead of living only in the intro.
3. **Distinct twins** — Ecliptio becomes the high-risk melee character; Nova gains tactical rhythm modes.
4. **Memorable recovery and spectacle** — death uses the helper drone, and the third boss receives a lightning-driven visual set piece.
5. **Low repetition** — levels introduce new dialogue, enemy combinations, character mechanics, and environmental events.

## Feature 1: Level completion timer and results

### Player experience

- A small timer appears during each level.
- Timing begins when the level fade finishes and the player gains control.
- Paused time, dialogue pauses, loading, and transition animations do not count.
- Timing ends when the final checkpoint or boss is completed.
- A results panel shows:
  - level name;
  - completion time;
  - previous personal best;
  - `NEW BEST` indicator when applicable;
  - deaths/rescues;
  - Continue and Retry buttons.
- Best times are saved locally in `user://mindless_progress.cfg`.

### Competitive rules

- Restarting or being rescued resets the current attempt timer.
- A completed run remains valid after a rescue, but the result displays the rescue count.
- Use a monotonic clock rather than frame counting.
- Format results as `MM:SS.mmm`.

### Architecture

- Add a `RunManager` autoload to own timing, results, deaths, and saved best times.
- Add a reusable `LevelResults` Control scene.
- Give stages stable IDs and display names instead of using array positions as save keys.
- `World` tells `RunManager` when player control starts and when the stage completes.

## Feature 2: Story integrated into gameplay

### Dialogue system

- Add a reusable `DialogueOverlay` scene with speaker name, portrait, text, continue/skip controls, and optional auto-advance.
- Store dialogue in data resources rather than hard-coding it into level scripts.
- Support four trigger types:
  - level opening;
  - checkpoint or area entry;
  - pre-boss exchange;
  - post-boss exchange.
- Important conversations pause combat. Short radio messages can play while movement continues.
- Track viewed conversations so repeat attempts can skip them immediately.

### Level story outline

The uploaded notes establish the following campaign spine. Exact dialogue will be written after the story beats are approved.

#### Tutorial — Kontrau Menso resistance

- The helper drone/resistance rescues Nova and Ecliptio after their home is attacked.
- Resistance dialogue establishes the MIND network, Angelica, and why swapping twins matters.
- Tutorial prompts become characterful instructions from the resistance rather than detached control text.
- Ending beat: the twins are sent toward the Oblitus Slums.

#### Level 1 — Oblitus Slums

- Environmental dialogue reacts to the damage caused by MIND occupation.
- Nova tries to keep Ecliptio focused on protecting survivors rather than chasing revenge.
- Evangeline appears for the first time, recognizes the stolen/upgraded MIND technology, and deploys an elite unit.
- Ending radio message points toward Ruined Paradise.

#### Level 2 — Ruined Paradise

- The twins see the larger consequences of Angelica's rebuilding campaign.
- Evangeline returns, increasingly possessive of their technology.
- Dialogue hints that the generals' behavior is connected to neurological implants.
- The level ends with evidence leading toward the MIND production facility.

#### Level 3 — MIND facility / Evangeline confrontation

- Eden speaks through the network and treats humans as obsolete.
- Evangeline confronts the twins directly after repeated failed deployments.
- Destroying Evangeline's implant kills her, making the victory morally uncomfortable.
- The resistance realizes Angelica may also be controlled or destabilized by an implant.

#### Final sequence — Seraphina, Eden, Angelica, Eden

- Seraphina defends Angelica and the existing order.
- Eden's ambition becomes explicit after Seraphina falls.
- Angelica becomes increasingly unstable during her confrontation.
- After Angelica is defeated, Eden betrays her and becomes the final threat.

### Environmental storytelling

- Add short background details: resistance markings, MIND propaganda, damaged shelters, factory production lines, and increasingly pristine corporate architecture near the finale.
- Keep story messages brief enough that repeat runs remain fast.

## Feature 3: Ecliptio Rage mode

### Activation and resource

- Add a Rage meter visible only while Ecliptio is active.
- Rage builds through melee damage, successful combo finishers, and damage received.
- Activate with a dedicated `special` action when the meter is full.

### Rage phase

- Duration: 5 seconds.
- Ecliptio is invulnerable.
- Damage multiplier: `2.0x`.
- Attack animation speed: `1.25x`.
- Strong red/white outline, intensified impact effects, and distinct audio cue.
- Rage cannot be extended or reactivated while active.

### Exhaustion phase

- Duration: 6 seconds after Rage ends.
- Incoming damage multiplier: `1.5x`.
- Attack animation speed: `0.65x`.
- Rage gain is disabled.
- Desaturated visual treatment and clear UI countdown prevent the penalty from feeling arbitrary.

### Balance and safety

- Store durations and multipliers in an `EcliptioAbilityConfig` resource for quick tuning.
- Invulnerability applies to damage, not collision or knockback, so positioning still matters.
- Rage ends cleanly during stage transitions, death, twin swaps, and cutscenes.

## Feature 4: Nova rhythm modes

Nova receives three switchable modes. Mode switching uses a new `ability_mode` input and does not replace twin swapping.

### Pulse mode

- Refines the current homing projectile behavior.
- Reliable single-target damage.
- Beat grade continues to modify damage, speed, and knockback.
- Intended as the easy-to-understand default.

### Disruptor mode

- Lower direct damage.
- On-beat hits apply `Weakened` to MIND enemies.
- Weakened enemies take increased melee damage from Ecliptio.
- Better beat grades increase the debuff duration.
- This implements the original design note about Nova weakening MIND material for Ecliptio to exploit.

### Overclock mode

- Faster beat subdivision and shorter timing windows.
- Successful hits build a streak; three consecutive on-beat hits fire a bonus spread or piercing shot.
- A miss resets the streak.
- Highest damage potential, but hardest mode to maintain.

### Shared mode rules

- Display the active mode beside Nova's portrait.
- Give every mode a distinct projectile color, sound, and reticle treatment.
- Mode changes happen only in idle/walk states to avoid cancelling attacks.
- Store mode values in `NovaModeConfig` resources rather than branching numeric constants throughout `player.gd`.

## Feature 5: Helper drone rescue sequence

### Sequence

1. Player health reaches zero and combat input locks.
2. The helper drone enters from above or off-screen.
3. It attaches a beam/cable to the twins and lifts them away.
4. Screen fades while surviving enemies and projectiles are cleared.
5. The current level restarts from its beginning.
6. The attempt timer resets and the rescue counter increments.

### Requirements

- Add a reusable `RescueDrone` scene with a small state machine.
- The sequence must work from any player position.
- Prevent multiple death signals from spawning duplicate drones.
- Stop BeatManager music cleanly during rescue and restart it with the level.
- Allow skipping the rescue animation after the player has seen it once.

## Feature 6: Third-boss lightning event

### Presentation

- During the third boss encounter, the room begins dark and storm-lit.
- Lightning strikes at authored boss-health or phase thresholds rather than random intervals.
- Each strike briefly illuminates the entire room, reveals background silhouettes, flashes the boss, and plays delayed thunder.
- One major strike can mark a phase transition or temporarily expose the boss.

### Implementation

- Add a `LightningController` scene containing:
  - CanvasModulate or full-screen light overlay;
  - flash AnimationPlayer;
  - optional bolt sprite/particles;
  - thunder AudioStreamPlayer;
  - `strike()` signal and method.
- The boss script triggers strikes through signals rather than searching the scene tree.
- Add a reduced-flash accessibility setting that lowers intensity and replaces rapid flashes with a slower brightness swell.

## Supporting systems

### Status effects

- Add a small status-effect component for `Weakened`, Rage invulnerability, and Exhaustion vulnerability.
- Keep damage multipliers in one damage calculation path so boss, melee, projectile, and collateral damage remain consistent.

### Input additions

- `special` — activate Ecliptio Rage.
- `ability_mode` — cycle Nova modes.
- Both must support keyboard and controller mappings.

### Save data

- Best times per stable level ID.
- Viewed dialogue IDs.
- Rhythm offset.
- Reduced-flash option.
- Optional last-selected Nova mode.

## Implementation phases

### Phase 1 — Foundations

- Stable level IDs and explicit stage definitions.
- `RunManager`, saved best times, gameplay timer, results scene.
- Dialogue data format and reusable overlay.
- Central damage/status-effect calculation.

### Phase 2 — Competitive vertical slice

- Implement timer/results and dialogue for one normal level.
- Confirm pauses, dialogue, death, retry, and completion timing rules.
- Use this slice to lock UI scale and presentation before repeating work across levels.

### Phase 3 — Twin abilities

- Implement Ecliptio Rage and Exhaustion.
- Implement Nova Pulse, Disruptor, and Overclock modes.
- Add HUD indicators, audio, and effects.
- Balance against basic, dash, elite, and boss enemies.

### Phase 4 — Campaign narrative

- Write and integrate dialogue for tutorial and every implemented level.
- Add pre/post-boss scenes and skippable repeat-run behavior.
- Add environmental storytelling props where existing art supports them.

### Phase 5 — Spectacle and recovery

- Add helper drone rescue.
- Add the third-boss lightning controller and accessibility option.
- Verify both systems across restarts, scene transitions, and web export.

### Phase 6 — Nationals polish

- Full keyboard/controller pass.
- Web-export performance test.
- Timing calibration and audio-latency test.
- Dialogue proofreading and consistent character voice.
- Difficulty/balance pass with recorded completion times.
- Clean runtime output and remove development-only logging.

## Acceptance criteria

- Every playable level ends on a results screen with an accurate saved best time.
- Pauses, dialogue, fades, and loading never inflate completion time.
- Each level contains at least an opening story beat, one mid-level beat, and a completion/boss beat.
- Viewed dialogue can be skipped without delaying competitive reruns.
- Rage applies its complete benefit and penalty cycle without leaving stale state after swaps, death, or scene changes.
- All three Nova modes are visually distinguishable and provide different tactical value.
- Drone rescue restarts the current level exactly once and resets the attempt timer.
- The third boss consistently triggers authored lightning strikes and honors reduced-flash mode.
- Keyboard and controller players can use every new action.
- The Web export runs without project errors and preserves save data between sessions.

## Recommended first build

Build a vertical slice using the first normal stage:

1. timer and results panel;
2. three short Oblitus Slums dialogue moments;
3. Ecliptio Rage with its Exhaustion penalty;
4. Nova Pulse and Disruptor modes;
5. drone rescue;
6. saved best time.

Once this slice feels good, add Overclock, propagate dialogue to the remaining stages, and finish the third-boss lightning sequence. This keeps the risky systems testable before the entire campaign depends on them.
