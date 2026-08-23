/* ============================================================
   Nyx DAW — synthesizer editor window (per-channel params)
   Every knob writes straight into channel params and is audible
   on the next triggered note.
   ============================================================ */
(function () {
  'use strict';
  const UI = window.NyxUI;
  const el = UI.el;

  const WAVES = ['sawtooth', 'square', 'triangle', 'sine'];

  function wrap(knob, label) {
    const w = el('div', 'labeled-knob');
    w.appendChild(knob);
    const s = el('span', '', w);
    s.textContent = label;
    return w;
  }

  UI.openSynthWindow = function (ch) {
    if (ch.type !== 'synth') return;
    UI.openWindow('win-synth-' + ch.id, ch.name + ' — synth editor', function (body) {
      build(body, ch);
    }, 260 + Math.floor(Math.random() * 120), 110 + Math.floor(Math.random() * 80));
  };

  function sectionTitle(body, text) {
    const t = el('div', 'sy-section', body);
    t.textContent = text;
  }

  function build(body, ch) {
    body.innerHTML = '';
    body.className = 'nw-body synth-win';
    const P = ch.params;

    // header: name + color
    const head = el('div', 'sy-head', body);
    const dot = el('span', 'ch-dot big', head);
    dot.style.background = ch.color;
    const nameIn = document.createElement('input');
    nameIn.type = 'text'; nameIn.value = ch.name; nameIn.className = 'text-input';
    nameIn.addEventListener('change', function () {
      ch.name = nameIn.value.trim().slice(0, 40) || ch.name;
      nameIn.value = ch.name;
      UI.buildRack(); UI.buildMixer(); UI.commit('rename');
    });
    head.appendChild(nameIn);

    /* --- oscillators --- */
    sectionTitle(body, 'OSCILLATORS');
    const oscRow = el('div', 'sy-row', body);

    const w1sel = selectFrom(WAVES, P.wave, 'osc 1 waveform');
    w1sel.addEventListener('change', function () { P.wave = w1sel.value; UI.commit('wave'); });
    oscRow.appendChild(wrapSelect(w1sel, 'OSC 1'));

    const w2sel = selectFrom(WAVES, P.wave2, 'osc 2 waveform');
    w2sel.addEventListener('change', function () { P.wave2 = w2sel.value; UI.commit('wave2'); });
    oscRow.appendChild(wrapSelect(w2sel, 'OSC 2'));

    oscRow.appendChild(wrap(UI.knob({
      min: 0, max: 1, value: P.wave2Level, default: 0.35, label: 'osc 2 level',
      fmt: v => Math.round(v * 100) + '%',
      onInput: v => { P.wave2Level = v; }, onChange: () => UI.commit('osc mix')
    }), 'MIX'));

    oscRow.appendChild(wrap(UI.knob({
      min: 0, max: 40, value: P.detune, default: 8, step: 1, label: 'detune (cents)',
      fmt: v => Math.round(v) + 'ct',
      onInput: v => { P.detune = v; }, onChange: () => UI.commit('detune')
    }), 'DETUNE'));

    oscRow.appendChild(wrap(UI.knob({
      min: -2, max: 2, value: P.octave, default: 0, step: 1, size: 22, label: 'octave',
      fmt: v => (v > 0 ? '+' : '') + Math.round(v),
      onInput: v => { P.octave = Math.round(v); }, onChange: () => UI.commit('octave')
    }), 'OCT'));

    /* --- filter --- */
    sectionTitle(body, 'FILTER');
    const filtRow = el('div', 'sy-row', body);
    filtRow.appendChild(wrap(UI.knob({
      min: 60, max: 16000, value: P.cutoff, default: 5200, log: true, label: 'cutoff',
      fmt: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v) + '',
      onInput: v => { P.cutoff = v; }, onChange: () => UI.commit('cutoff')
    }), 'CUTOFF'));
    filtRow.appendChild(wrap(UI.knob({
      min: 0.1, max: 24, value: P.resonance, default: 6, label: 'resonance (Q)',
      fmt: v => v.toFixed(1),
      onInput: v => { P.resonance = v; }, onChange: () => UI.commit('resonance')
    }), 'RESO'));
    filtRow.appendChild(wrap(UI.knob({
      min: 0, max: 10000, value: P.filterEnv, default: 2200, label: 'envelope amount',
      fmt: v => Math.round(v) + '',
      onInput: v => { P.filterEnv = v; }, onChange: () => UI.commit('filter env')
    }), 'ENV AMT'));

    /* --- amp envelope --- */
    sectionTitle(body, 'AMP ENVELOPE');
    const envRow = el('div', 'sy-row', body);
    envRow.appendChild(wrap(UI.knob({
      min: 0.001, max: 2, value: P.attack, default: 0.005, log: true, label: 'attack',
      fmt: ms, onInput: v => { P.attack = v; }, onChange: () => UI.commit('attack')
    }), 'ATT'));
    envRow.appendChild(wrap(UI.knob({
      min: 0.01, max: 3, value: P.decay, default: 0.18, log: true, label: 'decay',
      fmt: ms, onInput: v => { P.decay = v; }, onChange: () => UI.commit('decay')
    }), 'DEC'));
    envRow.appendChild(wrap(UI.knob({
      min: 0, max: 1, value: P.sustain, default: 0.55, label: 'sustain',
      fmt: v => Math.round(v * 100) + '%',
      onInput: v => { P.sustain = v; }, onChange: () => UI.commit('sustain')
    }), 'SUS'));
    envRow.appendChild(wrap(UI.knob({
      min: 0.01, max: 4, value: P.release, default: 0.22, log: true, label: 'release',
      fmt: ms, onInput: v => { P.release = v; }, onChange: () => UI.commit('release')
    }), 'REL'));

    /* --- routing & test --- */
    sectionTitle(body, 'ROUTING');
    const routeRow = el('div', 'sy-row', body);
    const insSel = document.createElement('select');
    insSel.className = 'fx-select';
    UI.project.mixer.forEach(function (t, i) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = i === 0 ? 'Master' : ((t.name || 'Insert ' + i));
      insSel.appendChild(o);
    });
    insSel.value = String(UI.clamp(ch.mixerTrack, 0, UI.project.mixer.length - 1));
    insSel.addEventListener('change', function () {
      ch.mixerTrack = parseInt(insSel.value, 10);
      UI.buildRack();
      UI.commit('route');
    });
    routeRow.appendChild(wrapSelect(insSel, 'MIXER INSERT'));

    const prevBtn = el('button', 'btn small', routeRow);
    prevBtn.textContent = '▶ Test note (A4)';
    prevBtn.addEventListener('click', function () {
      const e = UI.engine;
      e.ensureContext();
      if (e.ctx.state === 'suspended') e.ctx.resume();
      e.triggerChannel(ch, 69, e.ctx.currentTime + 0.03, 0.5, 0.9);
    });

    function ms(v) { return v < 1 ? Math.round(v * 1000) + 'ms' : v.toFixed(2) + 's'; }
  }

  function selectFrom(options, current, title) {
    const s = document.createElement('select');
    s.className = 'fx-select';
    options.forEach(function (o) {
      const opt = document.createElement('option');
      opt.value = o; opt.textContent = o;
      s.appendChild(opt);
    });
    s.value = current;
    s.title = title;
    return s;
  }

  function wrapSelect(sel, label) {
    const w = el('div', 'labeled-knob sel-wrap');
    w.appendChild(sel);
    const s = el('span', '', w);
    s.textContent = label;
    return w;
  }

})();
