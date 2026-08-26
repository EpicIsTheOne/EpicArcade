// PRISM PULSE — song definition + deterministic chart derivation.
// Pure data/math only (no Web Audio) so Node can regenerate the shipped chart.
//
// "Neon Meridian" — original composition, A natural minor, 128 BPM, 4/4.
// Structure: Intro 8 | Verse A 16 | Build 8 | Chorus 16 | Verse B 12 |
//            Chorus 2 16 | Bridge 8 | Final Chorus 16 | Outro 6  = 106 bars.

export const SONG = {
  title: 'Neon Meridian',
  artist: 'PRISM PULSE',
  bpm: 128,
  beatsPerBar: 4,
  key: 'A minor',
};

export const SECTIONS = [
  { name: 'Intro',   bars: 8,  style: 'intro' },
  { name: 'Verse A', bars: 16, style: 'verse' },
  { name: 'Build',   bars: 8,  style: 'build' },
  { name: 'Chorus',  bars: 16, style: 'chorus' },
  { name: 'Verse B', bars: 12, style: 'verse2' },
  { name: 'Chorus II', bars: 16, style: 'chorus' },
  { name: 'Bridge',  bars: 8,  style: 'bridge' },
  { name: 'Final Chorus', bars: 16, style: 'final' },
  { name: 'Outro',   bars: 6,  style: 'outro' },
];

export const TOTAL_BARS = SECTIONS.reduce((s, x) => s + x.bars, 0);
export const TOTAL_BEATS = TOTAL_BARS * 4;
export const SONG_LENGTH = (TOTAL_BEATS * 60) / SONG.bpm; // seconds

// ---- harmony ----------------------------------------------------------------
// Chords as semitone offsets from A (A2 = 0). Voicing arrays are triads.
const CH = {
  Am: [0, 3, 7],   F: [-4, 0, 3],  C: [3, 7, 10], G: [-2, 2, 5],
  Dm: [5, 8, 12],  Em: [7, 10, 14],
};
// one chord per bar, per section style (progressions loop)
const PROGS = {
  intro:  ['Am', 'F', 'C', 'G'],
  verse:  ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G'],
  build:  ['F', 'G', 'Am', 'Em', 'F', 'G', 'Dm', 'E?'], // E? -> use Em tension
  chorus: ['C', 'G', 'Am', 'F'],
  verse2: ['Am', 'G', 'F', 'F', 'Am', 'G', 'C', 'C'],
  bridge: ['F', 'C', 'Dm', 'Am'],
  final:  ['C', 'G', 'Am', 'F'],
  outro:  ['Am', 'F', 'C', 'G'],
};
PROGS.build[7] = 'Em';

// ---- melody motifs ----------------------------------------------------------
// n = degree in A natural minor starting at A4 (0=A4,1=B4,2=C5,3=D5,4=E5,5=F5,6=G5,7=A5,8=B5,9=C6)
// b = beat within the motif timeline, d = duration in beats.
const MINOR = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17]; // semitones per degree

// 2-bar verse riff — sparse, syncopated, singable
const RIFF_VERSE = [
  { b: 0.0, d: 0.5, n: 7 }, { b: 0.5, d: 0.5, n: 6 }, { b: 1.0, d: 1.0, n: 4 },
  { b: 2.0, d: 0.5, n: 2 }, { b: 2.5, d: 0.5, n: 4 }, { b: 3.0, d: 1.25, n: 5 },
  { b: 4.0, d: 0.5, n: 7 }, { b: 4.5, d: 0.5, n: 9 }, { b: 5.0, d: 1.0, n: 7 },
  { b: 6.0, d: 0.75, n: 4 }, { b: 6.75, d: 0.25, n: 2 }, { b: 7.0, d: 1.0, n: 0 },
];
// 2-bar chorus hook — wide leaps, held resolutions
const RIFF_CHORUS = [
  { b: 0.0, d: 1.0, n: 8 }, { b: 1.0, d: 0.5, n: 7 }, { b: 1.5, d: 0.5, n: 5 },
  { b: 2.0, d: 1.5, n: 4 }, { b: 3.5, d: 0.5, n: 5 },
  { b: 4.0, d: 1.0, n: 7 }, { b: 5.0, d: 0.5, n: 9 }, { b: 5.5, d: 0.5, n: 8 },
  { b: 6.0, d: 1.5, n: 7 }, { b: 7.5, d: 0.5, n: 5 },
];
// 2-bar final-chorus variation — extra pickup run at the end (the "stream")
const RIFF_FINAL = [
  { b: 0.0, d: 1.0, n: 9 }, { b: 1.0, d: 0.5, n: 8 }, { b: 1.5, d: 0.5, n: 7 },
  { b: 2.0, d: 1.5, n: 9 }, { b: 3.5, d: 0.5, n: 7 },
  { b: 4.0, d: 1.0, n: 8 }, { b: 5.0, d: 0.5, n: 7 }, { b: 5.5, d: 0.5, n: 5 },
  { b: 6.0, d: 0.5, n: 7 }, { b: 6.5, d: 0.5, n: 8 }, { b: 7.0, d: 0.5, n: 9 },
  { b: 7.5, d: 0.5, n: 11 }, // 11 = D6 leading tone-ish run top
];
MINOR.push(19); // index 11 = D6

