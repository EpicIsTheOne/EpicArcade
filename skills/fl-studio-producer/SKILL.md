---
name: fl-studio-producer
description: >
  MUST USE when creating, producing, editing, or evaluating music in FL Studio
  — e.g. "make a beat", "write a melody/chords/bassline", "produce a track",
  "mix this", "arrange a song", any genre request (trap, lo-fi, house, DnB,
  orchestral, game soundtrack), or any FL Studio MCP automation task. Combines
  FL Studio operation (via the installed fLMCP MCP + file-bus relay) with real
  music production craft: theory, composition, sound selection, arrangement,
  mixing, and iterative producer workflow. Teaches the agent to behave like a
  competent producer, not an automation bot.
---

# FL Studio Producer

Operate FL Studio like a producer: understand the request → establish
genre/reference/mood → set BPM/key → musical idea → chords → melody → bass →
drums → sound selection → arrangement → transitions/automation → gain staging →
mixing → **listen/evaluate** → revise weak sections → polish. Never call a
track complete just because every requested element technically exists.

## Part 1 — Operating FL Studio (this machine)

### Installed stack

- **fLMCP MCP server** registered as `fl-studio` (159 tools: transport,
  patterns, channels, mixer, plugins, piano roll, playlist, arrangement,
  automation, generators). Restart opencode after config changes.
- **File-bus relay** (`flmcp_relay.py`, autostarts at logon) owns TCP 9876 and
  translates to a request/response folder inside FL — this is why pitched notes
  work without piano-roll scripts.
- **FL Studio 2025** is the target. FL 2026's script sandbox blocks threads —
  never use it for MCP work.
- Server clone: `C:\Users\Epic\mcp-servers\FLStudioMCP` (venv has `mcp>=1.2,<2`
  pinned — 2.x removed `mcp.server.fastmcp`).

### After every FL launch: attach the bridge

FL 2025.2's script auto-attach is racy. Run immediately after launching FL,
while FL still owns the foreground:

```powershell
& C:\Users\Epic\mcp-servers\FLStudioMCP\fl_attach_bridge.ps1
```

(Focuses FL → F10 → toggles the bridge input Enable off→on at the dialog's
fixed position → F10.) Verify with a ping before composing.

### Tool mapping — production intention → tool

| Intention | Tool(s) |
|---|---|
| Tempo / time signature | `transport_set_tempo`, `transport_set_time_signature` |
| New pattern / naming / color | `pattern_create`, `pattern_rename`, `pattern_set_color` |
| Drums (groove) | `gen_emit_drum_pattern_step_seq` with `channel_map` + `style` (trap, boom_bap, house, dnb, four_on_floor, reggaeton, amen_break, rock), `repeats` |
| Chord progression | `gen_emit_chord_progression` (channel, progression like `i-VII-VI-V` or `I-V-vi-IV`, root, scale) |
| Bassline | `gen_emit_bassline` (channel, root, scale, progression, pattern_style: root/octaves/walking/eighths) |
| Melody | `gen_emit_melody` (channel, root, scale, octave_range, note_duration_bars) |
| Arpeggio | `gen_emit_arpeggio` |
| Humanize | `piano_roll_humanize` (timing_jitter_bars, velocity_jitter) |
| Quantize | `piano_roll_quantize`, `channel_quick_quantize` |
| Step editing | `channel_set_step_sequence`, `channel_get_step_sequence`, `channel_clear_step_sequence` |
| Channel sound | `channel_set_volume/pan/pitch/name/color`, `channel_route_to_mixer` |
| Mixer balance | `mixer_set_volume/pan`, `mixer_set_eq_band` (3-band), `mixer_route`, `mixer_set_send_level` |
| Automation | `automation_record_tempo`, `automation_record_channel_volume/pan`, `automation_record_plugin_param` with timed points |
| Arrangement | `playlist_place_pattern`, `playlist_track_count`, markers |
| Save | `project_save_as` with explicit path (see modal trap below) |
| Escape hatch | `fl_call_raw` — any bridge action, e.g. `player.play` live scoring |

### The live score player (pitched notes without piano-roll scripts)

`fl_call_raw` with `action="player.play"` and
`{events: [{t, ch, note, vel, dur}], loopBeats: N}` performs notes in real time
against the transport clock (`t` in beats from loop start, looped). This is the
reliable path for melodies, chords, and basslines — the piano-roll emit tools
(`gen_emit_chord_progression`, `gen_emit_melody`, `gen_emit_bassline`) require
the ComposeWithLLM pyscript armed once per FL session via the piano roll's
scripts dropdown; if `state` comes back `null`, either arm it (one click) or
use `player.play`. `player.stop` clears the score and sends all-notes-off.

