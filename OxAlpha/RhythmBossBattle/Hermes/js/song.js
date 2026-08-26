/* ============================================================
 * PULSEBREAK (PBK.v1) — js/song.js
 * Song "OVERTURE OF RUIN" — 130 BPM, E minor.
 * Deterministic arrangement: music events + gameplay chart are
 * derived from the SAME melodic data (sync by construction).
 * ============================================================ */
window.RB = window.RB || {};

(function (RB) {
  'use strict';

  const BPM = 130;
  const SPB = 60 / BPM;          // seconds per beat
  const BAR = SPB * 4;           // seconds per bar
  const SLOTS = 16;              // 16th-note slots per bar

  // --- pitch helpers -------------------------------------------------
  // E natural minor around E4=64: E F# G A B C D
  const NOTE = { E4: 64, Fs4: 66, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, Fs5: 78, G5: 79 };
  const ROOTS = { E: 40, G: 43, C: 36, D: 38, A: 45, B: 47 };       // bass register
  const TRIADS = {
    Em: [64, 67, 71], C: [60, 64, 67], G: [59, 62, 67],
    D: [62, 66, 69], Am: [60, 64, 69], Bm: [59, 62, 66], B: [59, 63, 66],
  };

  // --- melodic motifs: [slot, midi, lenSlots][] ----------------------
  const MOTIF = {
    intro1: [[0, NOTE.E4, 4], [8, NOTE.B4, 4]],
    intro2: [[0, NOTE.G4, 4], [8, NOTE.A4, 4]],
    verse1a: [[0, NOTE.E4, 2], [4, NOTE.G4, 2], [8, NOTE.A4, 2], [12, NOTE.B4, 3]],
    verse1b: [[0, NOTE.D5, 2], [6, NOTE.B4, 2], [10, NOTE.A4, 2], [14, NOTE.G4, 2]],
    verse1c: [[0, NOTE.E4, 2], [4, NOTE.G4, 2], [8, NOTE.B4, 2], [12, NOTE.E5, 3]],
    verse1d: [[0, NOTE.D5, 2], [6, NOTE.B4, 2], [10, NOTE.D5, 2], [14, NOTE.B4, 2]],
    chorus1: [[0, NOTE.B4, 2], [4, NOTE.D5, 2], [6, NOTE.E5, 2], [8, NOTE.D5, 4], [12, NOTE.B4, 2], [14, NOTE.D5, 2]],
    chorus2: [[0, NOTE.E5, 2], [4, NOTE.B4, 6], [12, NOTE.A4, 2], [14, NOTE.B4, 2]],
    bridge1: [[0, NOTE.E4, 6], [10, NOTE.G4, 2], [14, NOTE.A4, 2]],
    bridge2: [[0, NOTE.B4, 8], [12, NOTE.A4, 4]],
    final1: [[0, NOTE.E5, 1], [1, NOTE.E5, 1], [4, NOTE.G5, 2], [6, NOTE.E5, 2], [8, NOTE.D5, 4], [12, NOTE.E5, 2], [14, NOTE.D5, 2]],
    final2: [[0, NOTE.B4, 2], [4, NOTE.D5, 2], [8, NOTE.E5, 6], [15, NOTE.G5, 1]],
    run: [[8, 64, 1], [9, 66, 1], [10, 67, 1], [11, 69, 1], [12, 71, 1], [13, 72, 1], [14, 74, 1], [15, 76, 1]],
    outro1: [[0, NOTE.E5, 8], [8, NOTE.E4, 8]],
  };

  // --- section plan ---------------------------------------------------
  // type drives drums/bass/pad styling; prog = chord per bar (cycles);
  // motifs = lead phrases cycled per bar.
  const PLAN = [
    { id: 'countin', name: '',            bars: 1,  type: 'countin', intensity: 0 },
    { id: 'intro',   name: 'OVERTURE',    bars: 4,  type: 'intro',   intensity: 0.25, prog: ['Em', 'C', 'G', 'D'],
      motifs: [MOTIF.intro1, MOTIF.intro2] },
    { id: 'verseA',  name: 'VERSE A',     bars: 16, type: 'verse',   intensity: 0.45, prog: ['Em', 'G', 'C', 'D'],
      motifs: [MOTIF.verse1a, MOTIF.verse1b, MOTIF.verse1c, MOTIF.verse1d] },
    { id: 'chorusA', name: 'CHORUS \u2014 SHARD BARRAGE', bars: 16, type: 'chorus', intensity: 0.70, prog: ['C', 'G', 'D', 'Em'],
      motifs: [MOTIF.chorus1, MOTIF.chorus2] },
    { id: 'bridge',  name: 'BRIDGE \u2014 RESONANCE CHARGE', bars: 8, type: 'bridge', intensity: 0.55, prog: ['Am', 'Em', 'C', 'B'],
      motifs: [MOTIF.bridge1, MOTIF.bridge2] },
    { id: 'verseB',  name: 'VERSE B',     bars: 16, type: 'verseB',  intensity: 0.78, prog: ['Em', 'G', 'C', 'D'],
      motifs: [MOTIF.verse1c, MOTIF.verse1b, MOTIF.verse1a, MOTIF.verse1d] },
    { id: 'final',   name: 'FINAL CHORUS \u2014 LAST ENCORE', bars: 16, type: 'final', intensity: 1.0, prog: ['C', 'G', 'D', 'Em'],
      motifs: [MOTIF.final1, MOTIF.final2, MOTIF.chorus1, MOTIF.final2] },
    { id: 'outro',   name: 'OUTRO',       bars: 2,  type: 'outro',   intensity: 0.5,  prog: ['C', 'Em'],
      motifs: [MOTIF.outro1] },
  ];

  // Guard placements per section type (bar-index-within-cycle -> slots).
  const GUARDS = {
    intro: { from: 3, every: 4, slots: [8] },
    verse: { from: 2, every: 2, slots: [8] },
    chorus: { from: 2, every: 2, slots: [4, 12] },
    verseB: { from: 2, every: 2, slots: [4, 12] },
    final: { from: 2, every: 1, slots: [4, 12] },
  };
  // Surge placements: sectionId -> [barInSection, slot][]
  const SURGES = {
    bridge: [[0, 0], [1, 8], [2, 0], [3, 8], [5, 0], [6, 8]],
    final: [[4, 0], [12, 0]],
  };

  // --- deterministic lane assigner ------------------------------------
  let laneRng = 1;
  function rnd() { laneRng = (laneRng * 1664525 + 1013904223) >>> 0; return laneRng / 4294967296; }
  function resetLaneRng(seed) { laneRng = seed >>> 0 || 1; }
  function pickLane(prev) {
    let l = Math.floor(rnd() * 4);
    if (l === prev) l = (l + 1 + Math.floor(rnd() * 3)) % 4;
    return l;
  }

  // --- builders --------------------------------------------------------
  function build() {
    const ev = [];   // audio events {t,k,...}
    const chart = []; // notes {t,lane,kind,intensity}
    const sections = [];
    let bar0 = 0;
    let prevLane = -1;

    for (const sec of PLAN) {
      const startBar = bar0;
      const t0 = bar0 * BAR;
      sections.push({ id: sec.id, name: sec.name, type: sec.type, intensity: sec.intensity,
        startT: t0, dur: sec.bars * BAR, startBar, bars: sec.bars });

      for (let b = 0; b < sec.bars; b++) {
        const bt = t0 + b * BAR;                 // bar start time
        const chordName = sec.prog ? sec.prog[b % sec.prog.length] : null;

        if (sec.type === 'countin') {
          for (let q = 0; q < 4; q++) ev.push({ t: bt + q * SPB, k: 'tick', hi: q === 0 });
          continue;
        }

        const st = sec.intensity;
        // ---- drums ----
        if (sec.type === 'intro') {
          ev.push({ t: bt, k: 'kick', v: 0.7 });
          if (b >= 2) for (let s = 2; s < SLOTS; s += 2) ev.push({ t: bt + s * SPB / 4, k: 'hat', v: 0.25 });
        } else if (sec.type === 'verse') {
          ev.push({ t: bt, k: 'kick', v: 0.95 }, { t: bt + 8 * SPB / 4, k: 'kick', v: 0.85 });
          if (b % 2 === 1) ev.push({ t: bt + 10 * SPB / 4, k: 'kick', v: 0.6 });
          ev.push({ t: bt + 4 * SPB / 4, k: 'snare', v: 0.9 }, { t: bt + 12 * SPB / 4, k: 'snare', v: 0.9 });
          for (let s = 2; s < SLOTS; s += 2) ev.push({ t: bt + s * SPB / 4, k: 'hat', v: s % 4 === 0 ? 0.5 : 0.3 });
          if (b === 0) ev.push({ t: bt, k: 'crash', v: 0.6 });
        } else if (sec.type === 'chorus') {
          ev.push({ t: bt, k: 'kick', v: 1 }, { t: bt + 8 * SPB / 4, k: 'kick', v: 0.9 });
          if (b % 2 === 1) ev.push({ t: bt + 14 * SPB / 4, k: 'kick', v: 0.7 });
          ev.push({ t: bt + 4 * SPB / 4, k: 'snare', v: 1 }, { t: bt + 12 * SPB / 4, k: 'snare', v: 1 });
          for (let s = 2; s < SLOTS; s += 2) ev.push({ t: bt + s * SPB / 4, k: 'hat', v: 0.42 });
          if (b % 2 === 0) ev.push({ t: bt, k: 'crash', v: 0.8 });
        } else if (sec.type === 'bridge') {
          ev.push({ t: bt, k: 'kick', v: 0.9 });
          ev.push({ t: bt + 8 * SPB / 4, k: 'snare', v: 0.8 });
          for (let s = 0; s < SLOTS; s += 4) ev.push({ t: bt + s * SPB / 4, k: 'hat', v: 0.22 });
        } else if (sec.type === 'verseB') {
          ev.push({ t: bt, k: 'kick', v: 0.95 }, { t: bt + 8 * SPB / 4, k: 'kick', v: 0.85 });
          if (b % 2 === 1) ev.push({ t: bt + 11 * SPB / 4, k: 'kick', v: 0.6 });
          ev.push({ t: bt + 4 * SPB / 4, k: 'snare', v: 1 }, { t: bt + 12 * SPB / 4, k: 'snare', v: 1 });
          for (let s = 1; s < SLOTS; s += 2) ev.push({ t: bt + s * SPB / 4, k: 'hat', v: 0.3 });
          if (b === 0) ev.push({ t: bt, k: 'crash', v: 0.7 });
        } else if (sec.type === 'final') {
          for (let s = 0; s < SLOTS; s += 4) ev.push({ t: bt + s * SPB / 4, k: 'kick', v: 1 });
          ev.push({ t: bt + 4 * SPB / 4, k: 'snare', v: 1 }, { t: bt + 12 * SPB / 4, k: 'snare', v: 1 });
          for (let s = 0; s < SLOTS; s += 1) ev.push({ t: bt + s * SPB / 4, k: 'hat', v: s % 2 === 0 ? 0.4 : 0.22 });
          if (b % 2 === 0) ev.push({ t: bt, k: 'crash', v: 0.9 });
        } else if (sec.type === 'outro') {
          ev.push({ t: bt, k: 'kick', v: 0.8 });
          if (b === 0) ev.push({ t: bt, k: 'crash', v: 1 });
        }

        // ---- bass ----
        if (chordName && sec.type !== 'outro') {
          const r = ROOTS[chordName[0]];
          if (sec.type === 'bridge') {
            ev.push({ t: bt, k: 'bass', m: r, d: BAR * 0.9, v: 0.8 });
          } else if (sec.type === 'intro') {
            ev.push({ t: bt, k: 'bass', m: r, d: SPB * 1.6, v: 0.65 });
            ev.push({ t: bt + 2 * SPB, k: 'bass', m: r, d: SPB * 1.4, v: 0.5 });
          } else {
            for (let s = 0; s < SLOTS; s += 2) {
              const oct = (s === 14 && sec.type !== 'intro') ? 12 : 0;
              const acc = (s === 0 || s === 8) ? 0.85 : 0.6;
              ev.push({ t: bt + s * SPB / 4, k: 'bass', m: r + oct, d: SPB * 0.42, v: acc });
            }
          }
        } else if (chordName && sec.type === 'outro') {
          ev.push({ t: bt, k: 'bass', m: ROOTS.C, d: BAR, v: 0.6 });
        }

        // ---- pads ----
        if (chordName && (sec.type === 'intro' || sec.type === 'bridge' || sec.type === 'outro')) {
          ev.push({ t: bt, k: 'pad', ch: TRIADS[chordName], d: BAR * 1.05, v: sec.type === 'bridge' ? 0.5 : 0.42 });
        } else if (chordName && (sec.type === 'chorus' || sec.type === 'final')) {
          ev.push({ t: bt, k: 'pad', ch: TRIADS[chordName], d: BAR * 1.05, v: 0.26 });
        }

        // ---- lead melody => STRIKE chart notes (sync by construction) ----
        if (sec.motifs) {
          const mot = sec.motifs[b % sec.motifs.length];
          for (const [slot, m, len] of mot) {
            const t = bt + slot * SPB / 4;
            const d = len * SPB / 4;
            ev.push({ t, k: 'lead', m, d, v: 0.5 + st * 0.3 });
            const lane = pickLane(prevLane);
            prevLane = lane;
            chart.push({ t, lane, kind: 'S', intensity: st });
          }
        }

        // ---- boss stabs + GUARD notes ----
        const g = GUARDS[sec.type];
        if (g && b >= g.from && (b - g.from) % g.every === 0) {
          for (const slot of g.slots) {
            const t = bt + slot * SPB / 4;
            ev.push({ t, k: 'stab', ch: TRIADS[chordName || 'Em'], v: 0.55 + st * 0.4 });
            const lane = pickLane(prevLane);
            prevLane = lane;
            const dmg = Math.round(6 + 14 * st);
            chart.push({ t, lane, kind: 'G', intensity: st, dmg });
          }
        }

        // ---- SURGE notes ----
        const sg = SURGES[sec.id];
        if (sg) {
          for (const [sb, slot] of sg) {
            if (sb === b) {
              const t = bt + slot * SPB / 4;
              ev.push({ t, k: 'surgeSfx', v: 0.5 });
              const lane = pickLane(prevLane);
              prevLane = lane;
              chart.push({ t, lane, kind: 'U', intensity: st });
            }
          }
        }
      }
      bar0 += sec.bars;
    }

    // special "final blow" cue near song end (visual sting)
    const songDur = bar0 * BAR;

    ev.sort((a, b) => a.t - b.t);
    chart.sort((a, b) => a.t - b.t);
    return { ev, chart, sections, songDur, bpm: BPM, spb: SPB, bar: BAR };
  }

  // --- balance: compute perfect-play damage, size the boss -------------
  function balance(chart) {
    let combo = 0, dmg = 0, meter = 0;
    const SURGE_GAIN = 34, SPECIAL_DMG = 110;
    for (const n of chart) {
      if (n.kind === 'S') { combo++; dmg += 24 + Math.min(combo, 48) / 48 * 8; }
      else if (n.kind === 'U') { meter += SURGE_GAIN; if (meter >= 100) { meter -= 100; dmg += SPECIAL_DMG; } }
    }
    return Math.round(dmg);
  }

  const data = build();
  data.perfectDamage = balance(data.chart);
  data.bossMaxHP = Math.round(data.perfectDamage * 0.70);
  data.playerMaxHP = 100;

  RB.SONG = data;

})(window.RB);
