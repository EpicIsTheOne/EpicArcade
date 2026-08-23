/* PULSE-9 demo song — "Neon Transit" (original composition, generated data only)
 * 128 BPM · F minor · four-on-floor with syncopated bass, arp lead, pad keys.
 * Demonstrates: drum steps, piano-roll melody, bass, keys chords, mixer routing,
 * delay + reverb + filter FX, channel volume automation, filter automation.
 */
'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.P9 = root.P9 || {};
  Object.assign(root.P9, api);
})(typeof self !== 'undefined' ? self : this, function () {

  function createDemo() {
    const P = P9.newProject();
    P.name = 'Neon Transit';
    P.bpm = 128;
    P.swing = 0;
    P.masterVolume = 0.85;
    P.tracks = 8;
    P.playMode = 'song';
    P.currentPattern = 0;
    P.loop = { on: true, startStep: 0, endStep: 128 };

    /* ---------- channels ---------- */
    const mk = (type, name, over) => {
      const ch = P9.newChannel(type, name);
      Object.assign(ch, over || {});
      P.channels.push(ch);
      return ch;
    };

    const kick = mk('drum', 'Kick', { color: '#33e0c8', volume: 1.05, mixer: 1, params: Object.assign(P9.defaultParams('drum'), { lane: 'kick', snap: 0.7, drive: 0.25 }) });
    const clap = mk('drum', 'Clap', { color: '#7aa2ff', volume: 0.72, mixer: 2, params: Object.assign(P9.defaultParams('drum'), { lane: 'clap', tone: 0.6 }) });
    const hatC = mk('drum', 'Hat', { color: '#9aa7ff', volume: 0.5, mixer: 2, params: Object.assign(P9.defaultParams('drum'), { lane: 'hatClosed', snap: 0.8 }) });
    const hatO = mk('drum', 'Open Hat', { color: '#b7c1ff', volume: 0.42, mixer: 2, params: Object.assign(P9.defaultParams('drum'), { lane: 'hatOpen' }) });
    const bass = mk('bass', 'Bass', { color: '#ffb454', volume: 0.9, mixer: 3, params: Object.assign(P9.defaultParams('bass'), {}) });
    const keys = mk('keys', 'Keys', { color: '#a78bfa', volume: 0.55, mixer: 4, params: Object.assign(P9.defaultParams('keys'), {}) });
    const lead = mk('synth', 'Lead', { color: '#33e0c8', volume: 0.62, mixer: 5, params: Object.assign(P9.defaultParams('synth'), { detune: 14, spread: 0.5, cutoff: 4200, resonance: 4 }) });

    /* ---------- mixer strips ---------- */
    P.mixerStrips = [
      { index: 0, name: 'Master', volume: 0.85, pan: 0, muted: false, solo: false, fx: [] },
      { index: 1, name: 'Kick', volume: 0.9, pan: 0, muted: false, solo: false, fx: [] },
      {
        index: 2, name: 'Drums', volume: 0.8, pan: 0, muted: false, solo: false, fx: [
          { type: 'compressor', params: { threshold: -22, ratio: 4, attack: 0.004, release: 0.18 } },
        ],
      },
      {
        index: 3, name: 'Bass', volume: 0.85, pan: 0, muted: false, solo: false, fx: [
          { type: 'distortion', params: { drive: 0.18, tone: 0.5, level: 0.9 } },
        ],
      },
      {
        index: 4, name: 'Keys', volume: 0.75, pan: -0.12, muted: false, solo: false, fx: [
          { type: 'reverb', params: { size: 0.55, damp: 0.5, mix: 0.35 } },
        ],
      },
      {
        index: 5, name: 'Lead', volume: 0.8, pan: 0.1, muted: false, solo: false, fx: [
          { type: 'delay', params: { time: 0.281, feedback: 0.38, mix: 0.28 } },
          { type: 'chorus', params: { rate: 1.1, depth: 0.003, mix: 0.35 } },
        ],
      },
    ];

    /* ---------- helpers ---------- */
    const note = (ch, start, dur, pitch, vel) => ({ id: P9.uid('n'), ch: ch.id, start, dur, pitch, vel: vel == null ? 0.8 : vel });
    const steps = (ch, str) => {
      // str: 16 chars, 'x'=hit, 'X'=accent, '.'=off — one bar
      return str.split('').map(c => c === 'X' ? 1.27 : c === 'x' ? 1 : 0);
    };

    /* ---------- PATTERN 1: main groove (16 steps) ---------- */
    const patA = P9.newPattern('Main Groove');
    P.patterns.push(patA);
    patA.length = 16;
    patA.steps[kick.id] = ['x...', 'x...', 'x...', 'x...'].join('').split('').map(c => c === 'x' ? 1 : 0);
    patA.steps[clap.id] = '....x.......x...'.split('').map(c => c === 'x' ? 1 : 0);
    patA.steps[hatC.id] = '..x...x...x...x.'.split('').map(c => c === 'x' ? 1 : 0);
    patA.steps[hatO.id] = '......x....... .'.split('').map(c => c === 'x' ? 1 : 0);
    patA.steps[bass.id] = []; // bass via piano roll
    // bassline: F minor groove (F1=29, Ab1=32, C2=36, Eb2=39)
    patA.notes.push(
      note(bass, 0, 1.6, 29, 0.95), note(bass, 3, 0.8, 29, 0.7),
      note(bass, 6, 1.4, 36, 0.85), note(bass, 8, 1.6, 32, 0.9),
      note(bass, 11, 0.8, 29, 0.7), note(bass, 14, 1.4, 39, 0.85),
    );
    // keys: Fm stab (F3 Ab3 C4 = 53,56,60) on the ands
    patA.notes.push(
      note(keys, 2, 2, 53, 0.55), note(keys, 2, 2, 56, 0.5), note(keys, 2, 2, 60, 0.5),
      note(keys, 10, 2, 55, 0.5), note(keys, 10, 2, 58, 0.5), note(keys, 10, 2, 62, 0.5),
    );

    /* ---------- PATTERN 2: breakdown (16 steps) ---------- */
    const patB = P9.newPattern('Break');
    P.patterns.push(patB);
    patB.length = 16;
    patB.steps[kick.id] = 'x.......x.......'.split('').map(c => c === 'x' ? 1 : 0);
    patB.steps[hatC.id] = '..x...x...x...x.'.split('').map(c => c === 'x' ? 1 : 0);
    // pad chords: Fm -> Db (Db3=49? no: Db3=49 is C#3; use 49 Ab2? keep simple: Db maj = Db F Ab = 49,53,56)
    patB.notes.push(
      note(keys, 0, 8, 49, 0.5), note(keys, 0, 8, 53, 0.45), note(keys, 0, 8, 56, 0.45), note(keys, 0, 8, 61, 0.4),
      note(keys, 8, 8, 51, 0.5), note(keys, 8, 8, 56, 0.45), note(keys, 8, 8, 58, 0.45), note(keys, 8, 8, 63, 0.4),
    );
    // sparse sub bass
    patB.notes.push(note(bass, 0, 6, 29, 0.8), note(bass, 8, 6, 25, 0.75));

    /* ---------- PATTERN 3: lead arp (16 steps) ---------- */
    const patC = P9.newPattern('Lead Arp');
    P.patterns.push(patC);
    patC.length = 16;
    patC.steps[hatC.id] = 'x.x.x.x.x.x.x.x.'.split('').map(c => c === 'x' ? 1 : 0);
    patC.steps[kick.id] = 'x...x...x...x...'.split('').map(c => c === 'x' ? 1 : 0);
    // F minor arp: F4 Ab4 C5 Eb5 (65,68,72,75) 16ths
    const arp = [65, 68, 72, 75];
    for (let i = 0; i < 16; i++) {
      patC.notes.push(note(lead, i, 0.9, arp[i % 4] + (i >= 8 ? 0 : 0), 0.55 + 0.2 * ((i % 4) === 0)));
    }
    // driving octave-pedal bass under the arp (F1 -> C2 -> F1 -> Eb1... wait: F1=29, C2=36)
    patC.notes.push(
      note(bass, 0, 1.8, 29, 0.9), note(bass, 2, 1.8, 29, 0.75),
      note(bass, 4, 1.8, 36, 0.85), note(bass, 6, 1.8, 36, 0.75),
      note(bass, 8, 1.8, 29, 0.9), note(bass, 10, 1.8, 29, 0.75),
      note(bass, 12, 1.8, 39, 0.85), note(bass, 14, 1.8, 41, 0.8),
    );

    /* ---------- arrangement: 8 bars (128 steps) ---------- */
    const put = (pat, track, startStep) => P.clips.push(P9.newClip(pat.id, startStep, track, pat.length));
    put(patA, 0, 0);    // bar 1-2 groove
    put(patC, 1, 0);    // arp over groove
    put(patA, 0, 16);
    put(patC, 1, 16);
    put(patB, 2, 32);   // break bars 3-4
    put(patA, 0, 48);
    put(patC, 1, 48);
    put(patA, 0, 64);
    put(patC, 1, 64);
    put(patB, 2, 80);
    put(patA, 0, 96);
    put(patC, 1, 96);
    put(patA, 0, 112);
    put(patC, 1, 112);

    /* ---------- automation ----------
     * lead filter sweep over the whole song + master fade-in/out at ends.
     */
    P.automation.push({
      id: P9.uid('auto'),
      target: 'ch.' + lead.id + '.cutoff',
      min: 0, max: 1,
      points: [
        { t: 0, v: 0.25 }, { t: 16, v: 0.55 }, { t: 32, v: 0.2 },
        { t: 48, v: 0.6 }, { t: 64, v: 0.3 }, { t: 80, v: 0.65 },
        { t: 96, v: 0.4 }, { t: 112, v: 0.75 }, { t: 127, v: 0.8 },
      ],
      track: null,
    });
    P.automation.push({
      id: P9.uid('auto'),
      target: 'mixer.4.volume',   // keys level swells in the break
      min: 0, max: 1,
      points: [
        { t: 0, v: 0.55 }, { t: 32, v: 0.95 }, { t: 48, v: 0.55 },
        { t: 80, v: 0.95 }, { t: 96, v: 0.55 },
      ],
      track: null,
    });

    return P;
  }

  return { createDemo };
});