Compose scores with **beats as the unit** (loopBeats = pattern length in beats;
4 bars of 4/4 = 16). Set tempo BEFORE or after — the score is tempo-independent.

## Part 2 — Music theory that matters

- **Keys**: pick for the mood + the sounds you have. Minor keys (natural,
  harmonic, Dorian) for tension/darkness; major for warmth/nostalgia. Relative
  major/minor shares all seven notes — flip mood without changing pitch set.
- **Progressions that work**: minor: i–VI–III–VII, i–VII–VI–V, i–iv–v–VII,
  i–VI–iv–V. Major: I–V–vi–IV, I–IV–vi–V, iii-heavy drifts (I–iii–vi–IV) for
  nostalgic/never-resolving feels. End phrases on chords that create motion
  INTO the next loop (V, IV, or a sus), not a dead stop.
- **7ths/9ths** (maj7, min7, add9, sus2) = instant sophistication on pads and
  keys. Voice-lead: move each voice to the NEAREST chord tone of the next
  chord; keep common tones; avoid parallel octaves between outer voices.
- **Melody**: favor chord tones on strong beats, scale tones as passing notes
  on weak beats. Motif → repeat → vary (transpose, invert, rhythmic shift).
  Leave rests — space is part of the melody. One clear peak note per phrase.
- **Bass interacts with kick** (they share the low end — alternate or lock),
  follows the chord roots (or passing tones between them), and lands WITH the
  kick on anchor hits.
- **Tension/release**: raise density/brightness/register toward a section end;
  drop them at the section start. The loop before a drop should be the emptiest.

## Part 3 — Expression (the anti-robot pass)

Never ship: identical velocities, identical note lengths, grid-perfect timing.

- **Velocity contour**: melody 50–70 with ±4–8 per-note jitter following the
  phrase arc (rise to the peak, fall after). Background layers 25–45.
- **Note lengths**: staccato 0.1–0.3 beats, legato 0.9× the gap to the next
  note, sustained pads 0.95× bar length. Never all the same.
- **Timing**: melody ±0.02–0.05 beats off-grid; swung genres delay off-8ths
  0.05–0.1 beats; keep bass and kick ON grid (they ARE the grid).
- **Articulation**: repeated same-pitch notes → shorten the first; phrase ends
  → let the last note ring.

## Part 4 — Sound selection & mixing fundamentals

