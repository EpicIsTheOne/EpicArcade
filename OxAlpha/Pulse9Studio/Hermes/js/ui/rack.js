/* ============================================================
   Nyx DAW — channel rack + step sequencer + instrument browser
   ============================================================ */
(function () {
  'use strict';
  const UI = window.NyxUI, NP = window.NyxProject;
  const el = UI.el, $ = UI.$;

  const STEP_W = 21, ROW_H = 26, BAR_GAP = 6;

  /* ---------------- channel list ---------------- */

  UI.buildRack = function () {
    const list = $('#chList');
    list.innerHTML = '';
    const proj = UI.project;
    if (!proj.channels.find(c => c.id === UI.sel.channelId) && proj.channels[0]) UI.sel.channelId = proj.channels[0].id;

    proj.channels.forEach(function (ch) {
      const row = el('div', 'ch-row' + (ch.id === UI.sel.channelId ? ' sel' : ''), list);
      row.dataset.channelId = ch.id;

      const ledM = el('div', 'led' + (ch.mute ? ' on' : ''), row); ledM.title = 'Mute'; ledM.classList.add('led-mute');
      const ledS = el('div', 'led' + (ch.solo ? ' on' : ''), row); ledS.title = 'Solo'; ledS.classList.add('led-solo');

      const dot = el('span', 'ch-dot', row); dot.style.background = ch.color;
      const name = el('span', 'ch-name', row);
      name.textContent = ch.name;
      name.title = ch.type === 'drum' ? 'Drum: ' + ch.sample : 'Synth';

      const volK = UI.knob({
        min: 0, max: 1.25, value: ch.volume, default: 0.78, size: 20, label: ch.name + ' volume',
        fmt: v => Math.round(v * 100) + '%',
        onInput: function (v) { ch.volume = v; },
        onChange: function () { UI.commit('channel volume'); }
      });
      volK.classList.add('ch-knob');
      row.appendChild(volK);

      const panK = UI.knob({
        min: -1, max: 1, value: ch.pan, default: 0, size: 20, label: ch.name + ' pan',
        fmt: v => Math.abs(v) < 0.02 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100),
        onInput: function (v) { ch.pan = v; },
        onChange: function () { UI.commit('channel pan'); }
      });
      panK.classList.add('ch-knob');
      row.appendChild(panK);

      const openBtn = el('button', 'mini-btn', row);
      openBtn.textContent = ch.type === 'drum' ? '⚙' : '♪';
      openBtn.title = ch.type === 'drum' ? 'Drum settings' : 'Open in piano roll';

      // --- events
      row.addEventListener('pointerdown', function (ev) {
        if (ev.target === ledM) { ch.mute = !ch.mute; ledM.classList.toggle('on', ch.mute); UI.commit('mute'); return; }
        if (ev.target === ledS) { ch.solo = !ch.solo; ledS.classList.toggle('on', ch.solo); UI.commit('solo'); return; }
        if (UI.sel.channelId !== ch.id) {
          UI.sel.channelId = ch.id;
          list.querySelectorAll('.ch-row').forEach(r => r.classList.toggle('sel', r.dataset.channelId === ch.id));
          UI.mark('rack');
        }
      });
      name.addEventListener('dblclick', function () {
        const n = prompt('Channel name:', ch.name);
        if (n != null && n.trim()) { ch.name = n.trim().slice(0, 40); name.textContent = ch.name; UI.buildMixer(); UI.commit('rename'); }
      });
      openBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (ch.type === 'synth') { UI.openSynthWindow(ch); UI.setView('piano'); }
        else UI.openWindow('win-' + ch.id, ch.name + ' — drum voice', function (body) { buildDrumWindow(body, ch); }, 320, 160);
      });
    });

    // add-channel button
    const addRow = el('div', 'ch-add-row', list);
    const addBtn = el('button', 'add-ch-btn', addRow);
    addBtn.textContent = '+ Add channel';
    addBtn.addEventListener('click', function () { $('#browserPanel').scrollIntoView({ behavior: 'smooth' }); UI.toast('Pick an instrument in the browser →'); });

    UI.mark('rack');
  };

  function buildDrumWindow(body, ch) {
    body.innerHTML = '';
    body.className = 'nw-body drum-win';
    const info = el('div', 'dw-info', body);
    info.textContent = ch.name + ' — synthesized ' + ch.sample + ' voice';
    const knobRow = el('div', 'dw-row', body);
    const volKnob = UI.knob({ min: 0, max: 1.25, value: ch.volume, default: 0.85, label: 'volume', fmt: v => Math.round(v * 100) + '%', onInput: v => { ch.volume = v; }, onChange: () => UI.commit('drum volume') });
    knobRow.appendChild(wrapLabeled(volKnob, 'VOL'));
    const panKnob = UI.knob({ min: -1, max: 1, value: ch.pan, default: 0, label: 'pan', fmt: v => Math.abs(v) < 0.02 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100), onInput: v => { ch.pan = v; }, onChange: () => UI.commit('drum pan') });
    knobRow.appendChild(wrapLabeled(panKnob, 'PAN'));
    const prevBtn = el('button', 'btn small', body);
    prevBtn.textContent = '▶ Preview';
    prevBtn.addEventListener('click', function () {
      const e = UI.engine; e.ensureContext();
      if (e.ctx.state === 'suspended') e.ctx.resume();
      e.triggerChannel(ch, 60, e.ctx.currentTime + 0.03, 0.2, 0.95);
    });
  }

  function wrapLabeled(knob, label) {
    const w = document.createElement('div');
    w.className = 'labeled-knob';
    w.appendChild(knob);
    const s = document.createElement('span');
    s.textContent = label;
    w.appendChild(s);
    return w;
  }

  /* ---------------- step sequencer grid (canvas) ---------------- */

  let rackState = null;

  UI.drawRackGrid = function () {
    const cv = $('#rackGrid');
    const pat = currentPattern();
    const dpr = window.devicePixelRatio || 1;
    const cssW = cv.parentElement.clientWidth - 12;
    const rows = UI.project.channels.length;
    const cssH = Math.max(120, rows * ROW_H + 14);
    if (cv.width !== cssW * dpr || cv.height !== cssH * dpr) { cv.width = cssW * dpr; cv.height = cssH * dpr; cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px'; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (!pat || rows === 0) {
      ctx.fillStyle = '#5a6478';
      ctx.font = '13px system-ui';
      ctx.fillText('No channels. Add instruments from the Browser panel.', 14, 30);
      rackState = { cols: 0 };
      return;
    }

    const st = getRackScroll(pat, cssW);
    const firstStep = st.firstStep, cols = st.cols;

    // header numbers
    ctx.font = '10px ui-monospace, monospace';
    for (let i = 0; i < cols; i++) {
      const s = firstStep + i;
      const x = 8 + i * (STEP_W + (beatOf(s) === 15 ? BAR_GAP : 0)) - 8;
      if ((s & 3) === 0) {
        ctx.fillStyle = '#77839b';
        ctx.fillText(String(Math.floor(s / 4) % 4 + 1), x + STEP_W / 2 - 2, 11);
      }
    }

    UI.project.channels.forEach(function (ch, r) {
      const y = 18 + r * ROW_H;
      // row bg alternating + selected channel highlight
      if (ch.id === UI.sel.channelId) { ctx.fillStyle = 'rgba(90,140,255,0.07)'; ctx.fillRect(0, y - 2, cssW, ROW_H); }
      else if (r % 2) { ctx.fillStyle = 'rgba(255,255,255,0.02)'; ctx.fillRect(0, y - 2, cssW, ROW_H); }

      // dim row when channel muted / not soloed
      const anySolo = UI.project.channels.some(c => c.solo);
      const audible = !ch.mute && (!anySolo || ch.solo);
      ctx.globalAlpha = audible ? 1 : 0.35;

      const notesByStep = stepNotes(pat, ch.id);
      for (let i = 0; i < cols; i++) {
        const s = firstStep + i;
        if (s >= pat.length) break;
        const x = 8 + i * STEP_W + Math.floor(s / 16) * BAR_GAP;
        const beat = beatOf(s);
        const has = notesByStep.has(s);

        // cell
        if (has) {
          ctx.fillStyle = ch.color;
          ctx.fillRect(x, y + 4, STEP_W - 3, ROW_H - 10);
        } else {
          ctx.fillStyle = (s & 3) < 2 ? '#2c3345' : '#232937';
          ctx.fillRect(x, y + 4, STEP_W - 3, ROW_H - 10);
        }
        // playing column indicator
        if (UI.playing && rackPlayingStep() === s) {
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.strokeRect(x - 1.5, y + 2.5, STEP_W, ROW_H - 7);
        }
      }
      ctx.globalAlpha = 1;
    });

    rackState = { cols, firstStep, cssW };
  };

  function beatOf(s) { return ((s % 16) + 16) % 16; }

  function stepNotes(pat, chId) {
    const set = new Set();
    const arr = pat.notes[chId];
    if (arr) arr.forEach(n => { set.add(Math.floor(n.step)); });
    return set;
  }

  function getRackScroll(pat, cssW) {
    const fit = Math.floor((cssW - 16 - Math.ceil(pat.length / 16) * BAR_GAP) / STEP_W);
    const cols = Math.min(pat.length, Math.max(8, fit));
    const maxOff = Math.max(0, pat.length - cols);
    const off = UI._rackOffset || 0;
    return { firstStep: Math.min(off, maxOff), cols };
  }

  let _playStepSmooth = -1;
  function rackPlayingStep() {
    const e = UI.engine;
    if (!UI.playing) return -1;
    const pos = Math.max(0, e.currentPosition());
    if (e.mode === 'song') {
      // find which local step inside any clip at this pos matches sel pattern? simpler: song position modulo nothing—show global
      const pat = currentPattern();
      return pat ? Math.floor(pos) % pat.length : -1;
    }
    const pat = currentPattern();
    return pat ? Math.floor(pos) % pat.length : -1;
  }

  function currentPattern() {
    return UI.project.patterns.find(p => p.id === UI.sel.patternId) || null;
  }
  UI.currentPattern = currentPattern;

  // interactions
  function bindRackGrid() {
    const cv = $('#rackGrid');
    let paintMode = null; // true=add, false=remove

    function cellAt(ev) {
      const rect = cv.getBoundingClientRect();
      const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
      if (!rackState || !rackState.cols) return null;
      const r = Math.floor((y - 16) / ROW_H);
      const ch = UI.project.channels[r];
      if (!ch) return null;
      // account for bar gaps
      const pat = currentPattern(); if (!pat) return null;
      let acc = 8;
      for (let s = rackState.firstStep; s < rackState.firstStep + rackState.cols; s++) {
        const w = STEP_W;
        if (x >= acc && x < acc + w - 3 && s < pat.length) return { ch, step: s };
        acc += w + (beatOf(s) === 15 ? BAR_GAP : 0);
      }
      return null;
    }

    cv.addEventListener('pointerdown', function (ev) {
      const hit = cellAt(ev);
      if (!hit) return;
      if (UI.sel.channelId !== hit.ch.id) { UI.buildRack(); }
      const pat = currentPattern();
      const arr = pat.notes[hit.ch.id] = pat.notes[hit.ch.id] || [];
      const idx = arr.findIndex(n => Math.floor(n.step) === hit.step);
      paintMode = idx >= 0 ? false : true;
      applyPaint(pat, hit, arr, paintMode);
      cv.setPointerCapture(ev.pointerId);

      function mv(e2) {
        const h2 = cellAt(e2);
        if (h2 && h2.ch.id === hit.ch.id) applyPaint(currentPattern(), h2, currentPattern().notes[h2.ch.id], paintMode);
        e2.preventDefault();
      }
      function up() { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); if (paintMode !== null) UI.commit('step edit'); paintMode = null; }
      cv.addEventListener('pointermove', mv);
      cv.addEventListener('pointerup', up);
      ev.preventDefault();
    });

    function applyPaint(pat, hit, arr, add) {
      const idx = arr.findIndex(n => Math.floor(n.step) === hit.step);
      if (add && idx < 0) {
        // drum or synth: place at rack key (last used per channel, default C5=72 for melodic, C4=60 drums)
        const key = hit.ch.type === 'drum' ? 60 : (UI._rackKey && UI._rackKey[hit.ch.id]) || 60;
        arr.push({ key, step: hit.step, len: 1, vel: 0.85 });
        UI.mark('piano');
      } else if (!add && idx >= 0) {
        arr.splice(idx, 1);
        UI.mark('piano');
      }
      UI.mark('rack');
    }

    // wheel scrolls steps horizontally when pattern wider than view
    cv.addEventListener('wheel', function (ev) {
      const pat = currentPattern(); if (!pat) return;
      const st = getRackScroll(pat, cv.parentElement.clientWidth - 12);
      if (pat.length <= st.cols) return;
      ev.preventDefault();
      UI._rackOffset = UI.clamp((UI._rackOffset || 0) + (ev.deltaY > 0 ? 4 : -4), 0, pat.length - st.cols);
      UI.mark('rack');
    }, { passive: false });
  }

  /* ---------------- browser panel (instruments) ---------------- */

  const BROWSER = [
    { group: 'Drums', items: [
      { name: 'Kick', sample: 'kick', color: '#e05656' },
      { name: 'Snare', sample: 'snare', color: '#e05656' },
      { name: 'Clap', sample: 'clap', color: '#e08b3a' },
      { name: 'Hat Closed', sample: 'hatClosed', color: '#d8cf4a' },
      { name: 'Hat Open', sample: 'hatOpen', color: '#b9d84a' },
      { name: 'Tom', sample: 'tom', color: '#7bd48f' },
      { name: 'Rim', sample: 'rim', color: '#5fb8a0' }
    ]},
    { group: 'Bass', items: [
      { name: 'Deep Bass', preset: 'deepbass' },
      { name: 'Sub Sine', preset: 'subsine' }
    ]},
    { group: 'Keys & Pads', items: [
      { name: 'Glass Keys', preset: 'glasskeys' },
      { name: 'Velvet Pad', preset: 'velvetpad' },
      { name: 'Warm Keys', preset: 'warmkeys' }
    ]},
    { group: 'Leads & Synths', items: [
      { name: 'Neon Lead', preset: 'neonlead' },
      { name: 'Plain Saw', preset: 'plainsaw' },
      { name: 'Hollow Square', preset: 'hollowsquare' }
    ]}
  ];

  const PRESETS = {
    deepbass: { params: { wave: 'sawtooth', wave2: 'square', wave2Level: 0.5, detune: 4, cutoff: 900, resonance: 9, filterEnv: 1600, attack: 0.002, decay: 0.22, sustain: 0.35, release: 0.12, octave: -1 } },
    subsine: { params: { wave: 'sine', wave2: 'triangle', wave2Level: 0.25, detune: 0, cutoff: 700, resonance: 2, filterEnv: 300, attack: 0.004, decay: 0.4, sustain: 0.5, release: 0.2, octave: -1 } },
    glasskeys: { params: { wave: 'triangle', wave2: 'sine', wave2Level: 0.6, detune: 6, attack: 0.01, decay: 0.5, sustain: 0.25, release: 0.6, cutoff: 6500, resonance: 2, filterEnv: 1200 } },
    velvetpad: { params: { wave: 'sawtooth', wave2: 'sawtooth', wave2Level: 0.8, detune: 14, attack: 0.6, decay: 1.0, sustain: 0.75, release: 1.2, cutoff: 2400, resonance: 3, filterEnv: 800 } },
    warmkeys: { params: { wave: 'square', wave2: 'triangle', wave2Level: 0.4, detune: 8, attack: 0.02, decay: 0.45, sustain: 0.35, release: 0.5, cutoff: 3800, resonance: 4, filterEnv: 1500 } },
    neonlead: { params: { wave: 'square', wave2: 'sawtooth', wave2Level: 0.45, detune: 10, attack: 0.004, decay: 0.25, sustain: 0.45, release: 0.28, cutoff: 4200, resonance: 12, filterEnv: 2600 } },
    plainsaw: { params: { wave: 'sawtooth', wave2: 'sawtooth', wave2Level: 0.3, detune: 6, attack: 0.005, decay: 0.2, sustain: 0.6, release: 0.25, cutoff: 6000, resonance: 3, filterEnv: 1000 } },
    hollowsquare: { params: { wave: 'square', wave2: 'square', wave2Level: 0.5, detune: 12, attack: 0.006, decay: 0.3, sustain: 0.5, release: 0.3, cutoff: 2800, resonance: 8, filterEnv: 1800 } }
  };

  UI.buildBrowser = function () {
    const host = $('#browserList');
    host.innerHTML = '';
    BROWSER.forEach(function (grp) {
      const g = el('div', 'br-group', host);
      const gt = el('div', 'br-group-title', g);
      gt.textContent = grp.group;
      grp.items.forEach(function (item) {
        const it = el('div', 'br-item', g);
        if (item.color) { const d = el('span', 'br-dot', it); d.style.background = item.color; }
        it.textContent += item.name;
        it.addEventListener('click', function () { addInstrument(item); });
      });
    });
  };

  UI.addInstrument = addInstrument;
  function addInstrument(item) {
    const proj = UI.project;
    let ch;
    if (item.sample) ch = NP.makeDrumChannel(item.name, item.sample, item.color, { mixerTrack: nextFreeInsert() });
    else ch = NP.makeSynthChannel(item.name, '#5aa2ff', Object.assign({ mixerTrack: nextFreeInsert() }, PRESETS[item.preset] || {}));
    proj.channels.push(ch);
    UI.sel.channelId = ch.id;
    UI.commit('add ' + item.name);
    UI.toast('Added "' + item.name + '"');
  }

  function nextFreeInsert() {
    const used = new Set(UI.project.channels.map(c => c.mixerTrack));
    for (let i = 1; i < UI.project.mixer.length; i++) if (!used.has(i)) return i;
    return Math.min(63, UI.project.channels.length + 1);
  }

  /* ---------------- boot binding ---------------- */

  // test/debug hook: viewport center of a rack cell
  UI._rackCellCenter = function (step, rowIndex) {
    const cvg = document.getElementById('rackGrid');
    const wrap = cvg.parentElement;
    const rect = wrap.getBoundingClientRect();
    let acc = 8;
    for (let s = (UI._rackOffset || 0); s < step; s++) acc += STEP_W + (((s % 16) + 16) % 16 === 15 ? BAR_GAP : 0);
    return { x: rect.left + acc + (STEP_W - 3) / 2, y: rect.top + 18 + rowIndex * ROW_H + ROW_H / 2 - 2 };
  };

  document.addEventListener('DOMContentLoaded', function () {
    bindRackGrid();
  });

})();
