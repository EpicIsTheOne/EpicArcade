/* PULSE-9 UI: Instrument editor (floating panel) */
'use strict';
(function () {
  const U = window.P9UI;
  const IN = window.P9Instrument = {};
  let app = null;
  IN.init = a => { app = a; };

  function selEl(options, current, onChange) {
    const s = U.el('select');
    for (const o of options) {
      const opt = U.el('option', { value: String(o.value) }, o.label);
      if (String(o.value) === String(current)) opt.selected = true;
      s.append(opt);
    }
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }

  IN.show = function (chId) {
    const ch = app.project.channels.find(c => c.id === chId);
    if (!ch) return;
    app.selectedChannelId = chId;
    const panel = document.getElementById('instrument-panel');
    const body = document.getElementById('inst-body');
    const title = document.getElementById('inst-title');
    panel.hidden = false;
    title.textContent = ch.name.toUpperCase() + ' · ' + ch.type.toUpperCase();
    panel.style.left = '352px';
    panel.style.top = '64px';

    body.innerHTML = '';
    if (ch.type === 'drum') return buildDrum(ch, body);
    if (ch.type === 'sampler') return buildSampler(ch, body);
    return buildSynth(ch, body);
  };

  IN.hide = function () { document.getElementById('instrument-panel').hidden = true; };

  function buildSynth(ch, body) {
    const p = ch.params;
    const grid = () => U.el('div', { class: 'knob-grid' });
    const section = (label, content) => body.append(U.el('div', { class: 'fp-section' }, U.el('h3', {}, label), content));

    // ---- oscillators ----
    const g1 = grid();
    g1.append(
      U.el('div', { class: 'knob-item' },
        U.el('div', { class: 'k-lbl' }, 'OSC A'),
        selEl(['sawtooth', 'square', 'triangle', 'sine'].map(w => ({ value: w, label: w })), p.waveA,
          v => { app.commit('wave A'); p.waveA = v; })),
      U.el('div', { class: 'knob-item' },
        U.el('div', { class: 'k-lbl' }, 'OSC B'),
        selEl(['square', 'sawtooth', 'triangle', 'sine'].map(w => ({ value: w, label: w })), p.waveB,
          v => { app.commit('wave B'); p.waveB = v; })),
      U.knob({ value: p.detune, min: 0, max: 50, label: 'DETUNE', defValue: 12, fmt: v => v.toFixed(0) + 'ct', onInput: v => { app.commitOnce('detune'); p.detune = v; } }).el,
      U.knob({ value: p.mix, min: 0, max: 1, label: 'OSC MIX', defValue: 0.4, onInput: v => { p.mix = v; } }).el,
      U.knob({ value: p.unison, min: 1, max: 3, step: 1, label: 'UNISON', defValue: 2, fmt: v => String(v | 0), onInput: v => { p.unison = v | 0; } }).el,
      U.knob({ value: p.spread, min: 0, max: 1, label: 'SPREAD', defValue: 0.35, onInput: v => { p.spread = v; } }).el,
      U.knob({ value: p.glide, min: 0, max: 0.3, label: 'GLIDE', defValue: 0, fmt: v => (v * 1000).toFixed(0) + 'ms', onInput: v => { p.glide = v; } }).el,
    );
    section('OSCILLATORS', g1);

    // ---- filter ----
    const g2 = grid();
    g2.append(
      U.knob({ value: p.cutoff, min: 60, max: 16000, curve: 'exp', label: 'CUTOFF', defValue: 3200, fmt: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0), onInput: v => { app.commitOnce('cutoff'); p.cutoff = v; } }).el,
      U.knob({ value: p.resonance, min: 0.2, max: 24, label: 'RESO', defValue: 6, fmt: v => v.toFixed(1), onInput: v => { p.resonance = v; } }).el,
      U.knob({ value: p.filterEnv, min: 0, max: 8000, label: 'F.ENV', defValue: 2600, fmt: v => v.toFixed(0), onInput: v => { p.filterEnv = v; } }).el,
    );
    section('FILTER', g2);

    // ---- envelope ----
    const g3 = grid();
    g3.append(
      U.knob({ value: p.attack, min: 0.001, max: 0.5, label: 'ATTACK', defValue: 0.005, fmt: v => (v * 1000).toFixed(0) + 'ms', onInput: v => { p.attack = v; } }).el,
      U.knob({ value: p.decay, min: 0.01, max: 1.5, label: 'DECAY', defValue: 0.18, fmt: v => (v * 1000).toFixed(0) + 'ms', onInput: v => { p.decay = v; } }).el,
      U.knob({ value: p.sustain, min: 0, max: 1, label: 'SUSTAIN', defValue: 0.55, onInput: v => { p.sustain = v; } }).el,
      U.knob({ value: p.release, min: 0.01, max: 1.5, label: 'RELEASE', defValue: 0.22, fmt: v => (v * 1000).toFixed(0) + 'ms', onInput: v => { p.release = v; } }).el,
    );
    section('ENVELOPE', g3);

    // ---- output / routing ----
    const g4 = grid();
    g4.append(
      U.knob({ value: ch.pan, min: -1, max: 1, label: 'PAN', defValue: 0, fmt: v => Math.abs(v) < 0.02 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100), onInput: v => { ch.pan = v; app.applyChannelAudio(); } }).el,
      U.knob({ value: ch.volume, min: 0, max: 1.4, label: 'LEVEL', defValue: 0.8, fmt: v => (v * 100).toFixed(0) + '%', onInput: v => { ch.volume = v; app.applyChannelAudio(); } }).el,
      U.el('div', { class: 'knob-item' }, U.el('div', { class: 'k-lbl' }, 'MIXER ROUTE'),
        selEl(Array.from({ length: 8 }, (_, i) => ({ value: i, label: i === 0 ? 'Master' : 'Insert ' + i })), ch.mixer,
          v => { app.commit('route'); ch.mixer = parseInt(v, 10); app.refreshAll(); })),
    );
    section('OUTPUT', g4);

    body.append(U.el('div', { class: 'hint-line' },
      'Knobs: drag up/down · shift = fine · double-click = type · right-click = reset'));
  }

  function buildDrum(ch, body) {
    const p = ch.params;
    const grid = () => U.el('div', { class: 'knob-grid' });
    const laneSel = U.el('div', { class: 'knob-item' },
      U.el('div', { class: 'k-lbl' }, 'SOUND'),
      selEl(P9.DRUM_LANE_KEYS.map(k => ({ value: k, label: P9.DRUM_LABELS[k] })), p.lane || 'kick',
        v => { app.commit('drum lane'); p.lane = v; app.refreshAll(); }));
    const g1 = grid();
    g1.append(laneSel,
      U.knob({ value: p.tune, min: -12, max: 12, label: 'TUNE', defValue: 0, fmt: v => (v > 0 ? '+' : '') + v.toFixed(1) + 'st', onInput: v => { p.tune = v; } }).el,
      U.knob({ value: p.decayScale, min: 0.2, max: 3, label: 'DECAY', defValue: 1, fmt: v => 'x' + v.toFixed(2), onInput: v => { p.decayScale = v; } }).el,
      U.knob({ value: p.snap, min: 0, max: 1, label: 'SNAP', defValue: 0.5, onInput: v => { p.snap = v; } }).el,
      U.knob({ value: p.tone, min: 0, max: 1, label: 'TONE', defValue: 0.5, onInput: v => { p.tone = v; } }).el,
      U.knob({ value: p.noise, min: 0, max: 1, label: 'NOISE', defValue: 0.5, onInput: v => { p.noise = v; } }).el,
      U.knob({ value: p.drive, min: 0, max: 1, label: 'DRIVE', defValue: 0.15, onInput: v => { p.drive = v; } }).el,
    );
    body.append(U.el('div', { class: 'fp-section' }, U.el('h3', {}, 'DRUM VOICE'), g1));
    body.append(U.el('div', { class: 'hint-line' },
      'Each drum channel is one voice of the synthesized kit. Add several drum channels for a full kit.'));
  }

  function buildSampler(ch, body) {
    const p = ch.params;
    const grid = () => U.el('div', { class: 'knob-grid' });
    const fileBtn = U.el('button', { class: 'mini-btn' }, p.sampleName || 'Load audio file…');
    const fileInput = U.el('input', { type: 'file', accept: 'audio/*' });
    fileInput.style.display = 'none';
    fileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (f) app.loadSampleFromFile(ch, f);
    });
    const g1 = grid();
    g1.append(
      U.el('div', { class: 'knob-item', style: 'width:150px' }, U.el('div', { class: 'k-lbl' }, 'SAMPLE'), fileBtn, fileInput),
      U.knob({ value: p.gain, min: 0, max: 2, label: 'GAIN', defValue: 1, onInput: v => { p.gain = v; } }).el,
      U.knob({ value: p.attack, min: 0.001, max: 0.5, label: 'ATTACK', defValue: 0.002, fmt: v => (v * 1000).toFixed(0) + 'ms', onInput: v => { p.attack = v; } }).el,
      U.knob({ value: p.release, min: 0.01, max: 1.5, label: 'RELEASE', defValue: 0.08, fmt: v => (v * 1000).toFixed(0) + 'ms', onInput: v => { p.release = v; } }).el,
      U.knob({ value: p.start, min: 0, max: 0.9, label: 'START', defValue: 0, fmt: v => (v * 100).toFixed(0) + '%', onInput: v => { p.start = v; } }).el,
    );
    body.append(U.el('div', { class: 'fp-section' }, U.el('h3', {}, 'SAMPLER'), g1));
    if (p.sampleName) {
      body.append(U.el('div', { class: 'hint-line' },
        'Loaded: ' + p.sampleName + ' (' + Number(p.sampleDur || 0).toFixed(2) + 's) — pitch C3..C6, root C4.'));
    }
  }
})();