- **Gain staging first**: per-channel volumes so nothing clips the master
  (FL's master limiter default catches it, but stage properly anyway). Melody/
  lead loudest, drums next, pads/bass supporting.
- **Frequency masking**: if two layers fight in the same band, cut one, lower
  one, pan one, or delete one. Fewer, better layers > many mediocre ones.
- **EQ** (mixer 3-band via `mixer_set_eq_band`): low-cut everything that isn't
  bass/kick (mentally — the 3-band low knob does this), tame boxy mids by
  pulling mid on supporting layers.
- **Reverb/delay**: FL presets and FLEX pads carry built-in space — prefer
  presets that sound wet over trying to add FX via API (the API cannot load
  plugins into slots; only configure already-loaded ones).
- **Sidechain/ducking**: automate channel volume dips on the kick
  (`automation_record_channel_volume` with timed points) for pump.
- **Stereo**: pan supporting layers ±10–25%, keep kick/bass/melody center.
- **Audition honestly**: play the loop, check transport/metadata state, and
  re-dispatch sections that are weak. You cannot hear — compensate by checking
  structure (note counts, velocity spreads, register overlaps) and by following
  the theory rules harder, not by assuming it sounds good.

## Part 5 — Arrangement & transitions

- Minimal viable structure: Intro (4) → Verse/A (8) → Chorus/B (8) → Verse →
  Chorus → Outro (4). Game/ambient music: single evolving 8–16 bar loop with
  layer add/remove instead of sections.
- **Transitions**: last bar before a section = drum fill or bass/melody pickup
  run; drop the drums for the last half-bar before a drop; riser = rising
  arpeggio or pitch-bent note; downlifter = descending line into the downbeat.
- **Develop the motif**: same idea, new register/instrument/harmony per
  section. Avoid repetitive 4-bar loops unless the genre IS the loop
  (hip-hop/lo-fi/ambient — then vary every 4/8 bars: drop drums, swap the
  bassline, mute a layer for one bar).

## Part 6 — Genre playbook

When genre guidance conflicts with generic rules, follow the genre.

- **Hip-hop/Trap** (130–160 BPM, minor keys): boom-bap = swung 16th hats,
  dusty kick/snare, root-position minor 7th chords, walking bass. Trap = fast
  rolled hats (32nd bursts), kick+808 locked, i–VI–III–VII or i–VII–VI–V,
  dark pads, sparse melodies with wide pitch jumps.
- **Pop** (100–125, major): I–V–vi–IV, piano/synth chords on 8ths, four-on-
  floor-adjacent drums, bass on roots with octave pops, big melodic hooks with
  call-and-response phrases.
- **EDM** (126–128 house / 140+ dubstep-ish): four-on-floor kick, claps on 2/4,
  off-beat open hats, 8-bar builds with rising automation, drop = remove bass/
  pads for a bar then slam everything, sidechain pump on pads.
- **House** (120–128): four-on-floor, open hat on the off-beat, jazzy 7th
  chords (im7–im7–IV–V or ii–V–I), walking or off-beat bass, swung shakers.
- **Drum & Bass** (172–176): amen/2-step breaks, sub bass following the kick
  pattern (half-time feel), minor 9th pads, sparse melancholic melody, long
  reverb tails.
- **Orchestral/Cinematic** (60–120, any key): sustained string-style pads,
  root-fifth bass octaves, melodic lines in the middle register, harmonic
  rhythm one chord per 1–2 bars, dynamics via layer add/remove, no drum kit
  (timpani-style hits only if needed).
- **Lo-fi** (70–90, major 7th heavy): maj7/min7/9th chords, swung dusty drums,
  melody = sparse single-line piano/keys, tape-warp character, imperfection
  is the aesthetic (keep the humanize heavy).
- **Ambient** (any, often 60–80): no drums or heartbeat-only, pads + long
  evolving notes, harmonic rhythm one chord per 2–4 bars, melody optional,
  silence generous.
- **Rhythm-game music** (140–200): driving four-on-floor or breakbeat, dense
  16th melodic runs aligned to gameplay intensity, key changes/section flips
  every 8–16 bars, high energy throughout, sharp transitions ON the grid
  (gameplay syncs to them).
- **Game soundtracks (C418-style)**: major key, 88 BPM feel, passacaglia
  (repeating bass, drifting melody), iii/IV-heavy never-resolving harmony,
  felted-piano/pad palette, no drum kit, silence generous, single evolving
  idea under 3 minutes.

## Part 7 — Safety & project hygiene

- **Preserve the user's project.** Compose into NEW patterns
  (`pattern_create`), never into their existing patterns, unless explicitly
  told to replace. Muting/removing their patterns = destructive.
- **Checkpoint before risky edits**: `project_save_as` with an explicit path
  (NEVER `project_save` on an untitled project — it pops a modal that blocks
  the API with "Operation unsafe at current time").
- Prefer native MCP operations over UI automation. GUI automation (F10 +
  coordinate clicks) is the LAST resort, only with the user's awareness.
- Rollback-first mindset: read state → smallest change → verify → keep the
  undo path (`project_save_undo` exists via raw actions).

## Part 8 — Machine-specific limits (honest)

- **Cannot**: load plugins/samples into channels or mixer slots, render audio,
  open projects via API, create channels, change FLEX packs/presets
  (FLEX ignores wrapper preset navigation), sequence notes via the controller
  API (use the live player), read preset names reliably for FLEX.
- **Modal dialogs freeze the API** ("Operation unsafe at current time" from
  any call = a dialog is open in FL). Screenshot FL, dismiss the dialog
  (Welcome window: PostMessage WM_CLOSE to its UIA hwnd), then retry.
- **Focus-gated**: `ui.openPianoRoll` and pitched piano-roll tools need FL
  foregrounded. The live score player does NOT — it works minimized.
- **One FL instance** at a time; the relay must own TCP 9876 (restart
  `flmcp_relay.py` if 9876 is dead; it autostarts at logon).
- **Autorecovery**: force-killed FL leaves autosaves in
  `Documents\Image-Line\FL Studio\Projects\Backup\untitled (autosaved at
  HHhMM).flp` — relaunch FL with that path to restore the channel kit.

## Report style

Say exactly what was composed/changed (key, BPM, structure, instruments,
event counts), what was only planned, what remains unverified (you cannot
hear — flag that mix judgment needs human ears), and what the next iteration
should fix.