// 2-bar bridge motif — floating, gentle
const RIFF_BRIDGE = [
  { b: 0.0, d: 1.5, n: 4 }, { b: 1.5, d: 0.5, n: 5 }, { b: 2.0, d: 2.0, n: 7 },
  { b: 4.0, d: 1.5, n: 2 }, { b: 5.5, d: 0.5, n: 4 }, { b: 6.0, d: 2.0, n: 5 },
];

// ---- event collection --------------------------------------------------------
// Events: {t (beats abs), dur (beats), kind, freq info resolved later}
export function composeSong() {
  const ev = [];           // all musical events
  const markers = [];      // section boundaries
  let bar = 0;
  const spb = 60 / SONG.bpm;

  const degHz = (n) => 440 * Math.pow(2, MINOR[n] / 12);

  for (const sec of SECTIONS) {
    markers.push({ bar, beats: bar * 4, name: sec.name, style: sec.style });
    const prog = PROGS[sec.style] || PROGS.intro;
    for (let i = 0; i < sec.bars; i++, bar++) {
      const t0 = bar * 4;                 // absolute beat of bar start
      const chord = CH[prog[i % prog.length]] || CH.Am;
      const root = chord[0];
      const pos = (i % (sec.style === 'verse2' ? 8 : 4)); // phrase position
      const isPhraseStart = i % 4 === 0;
      const last = i === sec.bars - 1;

      // --- pad: every bar, whole note
      ev.push({ t: t0, dur: 4, kind: 'pad', chord, bright: sec.style });

      // --- bass
      if (sec.style === 'intro' || sec.style === 'bridge' || sec.style === 'outro') {
        if (isPhraseStart) ev.push({ t: t0, dur: 3.75, kind: 'bass', semi: root - 12 });
        if (!isPhraseStart) {
          ev.push({ t: t0, dur: 1.75, kind: 'bass', semi: root - 12 });
          ev.push({ t: t0 + 2, dur: 1.75, kind: 'bass', semi: root - 12 });
        }
      } else if (sec.style === 'build') {
        // driving 8th pulse, rising octave on last bar
        for (let e = 0; e < 8; e++) {
          const oct = (last && e >= 4) ? 0 : -12;
          ev.push({ t: t0 + e * 0.5, dur: 0.45, kind: 'bass', semi: root - 12 + oct, acc: e % 2 === 0 });
        }
      } else { // verse / chorus / final
        if (isPhraseStart) ev.push({ t: t0, dur: 3.5, kind: 'bass', semi: root - 12 }); // sustain -> hold notes
        for (let e = 1; e < 8; e++) {
          const off = (e === 3 || e === 7) ? 12 : 0; // octave pops for bounce
          ev.push({ t: t0 + e * 0.5, dur: 0.42, kind: 'bass', semi: root - 12 + off, acc: e % 2 === 0 });
        }
      }

      // --- drums
      const D = (t, k, v) => ev.push({ t: t0 + t, dur: 0.2, kind: 'drum', drum: k, vel: v ?? 1 });
      switch (sec.style) {
        case 'intro':
          for (let e = 0; e < 8; e++) D(e * 0.5, 'hat', e % 2 ? 0.35 : 0.55);
          if (i % 2 === 1) D(0, 'kick', 0.7);
          if (last) for (let e = 0; e < 8; e++) D(3 - 0.125 * Math.min(e, 7), 'snare', 0.25 + e * 0.06);
          break;
        case 'verse':
          D(0, 'kick'); D(2, 'kick'); if (i % 2) D(3.5, 'kick', 0.8);
          D(1, 'snare', 0.9); D(3, 'snare', 0.9);
          for (let e = 0; e < 8; e++) D(e * 0.5, 'hat', e % 2 ? 0.35 : 0.6);
          if (i % 4 === 3) D(3.75, 'openhat', 0.5);
          break;
        case 'verse2':
          D(0, 'kick'); D(2, 'kick');
          D(1, 'snare', 0.85); D(3, 'snare', 0.85);
          for (let e = 0; e < 4; e++) D(e, 'hat', 0.5); // quarter hats, calmer
          break;
        case 'build':
          D(0, 'kick'); D(1, 'kick'); D(2, 'kick'); D(3, 'kick');
          if (i >= 4) { D(1.5, 'clap', 0.6); D(3.5, 'clap', 0.6); }
          if (i >= 2) for (let e = 0; e < 8; e++) D(e * 0.5, 'hat', e % 2 ? 0.45 : 0.7);
          // snare ramp across final two bars
          if (i === 6) for (let e = 0; e < 8; e++) D(e * 0.5, 'snare', 0.3 + e * 0.07);
          if (i === 7) for (let e = 0; e < 16; e++) D(e * 0.25, 'snare', 0.3 + e * 0.05);
          break;
        case 'chorus': case 'final': {
          const full = sec.style === 'final';
          D(0, 'kick'); D(1, 'kick', full ? 1 : 0.85); D(2, 'kick'); D(3, 'kick', 0.9);
          if (full && i % 2) D(3.5, 'kick', 0.8);
          D(1, 'clap'); D(3, 'clap');
          for (let e = 0; e < 8; e++) D(e * 0.5, 'hat', e % 2 ? 0.4 : 0.65);
          if (full) for (let e = 0; e < 8; e++) D(e * 0.5 + 0.25, 'hat', 0.28);
          if (i % 4 === 0) D(0, 'crash', 0.6);
          if (last) for (let e = 0; e < 8; e++) D(3 - 0.125 * Math.min(e, 7), 'snare', 0.35 + e * 0.08);
          break;
        }
        case 'bridge':
          D(0, 'kick', 0.6); D(2, 'kick', 0.5); // heartbeat
          for (let e = 0; e < 4; e++) D(e, 'hat', 0.3);
          break;
        case 'outro':
          if (i < 3) { D(0, 'kick', 0.8); D(2, 'kick', 0.7); D(1, 'snare', 0.7); D(3, 'snare', 0.7); }
          if (i === 3) { D(0, 'kick', 0.9); } // strip down
          break;
      }
      if (last && (sec.style === 'verse' || sec.style === 'verse2')) {
        for (let e = 0; e < 4; e++) D(3 - 0.25 * e, 'snare', 0.4 + e * 0.15); // fill into next section
      }

      // --- arpeggio pluck layer (intro/bridge/outro texture, chorus sparkle)
      if (['intro', 'bridge', 'outro'].includes(sec.style)) {
        for (let s = 0; s < 8; s++) {
          const tone = chord[s % 3] + (s % 6 < 3 ? 12 : 24);
          ev.push({ t: t0 + s * 0.5, dur: 0.4, kind: 'pluck', semi: tone, vel: s % 2 ? 0.5 : 0.8 });
        }
      } else if (sec.style === 'chorus' || sec.style === 'final') {
        for (let s = 0; s < 4; s++) {
          ev.push({ t: t0 + s + 0.5, dur: 0.35, kind: 'pluck', semi: chord[(s + 1) % 3] + 12, vel: 0.45 });
        }
      }

      // --- lead melody
      let riff = null;
      if (sec.style === 'chorus' || sec.style === 'final') riff = sec.style === 'final' ? RIFF_FINAL : RIFF_CHORUS;
      else if (sec.style === 'verse' || sec.style === 'verse2') riff = RIFF_VERSE;
      else if (sec.style === 'bridge') riff = RIFF_BRIDGE;
      if (riff && !(sec.style === 'verse2' && i % 4 >= 2)) { // verse B leaves breathing room
        const m2 = (i % 2) * 4; // riff spans 2 bars
        for (const nt of riff) {
          if (nt.b >= m2 && nt.b < m2 + 4) {
            ev.push({ t: t0 + (nt.b - m2), dur: nt.d, kind: 'lead', hz: degHz(nt.n), deg: nt.n });
          }
        }
      }
      // intro/outro melodic hook fragment (recognizable bookend)
      if (sec.style === 'intro' && i >= 2) {
        const frag = [{ b: 0, d: 1, n: 4 }, { b: 1, d: 1, n: 2 }, { b: 2, d: 2, n: 0 }];
        for (const nt of frag) ev.push({ t: t0 + nt.b, dur: nt.d, kind: 'lead', hz: degHz(nt.n) * 0.5, deg: nt.n, soft: true });
      }
    }
  }

  // final hit + tail
  const endT = bar * 4;
  ev.push({ t: endT, dur: 0.2, kind: 'drum', drum: 'crash', vel: 1 });
  ev.push({ t: endT, dur: 4, kind: 'pad', chord: CH.Am, bright: 'outro', finale: true });
  ev.push({ t: endT, dur: 4, kind: 'bass', semi: -12 });

  ev.sort((a, b) => a.t - b.t);
  return { events: ev, markers, totalBeats: endT + 4 };
}

