---
name: synth-song-engine
description: >
  MUST USE when asked to make, produce, or render any song/beat/soundtrack as
  audio — e.g. "make a beat", "make a song", "minecraft-type track", "C418
  vibe", "lofi", "trap beat", "house/dnb/hardstyle/jersey club track",
  "ambient game soundtrack", "a fast/energetic track". Genre-agnostic offline
  numpy-synthesis pipeline: research-distilled genre playbooks (C418 ambient,
  lofi, trap, house, DnB, hardstyle, jersey club, cinematic), synthesized
  instruments and drums (templates/diamond-sky.py + templates/synth_kit.py),
  convolution reverb, deterministic rendering, verified delivery. Also applies
  when an FL-DAW-palette attempt "doesn't sound right" — that is the signal to
  switch engines. Do NOT let any single genre playbook bias other requests:
  each genre section applies only when that genre was asked for.
---

# Synth Song Engine

Genre-neutral offline music renderer: pick the playbook matching the request,
compose per its laws, synthesize every instrument in numpy, render to WAV +
MP3, verify, deliver.

## The one decision that matters

**Do NOT try to make sounds inside a DAW's exposed API (e.g. FL Studio via
fLMCP).** Such surfaces are locked rooms: preset lists unenumerable, presets
pinned per channel, no FX plugin loading into mixer slots, no channel
creation. Sampled palettes get you "cinematic demo", never an authentic genre
sound.

Instead **synthesize every instrument from scratch in numpy** and render
offline. This is what shipped the approved track. Use a DAW only if the user
specifically wants notes living in a project (deliver MIDI) — the audio
deliverable comes from this engine.

## Multi-agent concurrency — read before ANY DAW contact

Multiple agents run in parallel on this machine. The two work paths have
completely different coordination costs:

1. **Synth-engine path (default) = ZERO coordination.** Offline numpy
   rendering touches no shared state: each agent uses its own files under
   `%TEMP%\opencode\`, its own CPU time, deterministic output. N agents can
   render simultaneously without any locking. Just keep deliverable titles
   unique on Desktop (append agent name or timestamp if the title is
   generic).

2. **FL-stack path (rare) = LEASE REQUIRED, no exceptions.** Relay port
   9876, the shared file-bus dir, loopMIDI ports, bridge.log, WASAPI
   loopback capture, and running FL instances are GLOBAL singletons. Two
   agents here = zombie instances fighting over exclusive MIDI ports and
   stolen relays (this happened; it was bad). Before starting the relay,
   launching FL, attaching the bridge, or capturing audio:

```powershell
$py = "<venv>\python.exe"; $L = "<skill>\templates\fl_lease.py"
$out  = & $py $L acquire --holder myAgent --timeout 120   # exit 2 = busy, go do synth-path work or retry
$tok  = ($out | ConvertFrom-Json).token
# ... ALL relay/FL/attach/capture work happens here ...
# heartbeat every <90s during long operations:  & $py $L heartbeat --token $tok
& $py $L release --token $tok
```

Lease rules:
- `fl_lease.py` handles stale takeover automatically (dead holder PID or
  >120 s silent heartbeat) — never delete the lock file manually.
- **Own only what you spawn**: record the FL64 PID immediately after your
  launch; cleanup at release kills ONLY that PID plus the relay process you
  started. Never blanket-kill `FL64` by name — another agent may legally
  hold the next lease with their own instance.
- Relay lifecycle belongs to the current holder: check `status` first; if
  TCP 9876 is up when you acquire, it's yours to use AND yours to shut down.
- One loopback capture at a time — covered by the same lease (capturing
  requires the stack anyway).
- If you cannot acquire within your patience budget, fall back to path 1.
  The synth engine can produce the deliverable without FL ~always.

## Playbook: C418 / Minecraft ambient

### Research distillation (C418's own words — treat as law)

- Piano was recorded with *a terrible mic on top* and **mangled on purpose**
  (inspired by Blueberry Garden). Lo-fi intimacy > fidelity.
- **~80% electronic / 20% acoustic**, Ableton + NI/EastWest libs.
- **Mellotron used extensively** — tape wobble is part of the sound.
- The soundtrack is a **"pentatonic pill"**: melodies stay strictly inside a
  major pentatonic ("Minecraft" is purely pentatonic). Chords may carry color
  tones; the melody may not.
- His bar: *"How few notes do I need until it's emotional?"* Minimalism wins.
- Structure = **slow buildup, slowly fading away** (Sweden's own description).
- Influences: Eno, Satie, Aphex Twin. No drums (mostly). Melancholy from
  loneliness; ends unresolved.

### Composition recipe for the C418 playbook (proven: Diamond Sky)

| Element | Spec |
|---|---|
| Key / tempo | D major, 72 BPM (60–90 acceptable) |
| Form | 40 bars ≈ 133s: intro pads alone → ostinato enters b5 → melodic seed b9 → THEME b17 → octave-lit return b25 → coda b33 |
| Harmony | 4-bar chords, planing open voicings with 9ths: Dadd9, Gmaj9, Bm(open), Asus4/A7 color, Em9, Asus2 — never functional V–I drama |
| Melody | STRICT D-pentatonic (62 64 66 69 71 74 76 78), hovers D5–G5 area, phrases of 2–6 notes with 2–5 beat gaps, same contour restated higher, **ends unresolved on the 9th (E)** |
| Ostinato | 1 note/beat broken-chord roll per chord (R–5–9–3 figure), vel ~24–32, enters after intro, exits before coda |
| Bass | One long root (+fifth in body sections) per chord, sine-ish sub |
| Sparkle | Music-box bell: ≤3 notes in the whole piece, at structural moments only |
| Humanize | Timing jitter ±0.05 beats, phrase-final notes stretched +0.1s and +10% dur, velocity arcs hand-written not random |
| Pedal blur | Every melody note rings past the next strike (dur ≥ gap + 0.6 beats) |

## Synthesis engine spec (bundled template implements all of this)

`templates/diamond-sky.py` = working reference. Swap the score data, keep the
engine. Key internals:

- **Shared tape drift**: one global slow-random-walk ±0.13% + 0.31 Hz LFO
  ±0.28%, integrated into every oscillator's phase (`phase_drift`). This is
  the Mellotron glue — do not give each note independent drift only.
- **Felt piano**: partials [1, 2, 3, 4.02, 5.13], amps scaled by
  `bright = 0.22 + vel/127·0.85`, per-partial decay rates 1.35→4.1/s,
  raised-cosine attack 6 ms, damper release 280 ms after dur, filtered noise
  hammer-thump at onset. Velocity^1.5 amplitude.
- **Pad**: dual osc detuned ±7 cents, sin + .32·sin2f + .11·sin3f, shared wow,
  0.12 Hz tremolo ±8%, 1.3 s attack / 1.9 s release.
- **Music box**: sin + 0.26·sin(2.756f) + 0.06·sin(5.4f), τ=1.05 s decay.
- **Sub**: sine + 0.06·2nd harm, 350 ms attack.
- **Reverb — non-negotiable, THE cave sound**: FFT convolution with 3.2 s
  exponential-noise IR (τ≈1.05 s, decorrelated L/R seeds, first 45 ms zeroed)
  + early-reflection taps [13/21/29/41/53 ms] alternating polarity. Wet:
  piano .42, pad .50, box .60, sub .12.
- **Master**: rfft-domain HP ~78 Hz ramp + gentle shelf down above 9 kHz,
  tanh(x·1.2) soft saturation, normalize peak to 0.89, optional −62 dB
  lowpassed noise floor for tape vibe.
- Panning constant-power; box left −0.35, pad right +0.12.

## Genre playbooks (research-backed, same engine)

The engine is genre-agnostic: melody/harmony instruments come from the
diamond-sky template, **drums + electronic basses come from
`templates/synth_kit.py`** (kick, 808 with portamento slides, snare, hats,
clap, ride, reese, sub, pluck — every voice smoke-tested). Per-genre specs
below are distilled from production literature; treat as law like the C418
section.

### Universal craft laws (every genre)

- **Velocity variation is non-negotiable** on repeated hits — uniform
  velocity = robotic = instantly amateur.
- Kick and bass share the low end: carve roles (sub sine below, punch above,
  or sidechain-style ducking implemented as volume envelopes).
- Arrangement = adding/subtracting elements over one great loop; drops hit
  after a strip-back. Silence before impact.
- Humanize timing ±5–20 ms where the genre wants feel (lofi/trap), keep it
  quantized-tight where it wants machine precision (house kick, DnB drums).
- Loudness targets differ: lofi sits quiet (~-16 LUFS vibe), club genres
  louder — normalize peak 0.89 always, adjust RMS via mix gains not limiters.

### Hybrid style composition (when the request mixes genres)

Genre fusion is supported and should be intentional, not an average of every
playbook. Pick one **anchor** (the rhythm or groove that makes the track
recognizable), one **supporting style** (bass, harmony, or lead language), and
at most one **texture/color layer**. Share a BPM, key, and bar grid, then give
each style ownership of different sections or musical roles.

- **Anchor first:** write and audition the anchor loop alone before adding the
  other style. If the anchor disappears, the fusion has no identity.
- **Role separation:** assign frequency and arrangement ownership. Example:
  Breakcore owns edited drums, DnB owns Reese/sub bass, chiptune owns the lead,
  and ambient owns pads and the breakdown. Do not let four bass voices fight
  below 120 Hz.
- **Handoffs:** change one major dimension at a time (density, halftime feel,
  filter, drum kit, or harmonic palette). Use 4–8 bar handoff zones, a dropout,
  or a riser; do not hard-swap every layer on the same downbeat unless the
  whiplash is the requested aesthetic.
- **Contrast is structure:** reserve one section where the supporting style
  leads while the anchor thins out, then return with a new mutation. A hybrid
  should feel like a conversation, not five presets playing simultaneously.
- **Deliverable note:** state the anchor/support/texture trio in the render
  log and verify each section has a measurable role (audible event density,
  bass register, or instrument presence) before delivery.

Useful tested combinations: **Breakcore + DnB + Chiptune** (edited breaks,
Reese/sub pressure, pulse-wave hook), **Jungle + Ambient/Shoegaze** (rough
breaks against wide pads), **Hardstyle + Classical** (distorted kick against
orchestral tension), and **House + Disco/Nu-Disco** (four-on-floor with octave
bass and filtered disco movement). Keep the anchor explicit in every case.

### Lo-fi hip hop

| Param | Spec |
|---|---|
| Tempo | 70–90 BPM (75–85 sweet spot) |
| Drums | Soft thumpy kick (beat 1 + "and" of 2/3), dusty snare 2 & 4, hats 8th/16th with random velocity 40–100% |
| Swing | **55–70% on off-beat hats/snares — mandatory**, this IS the genre |
| Harmony | Jazz extensions MANDATORY: maj7 / m7 / m9 / dom9 — never plain triads. Loops like im9–bVImaj7–bVII–im9, 4 bars, repeat forever |
| Keys | Rhodes-style EP: use felt piano voice with faster release + slight detune double |
| Bass | Round root notes only, quiet — keys+kick often cover low end alone |
| Texture | Vinyl crackle bed at −14 to −18 dBFS continuous (generate: sparse impulses + HP-filtered noise, lowpassed), tape wobble already in engine |
| Master | LP ~8–12 kHz shelf cut, tanh drive light, NO loudness war — quiet master |
| Structure | Loop-based: intro (chords only) → main loop → drop-one-element variation → return → fade with crackle last |

### Trap

| Param | Spec |
|---|---|
| Tempo | 140 BPM (130–150 range); half-time FEEL — kick/snare imply ~70 |
| 808 | `kick_808(note, ...)` tuned to key root/3rd/5th; carries melody AND low end; slides = call consecutive notes with `slide_from` (glide 50–200 ms), mono |
| Kick | Sparse: beat 1 (+ "and" of 3), short/punchy — separate from the 808 boom |
| Snare | 2 & 4, layered crack+body, big reverb send (plate ~1 s, predelay dry attack) |
| Hats | THE signature: 16ths base with heavy velocity contour (downbeats loud, inner 16ths 40–60%), open hat on "and"s, **rolls** = 32nd/64th bursts of 3–8 hits at phrase ends/bar-4 with front-weighted velocity decay (~15 units/hit), triplet bursts for gallop |
| Melody | Dark minor, often pentatonic, minimal 4-bar loop, two layered voices |
| Structure | Intro (melody/atmosphere only) → verse → hook → verse → hook → outro; strip drums before hook re-entry |

### House / EDM

| Param | Spec |
|---|---|
| Tempo | 124 BPM (120–128); deep house 120–124, tech/prog 126–128 |
| Kick | Four-on-floor EVERY quarter, identical velocity — mechanical consistency is intentional. Short tight tail (`kick(fund=50, decay≈0.30)`), NOT an 808 boom |
| Clap/snare | Beats 2 & 4 (`clap()`, layer over tight snare for thickness) |
| Open hat | **On the off-beats ("and" of every beat) — the single most house-defining sound**; closed hats 8th/16ths around it with accent variation; choke open-hat tails against next kick (trim buffer) |
| Bass | Off-beat plucks between kicks (`pluck_bass`, root+fifth) or sustained roots with pump; sub sine layer mono <100 Hz |
| Chords | Stabs on selected off-beats (min7/maj7 voicings), sidechain-pump pads by dipping volume on each kick (volume envelope, ratio ≈ 4–6 dB dip, ~100 ms recover) |
| Arrangement | Club shape: intro drums-only 16–32 → build → drop (full groove) → breakdown (no kick) → build → drop 2 → stripped outro; 6–8 min club / 3–4 min stream |

### Drum & Bass

| Param | Spec |
|---|---|
| Tempo | 172–174 BPM; **bass/melody think at half-time (86)** — fast drums, slow-feeling bass |
| Drums | Two-step: kick step 1, syncopated second kick ~"and of 2", snares on 2 & 4 grid positions (Amen DNA); crisp tight snare `snare(200, 1800, 8000, .07, .13)`, intricate 16th/32nd hats, ride for liquid style |
| Reese | `reese(note, ...)`: dual saws detuned +10 cents → moving LP (the sweep IS the sound) → tanh drive; automate cutoff per note for neuro movement |
| Sub | Clean `sub_sine` octave below reese, nothing above 200 Hz; HP the reese above ~80 Hz so they split cleanly |
| Keys | Minor: Dm/Am/Fm classics; harmony sparse — pads/plucks carry color, reese owns harmonic weight |
| Arrangement | intro → buildup → drop → breakdown → drop 2 → outro; filter sweeps into drops; silence before slam |

### Hardstyle (fast lane)

| Param | Spec |
|---|---|
| Tempo | **150 BPM exactly** — non-negotiable; DJs cannot mix off-tempo tracks into sets (155–160 only for rawstyle) |
| Kick | THE genre: `kick_hardstyle(note)` = 3 layers (click transient 2–5 kHz + distorted body sweeping 300 Hz→root + **clean undistorted sub tail** LP<80 Hz). Tune body+sub to key root (A1=55 Hz). Euphoric=light drive, raw=drive 8+, xtra raw=stack stages |
| Reverse bass | `reverse_bass(note)` on every off-beat: silent→swell→hard cut landing exactly on each kick. Kick + reverse bass are ONE unit — overlap = mud, gap = dead groove. LP 200–400 Hz, ducks fully under kick |
| Leads | Screech (`screech`, distorted resonant square, ±2 semi glides) for climax sections; supersaw melody for the drop |
| Harmony | Minor keys Am/Dm/Fm; euphoric style = emotional piano/pad breakdown melodies |
| Structure | DJ intro (kick+rev bass ONLY) → build → climax → **breakdown (emotional core: piano/pads — if it's boring the drop won't hit)** → build/riser → MELODY DROP (32–64 bars full power) → DJ outro |

### Jersey Club (fast lane)

| Param | Spec |
|---|---|
| Tempo | ~138 BPM (130–145 range) |
| Kick cell | **The five-hit skeleton on straight 16th steps 1 / 5 / 9 / 12 / 15** ("boom-boom… boom-boom-boom") — this cell IS the genre, more than tempo is. Program on a straight grid; triplets are a variation, not the base |
| Backbeat | One crisp clap/snare as stable anchor; hats sparse and subordinate — delete any hit that duplicates kick transients |
| Chops | Vocal/sample one-shots used AS percussion (hook = rhythmic chops + call-and-response); synth plucks/stabs can stand in for chops |
| Texture signatures | Bed squeaks, gun-cock triplets, big claps — one or two, placed like percussion |
| Low end | Short clean kick or compact 808 at one pitch — NO long slides/glides (that's trap's lane); tail must end before next kick |
| Groove laws | Restless energy: flip something every 4–8 bars, use dropouts/silence as instruments (a gap before a burst hits harder than a layer), reset-and-return over long builds |
| Structure | Short 2–3 min: intro (kick cell) → hook (chops fullest) → verse (thin it) → hook → switch (half-bar stops) → decisive out |

### Boom bap hip-hop

| Param | Spec |
|---|---|
| Tempo | 85–95 BPM |
| Drums | HARD kick (beat 1 + syncopated answers), dusty cracking snare 2 & 4, swung 8th/16th hats ~54–58% swing, ghost snare fills; darker/dustier than lofi — more punch, less blur |
| Bass | Upright-ish round roots or sub doubling kick; walking movement welcome |
| Harmony | Jazz samples DNA: m7/maj7/dom9 loops, ii–V–i minor turns; sparse piano/bell loops |
| Texture | Light vinyl noise + tape saturation OK but drums stay UP FRONT and punchy (lofi's sleepy cousin this is not) |
| Structure | Intro (loop teaser) → 16-bar verse → 8-bar hook lift → verse → hook → scratch/fill outro |

### Techno (peak-time)

| Param | Spec |
|---|---|
| Tempo | 130–136 BPM (132 safe); groove STRAIGHT, ≤2% swing |
| Kick | Every quarter, tight, clean transient (`kick(fund=50, sweep_ms=40, decay=0.30)`) |
| Rumble | `rumble(note)` — overlapping LP'd 808 booms per chord change = the signature pressure drone under everything |
| Bass | Off-beat plucks shortened to 60–70% of grid (`pluck_bass`, cutoff dark <300 Hz), mono, sidechain-ducked fast (60–90 ms recover inside one eighth) |
| Stabs/lead | Bandpassed resonant saw stabs (minor triad or root+fifth — two notes read better than four); ONE lead hook max; HP leads at 250 Hz |
| Arrangement law | Build the full loop first, then SUBTRACT for intro/breakdown — never write new sections. 6–8 min, one main breakdown |
| Mix law | Everything mono below 120 Hz; carve 200–400 Hz out of stabs; remove until it hurts, then remove one more thing |

### Trance

| Param | Spec |
|---|---|
| Tempo | 132–140 BPM |
| Engine | Supersaw stacks (7+ voices) HP'd 150–250 Hz — thin alone, perfect in context; keep a mono core layer so width survives mono fold-down |
| Low end roll | Kick every quarter + off-beat bass handing over 8× per bar; sidechain DEEP (4–6 dB dip, release 80–120 ms timed so bass swells exactly on offbeat) |
| Arps/plucks | 16th-note arpeggios over i–VI–III–VII minor loops; plucks carry breakdowns |
| Reverb | Big hall 4–6 s BUT predelay 20–40 ms + HP returns at 300–500 Hz + duck the verb from dry lead |
| Arrangement | 32-bar builds, LONG emotional breakdowns, protect half-a-beat of near-silence before the drop; risers 6–10 dB under lead |
| Loudness | Modern masters −6 to −8 LUFS; mix at −6 dB headroom and it gets loud for free |

### Dubstep

| Param | Spec |
|---|---|
| Tempo | 140 BPM, HALF-TIME feel (~70 effective) |
| Drums | Kick beats 1 & 3 (half-time), big wide snare/clap on beat 3 of the half-time grid; sparse percussion |
| Wobble | `wobble_bass(note, rate_div)` — saw → tempo-synced square-LFO'd LP → drive. rate_div 0.5 = classic two-wobbles-per-bar, 0.25 = aggressive brostep. TUNE TO KEY (mistuned wobble = most common fail) |
| Sub | Clean `sub_sine` same root below 100 Hz; HP wobble at 80–100 Hz — wobble owns mid-bass, sub owns sub-bass |
| Harmony law | During the DROP the wobble IS the melody — fall back to a two-chord vamp (im–bVII); chords live in intro/build only |
| Structure | Build length rule: longer build = harder drop; 16–32 bar builds, silence in final bar before drop; switch LFO rate between drops for movement |

### UK Drill

| Param | Spec |
|---|---|
| Tempo | ~140 BPM (138–145), swing 10–20% |
| Melody FIRST | Sparse haunting piano/bell loop (3–4 notes, 2–4 bars), minor or Phrygian — melody is the hook and sets mood before any drum |
| 808 | Sliding `kick_808` gliding along melody roots (mono+glide, slide time matched to BPM feel) — THE UK signature vs generic trap |
| Hats | SKIPPY broken pattern: bursts of 2–3 hits, deliberate gaps, one off-beat accent per bar — NOT straight trap rolls. Hand-place unevenly, vary velocity everywhere |
| Restraint | Leave space for a vocalist; mute the 808 two bars before drops; small changes read huge because arrangement is sparse |
| Structure | Melodic intro → verse (full drums) → 8-bar hook early → switch-up mid-track → stripped outro |

### Phonk

| Param | Spec |
|---|---|
| Two lanes | Classic: 80–100 BPM swung hip-hop pocket, sample-led Memphis darkness. Drift: 150–160 BPM high-energy cowbell engine (the car-video sound). Pick ONE before anything else |
| Cowbell (drift) | `cowbell(tune_note)` pitched across a minor/Phrygian scale playing a short hypnotic motif — distorted, gritty, THE lead. Layer bass note underneath it |
| 808 | Deep, gliding, DISTORTED but keep clean sub underneath (split: drive only upper band) |
| Drums | Hard punchy kick/snare backbeat, trap-style hats with rolls/triplets; drive the whole drum bus with saturation |
| Texture law | Grit is mandatory — tape saturation, vinyl noise, rolled-off highs. If it sounds polished you have lost the aesthetic |
| Structure | Short 1.5–2.5 min, single strong loop, add/strip layers for movement; leave space before the 808+cowbell return hits |

### Reggaeton

| Param | Spec |
|---|---|
| Tempo | 90–100 BPM (92–98 perreo sweet spot; urbano pushes 100–105) |
| Dembow | Kick beats 1 & 3 (sub-heavy), snare 2 & 4, **rimshot/clap accents on 16th steps 7 & 15 ("e" of 2, "e" of 4) — without these two hits it is NOT reggaeton**; open hat on steps 8 & 16 for air |
| Harmony | im–bVII–bVI–V Latin minor descend (Aeolian); Dorian im7–IV7 vamp for melodic tracks; extended im9/bVImaj7 modern color |
| Bass | Sine/808 sub tuned to key root reinforcing kick, sidechained (5–10 ms attack, 80–150 ms release); optional mid-bass melody answering the hook |
| Hooks | Short repetitive catchy chant melodies; pop structure verse → pre → hook, bridge strips to dembow only |
| Mix | Dry and punchy overall; rimshot gets own EQ slot (presence 2–4 kHz), short tight reverb <500 ms |

### Afrobeats / Amapiano

| Param | Spec |
|---|---|
| Tempo | 90–100 classic afrobeats; 100–115 afropop; Amapiano 112–115 |
| Clave law | Hi-hat/percussion accents on an asymmetric 3+3+2-derived set (source grid: steps 1, 3, 6, 8, 11, 14) — **evenly spaced hats are an instant genre failure** |
| Drums | Four-on-floor base + extra kicks on e/ah of beats 2 & 4; snare/clap 2 & 4 with ghosts; constant shaker 8ths; congas/toms filling gaps; open hats short on upbeats |
| Bass | Melodic and rhythmically active — mirrors clave, call-and-response with lead (NOT root drones); **amapiano variant: `log_drum` melodic bass is the signature voice** |
| Chords | m7/maj7/m9 progressions like im7–IVm7, im–bVImaj7–bVII7 |
| Arrangement | Builds by ADDING layers every 4–8 bars (perc → bass → guitar → vocal), 4–5 min tracks, gradual strip-back outro; pan percussion wide, keep kick/bass/snare center-dry |

### Synthwave / Retrowave

| Param | Spec |
|---|---|
| Tempo | 85–110 BPM mid-tempo cruise |
| Drums | Big 80s snare with GATED reverb: long hall tail truncated hard after ~0.25 s (render wet, multiply by gate envelope); steady 8th hats; tom fills |
| Keys | Detuned analog pads (engine pad voice, widen detune to ±12 cents), FM-ish digital bells, arpeggiated 16th sequencer lines |
| Leads | `supersaw` or pulse lead with portamento slides, chorus-sick and nostalgic |
| Bass | Squarish analog off-beat or driving 8ths, LP'd warm |
| Harmony | Minor nostalgia: vi–IV–I–V and im–bVI–bIII–bVII moves; slow chord rhythm |
| Vibe law | Everything slightly over-wide and drenched — this genre is a VHS filter, commit to it |

### Chiptune / 8-bit

| Param | Spec |
|---|---|
| Tempo | 120–175 BPM, energetic |
| Voices | `pulse` waves (duty .125/.25/.5 for timbre variety) for leads/arps/bass, triangle for sub bass, white-noise bursts for drums (hat/snare via filtered noise, kick via short pitch-sweep sine) |
| Aliasing note | Naive band-unlimited squares are AUTHENTIC here — do not band-limit; the crunch is the console |
| Writing | Fast arpeggio runs substituting for sustained chords (real chips had no polyphony — imply harmony through arps), echo-delay "fake reverb" (one repeat, feedback ~30%) |
| Harmony | Major/minor game-music vocabulary, I–V–vi–IV loops, key-change lifts between sections |
| Structure | Intro → A theme → B theme → A' variation → loop-out; phrases 8 bars, binary song form |

### The extended pack (compact playbooks — same engine, same delivery pipeline)

Format per entry: **Tempo · DNA · Kit · Law**. These are condensed; when a
genre request lands here, honor its law exactly like the big playbooks above.
Kit voices referenced: see templates/synth_kit.py (29 verified voices).

#### Electronic — dance floor extensions

- **UK Garage / 2-step** — 130–140. DNA: shuffled skippy drums (swing ~61%,
  hats pushed late), sub on deep notes, pitched-up vocal chops, shiny pads.
  Law: the shuffle is the genre; straight 16ths break it.
- **Future Bass** — 140–160 (or half-time). DNA: supersaw/pulse chord stabs
  with pitch-mod "cry" (detune LFO on chord sustains), trap skeleton, bright
  major-leaning emotion. Kit: supersaw + kick + snare + sub. Law: chords are
  the lead voice; keep sub mono below 120.
- **Tech House** — 122–126. DNA: "tsst-tsst" offbeat-open-hat bounce, one
  goofy earworm sample/hook, minimal stabs. Kit: kick(50,.28), clap, hat,
  pluck_bass. Law: groove over everything; if it doesn't loop hypnotically,
  cut elements.
- **Deep House** — 120–124. DNA: Rhodes-ish chords (organ voice w/ soft
  drawbars or felt piano), warm filtered bass, soulful sparse lead. Law:
  warmth and space; nothing bright, nothing rushed.
- **Progressive House** — 126–128. DNA: one idea stretched over 6–8 min,
  16-bar patient layer builds, long filter automation arcs. Law: add one
  element per 16 bars; the breakdown is a long exhale not a drop.
- **Acid Techno** — 130–140. DNA: TB-303-style squelch = saw/square through
  RESONANT lowpass with automated cutoff+resonance slides (implement: FFT-LP
  with boosted Q region via peaking mask around cutoff). Law: the filter
  automation IS the melody; 303 lines slide between notes (portamento).
- **Psytrance** — 145–150. DNA: rolling bass note on EVERY 16th (short,
  punchy, filtered), offbeat open hat, acid lines, psychedelic FX sweeps.
  Kit: kick(fund 55, tight), hat_o every offbeat, pluck/reese hybrid. Law:
  the bass never stops; it IS the kick's partner at double density.
- **UK Hardcore / Happy Hardcore** — 165–175. DNA: 4-on-floor, euphoric
  pitch-bent leads, hoover stabs (`hoover`), breakbeat fills, happy-major
  despite the speed. Law: euphoria through melody contrast against relentless
  kick.
- **Gabber / Speedcore** — 190–250+. DNA: kick_hardstyle(drive 12+) played
  AS the entire rhythm, screech stabs, aggression. Law: kick distortion
  carries everything; mix loud, master loud, no apologies.
- **Breakcore** — 160–200 BPM (180 default; 210–240 for the extreme lane).
  DNA: edited break architecture, not merely fast DnB. Build a recognizable
  2-bar break skeleton first, then mutate copies with 1/16, 1/32, and rare
  1/64 chops, reverse/shortened hits, retriggers, ghost snares, and sudden
  dropouts. Use the kit's `kick`, `snare`, and `hat` voices to synthesize an
  original break; do not download or embed a copyrighted Amen recording.
  Keep a few kick/snare landmarks audible inside each dense burst so the chaos
  has a pulse. Default to straight grid timing for the skeleton, then make the
  edits intentionally asymmetrical rather than random noise.

  | Element | Spec |
  |---|---|
  | Drum density | Start at 8–16 meaningful hits/bar, escalate to 24–40 during a drop; reserve 1/2–1 full beat of silence before major impacts. Vary velocity and use 3–8-hit machine-gun clusters only at phrase ends. |
  | Low end | Clean `sub_sine` owns <100 Hz; `reese` or driven bass owns 100–500 Hz. Sidechain or manually duck the bass around the kick so the break remains legible. Drop to half-time sub pulses for contrast. |
  | Musical palette | Minor, Phrygian, or chromatic harmony; rave stabs, hoovers, acid lines, chiptune/game tones, and classical-style arpeggios are all valid. The 2020s atmospheric lane pairs frantic breaks with wistful pads, bright anime/game colors, or sentimental melodies. |
  | Form | 4–8 bar atmosphere/introduction -> first broken groove -> 4–8 bar density escalations -> half-time or beatless breath -> maximal final mutation -> abrupt cut or short decaying tail. Change the break edit language every 4 or 8 bars; do not loop one fill unchanged for the whole track. |
  | Mix law | Keep kick/snare transients forward, high-pass the break layer around 100–150 Hz, keep sub mono below 120 Hz, and control clipping after dense clusters. Contrast is the impact: do not make every bar maximally loud. |

  Implementation sketch: schedule the base hits on a 16-step grid, render
  each hit as its own buffer, and build mutations by slicing/reordering those
  buffers or scheduling shortened repeats. For a pure-synth fallback, the
  `snare` + `hat` cluster is the break texture and the kick skeleton is the
  anchor. Distinguish it from Jungle/DnB: Breakcore foregrounds disruptive
  edits, extreme density changes, and genre-collision; it is not just a
  polished 174 BPM breakbeat.

  Research anchors checked 2026-08-26: [Breakcore](https://en.wikipedia.org/wiki/Breakcore),
  [Demystifying the Internet's Breakcore Revival](https://daily.bandcamp.com/lists/breakcore-revival-list),
  and [Amen break](https://en.wikipedia.org/wiki/Amen_break). These support
  the break manipulation, high-tempo, broad sampling, classical/game palette,
  and atmospheric revival distinctions; the renderer remains original and
  offline.
- **Jungle** — 155–170. DNA: timestretched-feeling breaks, ragga/chopped
  vocals, deep sub drops, reggae bass heritage. Distinct from DnB: rougher,
  sample-warm, half-time bass feel stronger.
- **Footwork / Juke** — 155–165. DNA: stuttered chopped vocals, syncopated
  kick battles around a steady clap, minimal everything else. Law: the
  vocal chop is percussion AND hook simultaneously.
- **Baile Funk** — 100–130. DNA: tamborzão beat (syncopated kick-snare
  cluster between house and dembow), raw party chants, cheap-and-loud
  aesthetic. Law: attitude and rhythm over polish.
- **French Filter House** — 120–125. DNA: disco loops under automated filter
  sweeps (open/close over 4–8 bars), heavy sidechain pump, phaser/flanger
  sheen. Kit: disco-era brass_stab + organ chords + four-on-floor. Law: the
  filter sweep IS the arrangement.
- **Disco / Nu-Disco** — 110–125. DNA: octave-jumping bassline (root-octave
  8ths — THE disco signature), string stabs on the ands, open hats, hi-hat
  16th shimmer. Kit: slap_bass alternating modes works great. Law: bass
  octave jumps + hats carry the joy.
- **Moombahton** — 108. DNA: house slowed down with reggaeton swing added,
  mid-range bass wubs, vocal chops. Law: it's dembow's cousin living at
  house tempo.
- **Slap House / Brazilian Bass** — 120–126. DNA: PUNCHY mid-bass doing
  octave-slide melodies front-and-center (mix it like a lead), minimal
  pop top-line. Kit: slap_bass thump mode LP'd. Law: bass is the star;
  everything else supports.
- **Hyperpop** — 130–160. DNA: pitch-shifted vocals-as-instruments, distorted
  supersaws next to bubblegum bells, whiplash arrangement jumps. Law:
  distortion and pitch extremes used musically; dynamics via whiplash not
  builds.
- **Vaporwave** — 55–70 feel. DNA: slowed-and-reverb'd nostalgia chops,
  huge wet space, drift pitch wobble exaggerated (double WOW depth), Roman
  statue mood. Kit: organ/pad + massive convolution send. Law: slower and
  wetter than feels reasonable; silence between phrases matters.
- **IDM / Braindance** — any. DNA: drill-precision fills at odd placements,
  generative-feeling melodic fragments, emotional pads under mathematical
  drums. Kit: anything + 64th-note hat clusters. Law: complexity must feel
  intentional; anchor every 8 bars with something human.
- **Glitch Hop** — 105–115. DNA: mid-tempo head-nod groove with stutter/
  bitcrush edits as fills, wide bass moves. Law: edits replace drum fills.
- **Trip-hop** — 80–95. DNA: noir dusty breakbeat, cinematic dread, deep
  dubby bass, smoky texture. Kit: kick(48, .35) + snare(.15 dec) + sub.
  Law: menace via restraint and space.

#### Hip-hop extended family

- **Grime** — 140. DNA: square-wave Eski chime lead (pulse duty .25, high
  register, icy reverb), skeletal drums, 8-bar cypher structure. Kit: pulse +
  snare + sub. Law: cold and angular; the chime motif defines the track.
- **G-funk** — 90–95. DNA: portamento sine whine leads (whistle_lead an
  octave lower with glide), P-Funk maj7/minor grooves, laid-back swing.
  Law: the whine lead floats ABOVE everything, lazy but locked.
- **Cloud rap** — 130–140 half-time. DNA: hazy detuned pads, ethereal bell
  melodies (music_box voice), sparse sliding 808s, huge soft reverb. Law:
  floaty = long releases everywhere + gentle velocity ceiling (~70).
- **Jazz rap** — 85–95. DNA: swung upright-feeling bass (slap_thump LP'd),
  brushed-feeling snare (noise-heavy, quiet crack), jazz loops, horn stabs
  (brass_stab). Law: musicians-in-a-room looseness; quantize nothing fully.
- **Crunk / Bounce** — 75–85 (or 150 half). DNA: chant hooks, 808 claps
  layered EVERYWHERE, rowdy energy. Law: call-and-response energy beats
  harmonic sophistication.

#### Rock & metal (guitars approximated — flag as stylized)

- **Punk** — 160–190. DNA: power-chord saw stacks (supersaw voices=3, drive
  high, LP 3k), driving D-beat (kick-snare-kick-kick pattern), shout-along
  hooks. Law: three chords and urgency; shorter is better.
- **Djent** — 100–140 polyrhythmic. DNA: heavily-LP'd palm-muted chug bursts
  (pulse duty .1 → LP 400 → tight gate envelope) in 4/4-vs-3 groups, clean
  ambient pads over top. Law: rhythm is the riff; chugs must be TIGHT.
- **Surf rock** — 120–150. DNA: tremolo-drenched lead (amplitude LFO 8 Hz
  deep), double-picked 16th runs (koto_pluck fast), spring-reverb-ish short
  metallic decay. Law: wet twang + minor melodrama.
- **Shoegaze** — 110–140. DNA: wall-of-reverb noise pads burying gentle
  melodies, drone strings of overlapping long notes. Law: the wash is the
  instrument; let melody peek through barely.
- **Post-rock** — 90–120. DNA: quiet-clean arps → explosive driven climax
  (same theme, add drive+layers), 6–10 min arcs. Law: ONE theme transformed
  by dynamics; the crescendo is earned by minutes of restraint.
- **Indie / garage rock** — 110–150. DNA: lo-fi drum machine feel, jangly
  koto_pluck arps as guitars, deadpan melodies. Law: charm > polish.

#### Pop, R&B, global

- **K-pop** — 110–130. DNA: max-density genre-splicing (rap verse + sung
  pre + EDM drop chorus), bridge with key change UP a semitone, every
  section its own sound world. Law: contrast BETWEEN sections is the
  product; hooks land within first 30 seconds.
- **City Pop** — 100–116. DNA: Japanese 80s yacht-funk: maj9 heaven, funky
  slap bass, glassy electric piano, sax-ish brass_stab leads. Law:
  sophisticated sunshine — jazz harmony with disco pocket.
- **Bedroom pop** — 90–110. DNA: intimate close-mic'd-feeling textures
  (lowpass everything gently), simple diatonic loops, hiss floor audible.
  Law: imperfection is intimacy; keep velocities ≤80.
- **Reggae** — 70–80. DNA: **ONE-DROP** — kick+snare hit TOGETHER on beat 3
  only (never kick on 1), off-beat skank chords (organ short stabs on
  "and"s), bubbling organ fills, fat round bass playing melodic counterpoint.
  Law: the empty beat 1 IS the groove; bass does the walking.
- **Ska** — 170–200. DNA: uptempo skank chords on off-beats (organ stabs),
  walking bass, horn section riffs (brass_stab trios). Law: upstroke
  placement decides ska vs reggae; upbeat = ska.
- **Dancehall** — 95–105. DNA: digital riddim (one bar repeated whole
  track), sparse sharp drums, bass pockets, vocal chop hooks. Law: the
  riddim is shared infrastructure; your song lives inside it.
- **Latin trap** — 140–150 half-time. DNA: trap engine + dembow ghost
  accents + dark marimba/bell leads, Spanish-flow cadence space. Law:
  marimba-ish pluck (log_drum pitched up) carries melody.
- **Cumbia** — 85–110. DNA: güira shaker pattern (constant 16th shaker with
  accent shape), syncopated kick, tropical organ/marimba leads, folk minor
  vamps. Law: the shaker is the metronome of the people.
- **Bossa nova** — 120–140 (feels half). DNA: bossa clave rim pattern
  (3-2 son clave with rim), jazz maj7/9#11 chords, whispered-feel melody,
  brushed noise snare. Law: understatement; syncopation implied not struck.
- **Bollywood / Bhangra** — 96–140. DNA: dhol-style double-sided drum
  patterns (kick+bright slappy snare pairs), dramatic orchestral stabs
  (brass_stab + strings), ornamented vocal-ish leads, tabla-like fills.
  Law: drama first — big swells, bigger stabs.
- **J-pop / anime opening** — 150–180. DNA: IV→V→iii→vi lament progressions,
  fast emotional chord rhythm, key lift for final chorus, dense bright mix.
  Law: maximum feeling per second; modulate before the last hook.
- **Celtic jig / reel** — jig 6/8 ~110 dotted-quarter, reel 4/4 ~120. DNA:
  drone fifths underneath, koto_pluck-fast runs as tin-whistle/fiddle lines,
  AABB form. Law: rolls and cuts (rapid note repetitions) decorate every
  phrase end.
- **Balkan brass** — 7/8 or 11/8 meters! DNA: blaring brass_stab choirs,
  tuba-style bass oom-pah following the odd meter, accelerando sections.
  Law: meter changes are features; speed up into the ending.
- **Klezmer** — 100–160 flexible rubato. DNA: freygish/Ahava Raba scale
  (hijaz: b2!), clarinet-ish whistle_lead with wide vibrato + glides,
  tsimbl-style koto_pluck accompaniment. Law: ornamental bends and sobbing
  glides carry the emotion.
- **Arabic maqam** — 80–110. DNA: hijaz/Nahawand scales, darbuka-style
  doum-tek rhythms (log_drum tuned variants), taqsim solo intro (unmetered
  feel = rubato single line). Law: ornament heavily; straight notes sound
  wrong.
- **Guzheng pentatonic** — 60–90. DNA: rapid pentatonic glissando runs
  (schedule 8 notes in half a beat), bend-heavy melody, spacious echo.
  Law: cascades and bends; harmony implied by pentatonic choice alone.

#### Jazz, funk & soul

- **Funk** — 95–110. DNA: THE slap bass (slap_pop/slap_thump alternation),
  Clavinet-ish 16th riffing (pulse duty .125, tight and dry), horn punches
  (brass_stab single hits), the One. Law: rhythm guitar/keys play ANTI-groove
  (silence where you expect hits); everything serves the pocket.
- **Motown / Soul** — 95–130. DNA: tambourine on every backbeat (hat_o
  layered on 2&4), baritone-sax doubling the bassline, 2/4-feel snap,
  melodic basslines that sing. Law: song first — the groove exists to serve
  a vocal melody you can hum.
- **Neo-soul** — 75–95. DNA: deliberately DRUNK timing (snare 20–40 ms
  late consistently), lush dom7#9/maj9 chords, gospel-derived passing
  chromatics. Law: push-the-beat pocket feels wrong alone, right together.
- **Swing / big band** — 180–280 BPM quarter (feels ~70). DNA: REAL swing
  ratio (2:1 long-short, not triplets), ride-pattern timekeeping, shout
  chorus brass blocks (brass_stab 4-part), walking bass quarter notes.
  Law: sections trade; the arrangement converses.
- **Blues shuffle** — 60–90. DNA: 12-bar form LAW (I-I-I-I-IV-IV-I-I-V-IV-
  I-V), swung thirds, triplet-feel licks answering each other, dominant7
  everything. Law: form never changes; expression happens inside it.
- **Gospel** — 70–100. DNA: Hammond swells (organ, long releases), passing
  diminished chromatics between diatonic plateaus, hand-clap patterns,
  semitone-up modulation for the final chorus. Law: build to the modulation
  like it's a sunrise.

#### Game, media & mood

- **Boss battle** — 140–170. DNA: chromatic tension riffs, driving timpani-
  style kicks, pipe-organ-ish stabs (organ drawbars dark), key-of-the-minor-
  2nd dread. Law: loop-tight (no outro) — it plays until the fight ends.
- **Racing / Eurobeat** — 150–160. DNA: offbeat bass GALLOP (pluck_bass
  8ths with octave jumps), supersaw anthems, "runaway" key energy, night
  mountain energy. Law: never brake — constant acceleration feel.
- **Horror score** — any (often none). DNA: tritone drones, string-scrape
  clusters (noise through narrow BP sweeps), sudden silences, low piano
  single notes with long decay. Law: weaponize absence — the quietest
  moment is the scariest.
- **Noir detective jazz** — 65–80. DNA: muted-trumpet-ish lead (whistle_lead
  darker + softer), brush-noise snare, walking bass, smoky slow reverb.
  Law: every phrase sounds like a monologue.
- **Spy theme** — 110–130. DNA: Fm vamp, brassy stabs on the ands (brass_stab
  [F,Ab,C]), twangy low melody, snare rim shots. Law: danger + elegance —
  minor but dressed up.
- **Spaghetti western** — 90–120. DNA: clip-clop gallop rhythm (two kicks +
  hat pattern), whistle_lead melody an octave up, vi–V ambiguity, trumpet-ish
  brass_stab answers. Law: vast empty space between phrases.
- **Dark ambient / drone** — beatless. DNA: evolving partials (pad_voice with
  20+s durations, slow filter movement), field-recording-ish noise beds,
  near-imperceptible change per minute. Law: nothing repeats exactly; time
  dissolves.
- **Meditation / sleep** — 50–70 or free. DNA: 0.5 notes/sec ceiling, ultra-
  long fades (30 s tails), no dissonance ever, gentle lowpassed everything.
  Law: the listener should lose track of whether music is playing.
- **Ragtime** — 100–130. DNA: stride left hand (bass note on 1&3, chord on
  2&4) against syncopated right-hand melody (felt piano, crisp), form
  AA-BB-A-CC-DD. Law: the syncopation tension between hands is everything.
- **Waltz** — 3/4! 130–180 BPM quarter. DNA: um-pah-pah bass-chord-chord,
  melody landing ON beat 1 singing across the bar. Law: FIRST 3/4 playbook —
  set bars to 3 beats; the lilt comes from bass-heavy 1 vs light 2&3.
- **March** — 110–128. DNA: military snare rudiments written out literally
  (rolls/flam-timing via rapid vel-decayed clusters), bugle-call fifth-based
  melody (brass_stab), tuba oom-pah. Law: steady as a heartbeat; nobody
  rushes a march.

#### Structural dimensions (apply across ALL genres)

- **Odd meters**: the renderer schedules arbitrary beat positions — for
  3/4 use bar length 3; for 6/8 think in dotted-quarter pulses; for 7/8
  group accents (e.g. 2+2+3) and place kicks on group heads. Set
  `TOTAL_BEATS = bars * beats_per_bar`.
- **Swing parameterization**: swing% maps to delaying every other 8th/16th
  by `swing × inter-onset` (55–62% subtle MPC feel; 2:1 = hard 66.7%;
  neo-soul drunk = flat +20 ms late snares).
- **Tempo maps**: onset times are computed pre-render — accel/rit =
  post-process event times via cumulative integral of the tempo curve;
  half-time switches = just double event spacing, same clock.
- **Modulation events**: truck-driver finale = transpose all events +1
  semitone for final N bars; J-pop lift = +2. Render stems per section if
  reverb tails need to survive the shift (they don't crossfade — cut at
  phrase boundaries).

### Ambient / cinematic sketch (non-Minecraft)

Same engine, different intent: slow swells, no percussion or single soft
heartbeat pulse, wide stereo pads, long reverb (raise IR τ to 2.5–3 s),
melody optional — texture arcs carry the piece. Think Eno drift: 2-chord
oscillation, 60–66 BPM.

## Render & delivery pipeline

0. **Path check**: pure synth render → no coordination needed. Any FL/relay/
   capture involvement → acquire the lease first (section above).
1. Copy `templates/diamond-sky.py` (ambient/Minecraft) to
   `%TEMP%\opencode\<name>.py`; for drum genres copy `templates/synth_kit.py`
   alongside it and `import synth_kit` — kick, kick_808, kick_hardstyle,
   snare, hat, clap, ride, reese, wobble_bass, sub_sine, pluck_bass,
   reverse_bass, supersaw, screech, cowbell, log_drum, pulse, rumble,
   slap_bass, hoover, organ, brass_stab, whistle_lead, koto_pluck.
   Edit score data only — engine internals are proven.
2. `py_compile` syntax check, then run (pure offline, ~1 min, deterministic).
3. Verify the MP3 by decoding it back through ffmpeg and checking stats:
   duration matches, peak in 0.7–0.95, RMS sane, tail RMS ≪ head RMS (the
   fade-out must exist). Never ship unverified audio.
4. Deliver both files on Desktop, named `<Title> - Minecraft Type.mp3/.wav`.

```powershell
ffmpeg -v error -i "<mp3>" -f f32le - | # then numpy stats
```

## Gotchas that cost real time (do not rediscover)

- **Negative event times** (jitter on bar-1 events): numpy slicing wraps
  silently around the array end — clamp `s<0` by trimming buf, don't rely on
  slice guards.
- **Beats vs seconds**: pass beats to scheduling, seconds×SR to sample math;
  convert exactly once in the dispatch loop.
- Stems are `(n, 2)` arrays; `irfft` accumulators must be `total_len`, not
  N_FFT-sized.
- If you ever capture live audio again (old flow): Realtek loopback returns
  **8 channels**, music lives in front L/R only (`audio[:, :2]`), and a
  silent-capture preflight (test note → assert rms > 0.002) is mandatory.
- PowerShell pipeline filters (`Select-Object -First`) SIGTERM long-running
  renders mid-stream; filter nothing, or match-and-exclude only.
- Write Python files with the file-write tool (never PS heredocs — BOM).

## Variation knobs

Key/tempo free (keep pentatonic-consistent melody). Mood shifts: darker =
lower register pads + slower tempo + longer reverb τ; brighter = raise
melody an octave, shorten reverb, raise sparkle count to 4. Length scales
with section count — keep intro ≥4 bars of pads-alone and always end on the
unresolved tone ringing into the fade.
