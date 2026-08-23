/* ============================================================
   Nyx DAW — project model, (de)serialization, undo/redo, demo song
   Dual environment: browser global + Node require (pure JS, no DOM).
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.NyxProject = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FORMAT_VERSION = 1;
  let _uidCounter = 1;
  function uid(prefix) { return (prefix || 'id') + '_' + (_uidCounter++) + '_' + Math.random().toString(36).slice(2, 7); }

  /* ---------------- factories ---------------- */

  function makeSynthChannel(name, color, overrides) {
    return Object.assign({
      id: uid('ch'),
      type: 'synth',
      name,
      color: color || '#5aa2ff',
      volume: 0.78,
      pan: 0,
      mute: false,
      solo: false,
      mixerTrack: 1,
      params: {
        wave: 'sawtooth', wave2: 'square', wave2Level: 0.35, detune: 8,
        attack: 0.005, decay: 0.18, sustain: 0.55, release: 0.22,
        cutoff: 5200, resonance: 6, filterEnv: 2200, octave: 0, glide: 0
      }
    }, overrides || {});
  }

  function makeDrumChannel(name, sample, color, overrides) {
    return Object.assign({
      id: uid('ch'),
      type: 'drum',
      sample,            // kick | snare | hatClosed | hatOpen | clap | tom | rim
      name,
      color: color || '#e0b34a',
      volume: 0.85,
      pan: 0,
      mute: false,
      solo: false,
      mixerTrack: 1,
      params: {}
    }, overrides || {});
  }

  function makePattern(name, length, color) {
    return { id: uid('pt'), name, length: length || 16, color: color || '#8f7bff', notes: {} };
  }

  function makeMixerTrack(index, name) {
    return {
      index, name: name || ('Insert ' + index),
      volume: index === 0 ? 0.85 : 0.78,
      pan: 0, mute: false,
      effects: []
    };
  }

  function defaultProject() {
    return {
      app: 'nyx-daw',
      version: FORMAT_VERSION,
      name: 'Untitled',
      bpm: 140,
      swing: 0,
      patterns: [],
      channels: [],
      mixer: [makeMixerTrack(0, 'Master')],
      tracks: [],           // playlist tracks: {id,name,color,clips:[{id,patternId,start,length}]}
      automation: [],       // {id,target:{channelId|mixerTrack, param}, points:[{step,value}]}
      songLength: 256       // steps (16 bars)
    };
  }

  /* ---------------- validation / migration ---------------- */

  function coerceProject(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Project data is not an object');
    if (raw.app !== 'nyx-daw') throw new Error('Not a Nyx DAW project (missing app tag)');
    const v = raw.version | 0;
    if (v > FORMAT_VERSION) throw new Error('Unsupported project version ' + v + ' (this build supports up to ' + FORMAT_VERSION + ')');
    if (v < FORMAT_VERSION) raw = migrate(raw, v);

    const p = defaultProject();
    p.name = String(raw.name || 'Untitled').slice(0, 80);
    p.bpm = clampNum(raw.bpm, 30, 300, 140);
    p.swing = clampNum(raw.swing, 0, 0.9, 0);
    p.songLength = clampNum(raw.songLength | 0, 16, 4096, 256);

    p.patterns = Array.isArray(raw.patterns) ? raw.patterns.map(function (pt) {
      const notes = {};
      if (pt.notes && typeof pt.notes === 'object') {
        for (const k in pt.notes) {
          if (!Array.isArray(pt.notes[k])) continue;
          notes[String(k)] = pt.notes[k].filter(function (n) {
            return n && typeof n === 'object' &&
              Number.isFinite(n.key) && Number.isFinite(n.step);
          }).map(function (n) {
            return { key: clampInt(n.key, 0, 132), step: Math.max(0, n.step | 0), len: clampNum(n.len, 0.05, 256, 1), vel: clampNum(n.vel, 0.01, 1, 0.8) };
          });
        }
      }
      return { id: String(pt.id || uid('pt')), name: String(pt.name || 'Pattern').slice(0, 40), length: clampInt(pt.length, 1, 1024, 16), color: safeColor(pt.color, '#8f7bff'), notes };
    }) : [];

    p.channels = Array.isArray(raw.channels) ? raw.channels.map(function (c) {
      const base = c.type === 'drum'
        ? makeDrumChannel('ch', validSample(c.sample), '#e0b34a')
        : makeSynthChannel('ch');
      const out = Object.assign(base, {});
      out.id = String(c.id || uid('ch'));
      out.name = String(c.name || base.name).slice(0, 40);
      out.type = c.type === 'drum' ? 'drum' : 'synth';
      if (out.type === 'drum') { out.sample = validSample(c.sample); out.params = {}; }
      else { out.params = Object.assign({}, makeSynthChannel('').params, sanitizeParams(c.params)); }
      out.color = safeColor(c.color, out.color);
      out.volume = clampNum(c.volume, 0, 1.5, 0.78);
      out.pan = clampNum(c.pan, -1, 1, 0);
      out.mute = !!c.mute; out.solo = !!c.solo;
      out.mixerTrack = clampInt(c.mixerTrack, 0, 63, 1);
      return out;
    }) : [];

    p.mixer = Array.isArray(raw.mixer) && raw.mixer.length ? raw.mixer.map(function (m, i) {
      const t = makeMixerTrack(i);
      t.name = String(m.name || t.name).slice(0, 24);
      t.volume = clampNum(m.volume, 0, 1.5, i === 0 ? 0.85 : 0.78);
      t.pan = clampNum(m.pan, -1, 1, 0);
      t.mute = !!m.mute;
      t.effects = Array.isArray(m.effects) ? m.effects.filter(validEffect).map(function (e) {
        return { type: e.type, enabled: e.enabled !== false, params: Object.assign({}, effectDefaults(e.type), sanitizeParams(e.params)) };
      }) : [];
      return t;
    }) : [makeMixerTrack(0, 'Master')];

    p.tracks = Array.isArray(raw.tracks) ? raw.tracks.map(function (t) {
      return {
        id: String(t.id || uid('tk')),
        name: String(t.name || 'Track').slice(0, 24),
        color: safeColor(t.color, '#3d4657'),
        clips: Array.isArray(t.clips) ? t.clips.filter(function (c) {
          return c && Number.isFinite(c.start) && typeof c.patternId === 'string';
        }).map(function (c) {
          return { id: String(c.id || uid('cl')), patternId: c.patternId, start: Math.max(0, c.start | 0), length: clampInt(c.length, 1, 4096, 16) };
        }) : []
      };
    }) : [];

    p.automation = Array.isArray(raw.automation) ? raw.automation.filter(a => a && a.target && Array.isArray(a.points)).map(function (a) {
      return {
        id: String(a.id || uid('au')),
        target: { channelId: a.target.channelId != null ? String(a.target.channelId) : null, mixerTrack: Number.isFinite(a.target.mixerTrack) ? a.target.mixerTrack : null, param: String(a.target.param || 'volume') },
        points: a.points.filter(pt => Number.isFinite(pt.step) && Number.isFinite(pt.value)).map(pt => ({ step: Math.max(0, pt.step), value: clampNum(pt.value, 0, 2, 0.8) }))
      };
    }) : [];

    // drop references to missing channels/patterns
    const chIds = new Set(p.channels.map(c => c.id));
    const ptIds = new Set(p.patterns.map(x => x.id));
    p.tracks.forEach(t => { t.clips = t.clips.filter(c => ptIds.has(c.patternId)); });
    p.automation = p.automation.filter(a => !a.target.channelId || chIds.has(a.target.channelId));
    p.channels.forEach(c => { c.mixerTrack = Math.min(c.mixerTrack, p.mixer.length - 1); });

    return p;
  }

  function migrate(raw, fromV) { // currently only v0->v1 (identical); hook for future formats
    return raw;
  }

  function clampNum(v, lo, hi, dflt) { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt; }
  function clampInt(v, lo, hi, dflt) { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt; }
  function safeColor(c, dflt) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : dflt; }
  const SAMPLES = ['kick', 'snare', 'hatClosed', 'hatOpen', 'clap', 'tom', 'rim'];
  function validSample(s) { return SAMPLES.indexOf(s) >= 0 ? s : 'kick'; }

  const EFFECT_TYPES = ['eq3', 'delay', 'reverb', 'distortion', 'compressor', 'chorus'];
  function validEffect(e) { return e && EFFECT_TYPES.indexOf(e.type) >= 0 && typeof e === 'object'; }
  function effectDefaults(type) {
    switch (type) {
      case 'eq3': return { low: 0, mid: 0, high: 0 };
      case 'delay': return { time: 0.28, feedback: 0.35, mix: 0.3 };
      case 'reverb': return { size: 0.5, mix: 0.28 };
      case 'distortion': return { drive: 0.3, mix: 1.0 };
      case 'compressor': return { threshold: -22, ratio: 4, attack: 0.005, release: 0.15 };
      case 'chorus': return { rate: 1.6, depth: 0.004, mix: 0.4 };
    }
    return {};
  }
  function sanitizeParams(params) {
    const out = {};
    if (!params || typeof params !== 'object') return out;
    for (const k in params) if (Number.isFinite(Number(params[k]))) out[k] = Number(params[k]);
    return out;
  }

  /* ---------------- undo/redo ---------------- */

  function History(getState, applyState, limit) {
    this._get = getState; this._apply = applyState;
    this.limit = limit || 80;
    this.stack = [JSON.stringify(getState())];
    this.index = 0;
    this.onChange = null;
  }
  History.prototype.commit = function (label) {
    const snap = JSON.stringify(this._get());
    if (snap === this.stack[this.index]) return false;
    this.stack.length = this.index + 1;
    this.stack.push(snap);
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length - 1;
    if (this.onChange) this.onChange(label);
    return true;
  };
  History.prototype.undo = function () {
    if (this.index <= 0) return false;
    this.index--;
    this._apply(JSON.parse(this.stack[this.index]));
    if (this.onChange) this.onChange('undo');
    return true;
  };
  History.prototype.redo = function () {
    if (this.index >= this.stack.length - 1) return false;
    this.index++;
    this._apply(JSON.parse(this.stack[this.index]));
    if (this.onChange) this.onChange('redo');
    return true;
  };
  History.prototype.canUndo = function () { return this.index > 0; };
  History.prototype.canRedo = function () { return this.index < this.stack.length - 1; };

  /* ============================================================
     DEMO COMPOSITION — "Midnight Circuit" (original, A minor)
     ============================================================ */

  function N(key, step, len, vel) { return { key, step, len: len || 1, vel: vel == null ? 0.85 : vel }; }

  // chord roots (midi): Am F C G  — one bar each, 16 steps per bar
  const CHORDS = [
    { root: 45, triad: [57, 60, 64] },   // Am (A3 C4 E4)
    { root: 41, triad: [53, 57, 60] },   // F  (F3 A3 C4)
    { root: 48, triad: [55, 60, 64] },   // C  (G3 C4 E4)
    { root: 43, triad: [55, 59, 62] }    // G  (G3 B3 D4)
  ];

  function addNotes(map, chId, arr) { map[chId] = (map[chId] || []).concat(arr); }

  function createDemoProject() {
    const p = defaultProject();
    p.name = 'Midnight Circuit';
    p.bpm = 124;

    /* --- channels --- */
    const kick = makeDrumChannel('Kick', 'kick', '#e05656', { mixerTrack: 1, volume: 1.0 });
    const clap = makeDrumChannel('Clap', 'clap', '#e08b3a', { mixerTrack: 2, volume: 0.8 });
    const hatC = makeDrumChannel('Hat Closed', 'hatClosed', '#d8cf4a', { mixerTrack: 3, volume: 0.62, pan: 0.12 });
    const hatO = makeDrumChannel('Hat Open', 'hatOpen', '#b9d84a', { mixerTrack: 3, volume: 0.5, pan: -0.1 });
    const bass = makeSynthChannel('Deep Bass', '#4ad0a8', {
      mixerTrack: 4, volume: 0.95,
      params: Object.assign(makeSynthChannel('').params, { wave: 'sawtooth', wave2: 'square', wave2Level: 0.5, detune: 4, cutoff: 900, resonance: 9, filterEnv: 1600, attack: 0.002, decay: 0.22, sustain: 0.35, release: 0.12, octave: -1 })
    });
    const keys = makeSynthChannel('Glass Keys', '#7ba7ff', {
      mixerTrack: 5, volume: 0.62, pan: -0.18,
      params: Object.assign(makeSynthChannel('').params, { wave: 'triangle', wave2: 'sine', wave2Level: 0.6, detune: 6, attack: 0.01, decay: 0.5, sustain: 0.25, release: 0.6, cutoff: 6500, resonance: 2, filterEnv: 1200 })
    });
    const pad = makeSynthChannel('Velvet Pad', '#b07bff', {
      mixerTrack: 6, volume: 0.42, pan: 0.15,
      params: Object.assign(makeSynthChannel('').params, { wave: 'sawtooth', wave2: 'sawtooth', wave2Level: 0.8, detune: 14, attack: 0.6, decay: 1.0, sustain: 0.75, release: 1.2, cutoff: 2400, resonance: 3, filterEnv: 800 })
    });
    const lead = makeSynthChannel('Neon Lead', '#ff7bd5', {
      mixerTrack: 7, volume: 0.58, pan: 0.2,
      params: Object.assign(makeSynthChannel('').params, { wave: 'square', wave2: 'sawtooth', wave2Level: 0.45, detune: 10, attack: 0.004, decay: 0.25, sustain: 0.45, release: 0.28, cutoff: 4200, resonance: 12, filterEnv: 2600 })
    });
    p.channels = [kick, clap, hatC, hatO, bass, keys, pad, lead];

    /* --- mixer: inserts + FX --- */
    while (p.mixer.length < 8) p.mixer.push(makeMixerTrack(p.mixer.length));
    p.mixer[1].name = 'Kick';
    p.mixer[2].name = 'Clap'; p.mixer[2].effects.push({ type: 'reverb', enabled: true, params: effectDefaults('reverb').size ? { size: 0.35, mix: 0.22 } : {} });
    p.mixer[3].name = 'Hats';
    p.mixer[4].name = 'Bass'; p.mixer[4].effects.push({ type: 'compressor', enabled: true, params: { threshold: -26, ratio: 5, attack: 0.004, release: 0.12 } });
    p.mixer[5].name = 'Keys'; p.mixer[5].effects.push({ type: 'chorus', enabled: true, params: { rate: 1.2, depth: 0.004, mix: 0.35 } });
    p.mixer[5].effects.push({ type: 'delay', enabled: true, params: { time: 0.242, feedback: 0.3, mix: 0.18 } }); // dotted-8th @124
    p.mixer[6].name = 'Pad'; p.mixer[6].effects.push({ type: 'reverb', enabled: true, params: { size: 0.72, mix: 0.38 } });
    p.mixer[7].name = 'Lead'; p.mixer[7].effects.push({ type: 'delay', enabled: true, params: { time: 0.242, feedback: 0.42, mix: 0.3 } });
    p.mixer[7].effects.push({ type: 'distortion', enabled: true, params: { drive: 0.14, mix: 1.0 } });

    /* --- patterns (4 bars = 64 steps each) --- */
    const patDrums = makePattern('Drums A', 64, '#e05656');
    const patBass = makePattern('Bassline', 64, '#4ad0a8');
    const patKeys = makePattern('Chords', 64, '#7ba7ff');
    const patLead = makePattern('Lead Melody', 64, '#ff7bd5');
    const patBreak = makePattern('Breakdown', 64, '#b07bff');
    p.patterns = [patDrums, patBass, patKeys, patLead, patBreak];
    const dn = patDrums.notes, bn = patBass.notes, kn = patKeys.notes, ln = patLead.notes, bkn = patBreak.notes;

    // --- drums: four bars, kick 1&3 + syncopation, clap 2&4, hats 8ths w/ accents
    for (let bar = 0; bar < 4; bar++) {
      const o = bar * 16;
      addNotes(dn, kick.id, [N(0, o, 1, 1), N(0, o + 7, 1, 0.8), N(0, o + 10, 1, 0.92)]);
      if (bar % 2 === 1) addNotes(dn, kick.id, [N(0, o + 14, 1, 0.7)]);
      addNotes(dn, clap.id, [N(0, o + 4, 1, 0.9), N(0, o + 12, 1, 0.95)]);
      for (let s = 0; s < 16; s += 2) {
        const accent = (s % 4 === 0) ? 0.85 : 0.5;
        addNotes(dn, hatC.id, [N(0, o + s, 1, accent)]);
      }
      if (bar === 3) addNotes(dn, hatO.id, [N(0, o + 14, 2, 0.7)]);
    }

    // --- bass: rolling offbeat 8ths following roots (Am F C G)
    for (let bar = 0; bar < 4; bar++) {
      const o = bar * 16, r = CHORDS[bar].root - 12; // one octave down
      addNotes(bn, bass.id, [
        N(r, o, 1, 0.95), N(r, o + 3, 1, 0.6), N(r, o + 6, 1, 0.85),
        N(r + 12, o + 8, 1, 0.7), N(r, o + 11, 1, 0.65), N(r + 7, o + 13, 1, 0.8)
      ]);
    }

    // --- keys: chord stabs on offbeats
    for (let bar = 0; bar < 4; bar++) {
      const o = bar * 16, t = CHORDS[bar].triad;
      addNotes(kn, keys.id, [
        N(t[0], o + 2, 2.5, 0.7), N(t[1], o + 2, 2.5, 0.6), N(t[2], o + 2, 2.5, 0.6),
        N(t[0], o + 9, 2, 0.6), N(t[1], o + 9, 2, 0.55), N(t[2], o + 9, 2, 0.55)
      ]);
    }

    // --- lead melody (original phrase, A minor pentatonic flavored)
    const mel = [
      // bar 1 (Am)
      [0, 76, 2, 0.9], [4, 72, 1.5, 0.7], [6, 74, 1.5, 0.75], [8, 76, 3, 0.85], [13, 79, 1.5, 0.7],
      // bar 2 (F)
      [16, 81, 2.5, 0.9], [21, 79, 1.5, 0.7], [23, 76, 2, 0.75], [27, 72, 2.5, 0.7],
      // bar 3 (C)
      [32, 79, 2, 0.85], [36, 76, 1.5, 0.7], [38, 72, 1.5, 0.7], [40, 74, 3, 0.8], [46, 76, 1.5, 0.65],
      // bar 4 (G)
      [48, 74, 2.5, 0.85], [53, 71, 1.5, 0.7], [55, 74, 2, 0.75], [59, 79, 2.5, 0.8]
    ];
    addNotes(ln, lead.id, mel.map(m => N(m[1], m[0], m[2], m[3])));

    // --- breakdown pattern (pad + sparse keys, 2 bars content repeated to 64)
    for (let bar = 0; bar < 4; bar += 2) {
      const o = bar * 16, t = CHORDS[bar / 2].triad;
      addNotes(bkn, pad.id, [
        N(t[0] - 12, o, 16, 0.7), N(t[1] - 12, o, 16, 0.6), N(t[2] - 12, o, 16, 0.6),
        N(t[0], o + 16, 16, 0.7), N(t[1], o + 16, 16, 0.6), N(t[2], o + 16, 16, 0.6)
      ]);
      addNotes(bkn, keys.id, [N(CHORDS[bar / 2].triad[2] + 12, o + 8, 4, 0.5)]);
    }

    /* --- playlist / arrangement (song = 96 steps per section block of 6 bars... keep bars) */
    const T = function (name, color) { return { id: uid('tk'), name, color, clips: [] }; };
    const tDrums = T('Drums', '#e05656'), tBass = T('Bass', '#4ad0a8'), tKeys = T('Keys', '#7ba7ff'),
      tPad = T('Pad', '#b07bff'), tLead = T('Lead', '#ff7bd5');
    p.tracks = [tPad, tKeys, tBass, tDrums, tLead];

    const CL = function (track, pat, bar, bars) {
      track.clips.push({ id: uid('cl'), patternId: pat.id, start: bar * 16, length: (bars || 4) * 16 });
    };
    // Intro (bars 0-3): pad + keys only
    CL(tPad, patBreak, 0, 4);
    CL(tKeys, patKeys, 0, 4);
    // Groove A (bars 4-11): everything
    CL(tPad, patBreak, 4, 8);
    CL(tKeys, patKeys, 4, 8);
    CL(tBass, patBass, 4, 8);
    CL(tDrums, patDrums, 4, 8);
    CL(tLead, patLead, 4, 8);
    // Breakdown (bars 12-15): drop drums+bass
    CL(tPad, patBreak, 12, 4);
    CL(tKeys, patKeys, 12, 4);
    CL(tLead, patLead, 12, 4);
    // Groove B (bars 16-23): full again
    CL(tPad, patBreak, 16, 8);
    CL(tKeys, patKeys, 16, 8);
    CL(tBass, patBass, 16, 8);
    CL(tDrums, patDrums, 16, 8);
    CL(tLead, patLead, 16, 8);
    p.songLength = 24 * 16; // 24 bars

    /* --- automation: pad filter opens through the intro; lead volume swell in breakdown */
    p.automation.push({
      id: uid('au'),
      target: { channelId: pad.id, mixerTrack: null, param: 'cutoff' },
      points: [{ step: 0, value: 500 }, { step: 48, value: 4200 }, { step: 64, value: 2600 }]
    });
    p.automation.push({
      id: uid('au'),
      target: { channelId: lead.id, mixerTrack: null, param: 'volume' },
      points: [{ step: 192, value: 0.05 }, { step: 240, value: 0.6 }]
    });

    return p;
  }

  /* ---------------- exports ---------------- */
  return {
    FORMAT_VERSION, SAMPLES, EFFECT_TYPES, effectDefaults,
    defaultProject, createDemoProject, coerceProject,
    makeSynthChannel, makeDrumChannel, makePattern, makeMixerTrack, uid,
    History
  };
});