// ---- chart derivation ---------------------------------------------------------
// Lanes 0..3 left→right. Pitch-contour lane mapping keeps patterns readable:
// pentatonic-ish degree → lane via smooth wraparound mapping.
function laneForDeg(deg, prevLane) {
  const base = [0, 1, 2, 3][((deg % 4) + 4) % 4];
  return base;
}

export function deriveChart() {
  const { events, totalBeats } = composeSong();
  const bpm = SONG.bpm;
  const raw = [];
  let prevLane = -1;

  const push = (tBeats, lane, type, dur, src) =>
    raw.push({ t: +tBeats.toFixed(3), lane, type, dur: dur ? +dur.toFixed(3) : undefined, src });

  for (const e of events) {
    if (e.kind === 'lead') {
      const lane = laneForDeg(e.deg ?? 0);
      prevLane = lane;
      if ((e.dur ?? 0) >= 1.4) push(e.t, lane, 'hold', e.dur - 0.25, 'lead-sustain');
      else push(e.t, lane, 'tap', 0, 'lead');
    }
  }

  // Layer 2: kick accents on strong beats where space allows (verse groove feel)
  for (const e of events) {
    if (e.kind !== 'drum' || e.drum !== 'kick') continue;
    if (Math.abs(e.t % 2) > 0.01) continue; // only downbeats of each half-bar
    push(e.t, e.t % 4 === 0 ? 0 : 3, 'tap', 0, 'kick');
  }

  // Layer 3: bass sustains at phrase starts → holds on inner lanes
  for (const e of events) {
    if (e.kind === 'bass' && e.dur >= 3 && Math.abs(e.t % 16) < 0.01) {
      push(e.t, 1 + (Math.round(e.t / 16) % 2), 'hold', Math.min(e.dur, 2), 'bass-sustain');
    }
  }

  // Layer 4: snare backbeats fill gaps (adds body without clutter)
  for (const e of events) {
    if (e.kind !== 'drum' || e.drum !== 'snare' || e.vel < 0.8) continue;
    if (e.vel > 1.0) continue; // skip ramp rolls — those stay as pure music drama
    push(e.t, 2, 'tap', 0, 'snare');
  }

  // De-clutter: enforce minimum spacing globally and per-lane, keep priority order.
  const prio = { 'lead-sustain': 0, lead: 1, 'bass-sustain': 2, kick: 3, snare: 4 };
  raw.sort((a, b) => (a.t - b.t) || (prio[a.src] - prio[b.src]));
  const MIN_GAP = 0.24;            // beats between any two note starts (~113 ms @128)
  const MIN_LANE_GAP = 0.95;       // beats before reusing the same lane
  const out = [];
  const laneLast = [-99, -99, -99, -99];
  for (const n of raw) {
    if (n.t < 4) continue;                       // silence during count-in bars
    if (n.t > totalBeats - 2) continue;          // nothing inside the final ring-out
    const last = out[out.length - 1];
    if (last && n.t - last.t < MIN_GAP - 1e-6) continue;
    if (n.t - laneLast[n.lane] < MIN_LANE_GAP - 1e-6) continue;
    out.push(n);
    laneLast[n.lane] = n.t;
  }

  const notes = out.map(({ t, lane, type, dur }) => (type === 'hold' ? { t, lane, type, dur } : { t, lane, type }));
  return {
    format: 'prism-pulse-chart-v1',
    meta: {
      title: SONG.title, artist: SONG.artist, bpm, offset: 0,
      difficulty: 'Medium', lengthBeats: totalBeats,
    },
    notes,
  };
}

export function chartStats(chart) {
  const bpm = chart.meta.bpm;
  const durSec = chart.meta.lengthBeats * 60 / bpm;
  const taps = chart.notes.filter(n => n.type === 'tap').length;
  const holds = chart.notes.length - taps;
  const nps = +(chart.notes.length / durSec).toFixed(2);
  return { taps, holds, total: chart.notes.length, nps, durSec: +durSec.toFixed(1) };
}
