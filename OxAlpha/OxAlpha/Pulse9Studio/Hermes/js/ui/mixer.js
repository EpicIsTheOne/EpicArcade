/* ============================================================
   Nyx DAW — mixer window: inserts, volume/pan, mute, meters, FX rack
   ============================================================ */
(function () {
  'use strict';
  const UI = window.NyxUI;
  const el = UI.el;

  let host = null;
  let strips = [];           // {fill, peak}
  let peakHold = [];

  const FX_META = {
    eq3:        { label: 'EQ Three', params: { low: 0, mid: 0, high: 0 }, fmt: { low: 'dB', mid: 'dB', high: 'dB' }, range: { low: [-15, 15], mid: [-15, 15], high: [-15, 15] } },
    delay:      { label: 'Delay', params: { time: 0.28, feedback: 0.35, mix: 0.3 }, fmt: { time: 's', feedback: '', mix: '' }, range: { time: [0.01, 1.5], feedback: [0, 0.9], mix: [0, 1] } },
    reverb:     { label: 'Reverb', params: { size: 0.5, mix: 0.28 }, fmt: { size: '', mix: '' }, range: { size: [0.05, 1], mix: [0, 1] } },
    distortion: { label: 'Distortion', params: { drive: 0.3, mix: 1.0 }, fmt: { drive: '', mix: '' }, range: { drive: [0, 1], mix: [0, 1] } },
    compressor: { label: 'Compressor', params: { threshold: -22, ratio: 4, attack: 0.005, release: 0.15 }, fmt: { threshold: 'dB', ratio: ':1', attack: 's', release: 's' }, range: { threshold: [-50, 0], ratio: [1, 20], attack: [0.001, 0.2], release: [0.01, 0.6] } },
    chorus:     { label: 'Chorus', params: { rate: 1.6, depth: 0.004, mix: 0.4 }, fmt: { rate: 'Hz', depth: 's', mix: '' }, range: { rate: [0.1, 6], depth: [0.0005, 0.015], mix: [0, 1] } }
  };
  UI.FX_META = FX_META;

  function applyAllMixerTracks() {
    for (let j = 0; j < UI.project.mixer.length; j++) UI.engine.applyMixerTrack(j);
  }
  UI.applyAllMixerTracks = applyAllMixerTracks;

  UI.buildMixer = function () {
    host = document.getElementById('mixerStrips');
    if (!host) return;
    host.innerHTML = '';
    strips = []; peakHold = [];

    UI.project.mixer.forEach(function (t, i) {
      const isMaster = i === 0;
      const strip = el('div', 'mx-strip' + (isMaster ? ' master' : ''), host);
      strip.dataset.trackIndex = String(i);
      if (UI.sel.mixerTrack === i) strip.classList.add('sel');

      const name = el('div', 'mx-name', strip);
      name.textContent = isMaster ? 'Master' : (t.name || ('Insert ' + i));
      name.title = 'Double-click to rename';

      const knobRow = el('div', 'mx-knobs', strip);
      const kv = UI.knob({
        min: 0, max: 1.25, value: t.volume, default: isMaster ? 0.85 : 0.78, size: 26,
        label: name.textContent + ' volume',
        fmt: v => Math.round(v * 100) + '%',
        onInput: v => { t.volume = v; UI.engine.applyMixerTrack(i); },
        onChange: () => UI.commit('mixer volume')
      });
      const kp = UI.knob({
        min: -1, max: 1, value: t.pan, default: 0, size: 26,
        label: name.textContent + ' pan',
        fmt: v => Math.abs(v) < 0.02 ? 'C' : ((v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100)),
        onInput: v => { t.pan = v; UI.engine.applyMixerTrack(i); },
        onChange: () => UI.commit('mixer pan')
      });
      knobRow.appendChild(kv); knobRow.appendChild(kp);

      const btnRow = el('div', 'mx-btns', strip);
      const muteBtn = el('button', 'mx-mute' + (t.mute ? ' on' : ''), btnRow);
      muteBtn.textContent = 'M'; muteBtn.title = 'Mute';
      const soloBtn = el('button', 'mx-solo' + (t.solo ? ' on' : ''), btnRow);
      soloBtn.textContent = 'S'; soloBtn.title = 'Solo';

      const meter = el('div', 'mx-meter', strip);
      const fill = el('div', 'mx-meter-fill', meter);
      const peak = el('div', 'mx-meter-peak', meter);
      strips.push({ fill, peak });

      muteBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        t.mute = !t.mute;
        muteBtn.classList.toggle('on', t.mute);
        UI.engine.applyMixerTrack(i);
        UI.commit('mixer mute');
      });
      soloBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        t.solo = !t.solo;
        soloBtn.classList.toggle('on', t.solo);
        applyAllMixerTracks();
        UI.commit('mixer solo');
      });

      name.addEventListener('dblclick', function (ev) {
        ev.stopPropagation();
        const n = prompt('Insert name:', t.name);
        if (n != null && n.trim()) {
          t.name = n.trim().slice(0, 24);
          name.textContent = t.name;
          UI.buildRack();
          UI.commit('rename insert');
        }
      });

      strip.addEventListener('click', function (ev) {
        if (ev.target.closest('.knob')) return;
        UI.sel.mixerTrack = i;
        host.querySelectorAll('.mx-strip').forEach(s => s.classList.remove('sel'));
        strip.classList.add('sel');
        openFxRack(i);
      });
    });

    // live meters (called from core frame loop)
    UI.drawMeters = function (active) {
      const e = UI.engine;
      for (let i = 0; i < strips.length; i++) {
        const s = strips[i];
        let lvl = 0;
        try { if (active && e.ctx) lvl = e.readTrack(i); } catch (err) { lvl = 0; }
        const pct = Math.round(UI.clamp(lvl / 1.2, 0, 1) * 100);
        s.fill.style.height = pct + '%';
        s.fill.style.background = lvl > 0.99 ? '#ff5d5d' : (lvl > 0.8 ? '#ffcf5d' : '');
        peakHold[i] = Math.max((peakHold[i] || 0) * 0.94, lvl);
        s.peak.style.bottom = Math.min(98, peakHold[i] / 1.2 * 100) + '%';
      }
    };
  };

  /* ---------------- FX rack window ---------------- */

  function openFxRack(i) {
    const t = UI.project.mixer[i];
    UI.openWindow('win-fx-' + i, (i === 0 ? 'Master' : t.name || ('Insert ' + i)) + ' — FX rack', function (body) {
      buildFxRack(body, i);
    }, 340 + (i % 4) * 36, 130 + (i % 3) * 30);
  }
  UI.openFxRack = openFxRack;

  function buildFxRack(body, i) {
    body.innerHTML = '';
    body.className = 'nw-body fx-rack';

    const head = el('div', 'fx-head', body);
    const list = el('div', 'fx-list', body);
    const addRow = el('div', 'fx-add', body);
    const sel = document.createElement('select');
    sel.className = 'fx-select';
    sel.id = 'fxSel-' + i;
    Object.keys(FX_META).forEach(function (type) {
      const o = document.createElement('option');
      o.value = type; o.textContent = FX_META[type].label;
      sel.appendChild(o);
    });
    const addBtn = el('button', 'btn small', addRow);
    addBtn.textContent = '+ Add effect';
    addRow.appendChild(sel);
    addRow.appendChild(addBtn);

    function trackNow() { return UI.project.mixer[i]; }

    function render() {
      const t = trackNow();
      head.textContent = (i === 0 ? 'Master' : (t.name || 'Insert ' + i)) + ' — effect chain (top → bottom)';
      list.innerHTML = '';
      if (!t.effects.length) {
        const empty = el('div', 'fx-empty', list);
        empty.textContent = 'No effects yet — add one below.';
      }
      t.effects.forEach(function (ef, idx) {
        const row = el('div', 'fx-row' + (ef.enabled === false ? ' disabled' : ''), list);
        const nm = el('span', 'fx-name', row);
        nm.textContent = (idx + 1) + '. ' + FX_META[ef.type].label;
        const spacer = el('span', 'fx-spacer', row);
        const enBtn = el('button', 'mini-btn' + (ef.enabled === false ? ' off' : ''), row);
        enBtn.textContent = ef.enabled === false ? '○' : '●';
        enBtn.title = 'Enable / bypass';
        const rmBtn = el('button', 'mini-btn', row);
        rmBtn.textContent = '✕'; rmBtn.title = 'Remove effect';

        const params = el('div', 'fx-params', list);
        const meta = FX_META[ef.type];
        Object.keys(meta.params).forEach(function (pk) {
          const range = meta.range[pk];
          const k = UI.knob({
            min: range[0], max: range[1], value: ef.params[pk] != null ? ef.params[pk] : meta.params[pk],
            default: meta.params[pk], size: 22, label: pk,
            fmt: function (v) {
              const f = meta.fmt[pk] || '';
              if (f === 'dB') return v.toFixed(1) + 'dB';
              if (f === 's') return v < 0.1 ? Math.round(v * 1000) + 'ms' : v.toFixed(2) + 's';
              if (f === 'Hz') return v.toFixed(1) + 'Hz';
              if (f === ':1') return v.toFixed(1) + ':1';
              return Math.round(v * 100) + '%';
            },
            onInput: function (v) {
              ef.params[pk] = v;
              const nodes = (UI.engine.fxNodes && UI.engine.fxNodes[i]) || [];
              // one instance per type per rack in this build
              const unit = nodes.find(u => u.type === ef.type);
              if (unit && unit.set) unit.set(pk, v);
            },
            onChange: function () { UI.commit('fx param'); }
          });
          params.appendChild(wrapLabeled(k, pk));
        });

        enBtn.addEventListener('click', function () {
          ef.enabled = !(ef.enabled !== false);
          UI.engine.rebuildFx(i);
          UI.commit('fx toggle');
          render();
        });
        rmBtn.addEventListener('click', function () {
          t.effects.splice(idx, 1);
          UI.engine.rebuildFx(i);
          UI.commit('fx remove');
          render();
        });
      });
    }

    addBtn.addEventListener('click', function () {
      const type = sel.value;
      trackNow().effects.push({ type, enabled: true, params: Object.assign({}, FX_META[type].params) });
      UI.engine.rebuildFx(i);
      UI.commit('fx add');
      render();
    });

    render();
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

})();
