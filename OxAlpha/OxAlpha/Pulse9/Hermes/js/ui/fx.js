/* PULSE-9 UI: FX editor (floating panel) */
'use strict';
(function () {
  const U = window.P9UI;
  const FX = window.P9Fx = {};
  let app = null;
  FX.init = a => { app = a; };

  FX.showAddMenu = function (stripIndex, slot, x, y) {
    const items = P9.FX_LIST.map(type => ({
      label: P9.FX_DEFS[type].label,
      action: () => {
        app.commit('add fx');
        const ms = app.project.mixerStrips.find(s => s.index === stripIndex);
        if (!ms) return;
        ms.fx = ms.fx || [];
        ms.fx[slot] = { type, params: Object.assign({}, P9.FX_DEFS[type].defaults) };
        app.rebuildAudio();
        app.openFxEditor(stripIndex, slot);
      },
    }));
    U.menu(items, x, y);
  };

  FX.show = function (stripIndex, slot) {
    const ms = app.project.mixerStrips.find(s => s.index === stripIndex);
    if (!ms || !ms.fx || !ms.fx[slot]) return;
    const fx = ms.fx[slot];
    const def = P9.FX_DEFS[fx.type];
    if (!def) return;
    const panel = document.getElementById('fx-panel');
    const body = document.getElementById('fx-body');
    document.getElementById('fx-title').textContent =
      def.label.toUpperCase() + ' · ' + (stripIndex === 0 ? 'MASTER' : 'INSERT ' + stripIndex);
    panel.hidden = false;
    panel.style.left = '560px';
    panel.style.top = '96px';
    document.getElementById('fx-remove').onclick = () => {
      app.commit('remove fx');
      ms.fx.splice(slot, 1);
      app.rebuildAudio();
      FX.hide();
      app.refreshAll();
    };

    body.innerHTML = '';
    const g = U.el('div', { class: 'knob-grid' });
    const fmtFor = {
      time: v => (v * 1000).toFixed(0) + 'ms',
      feedback: v => (v * 100).toFixed(0) + '%',
      mix: v => (v * 100).toFixed(0) + '%',
      size: v => (v * 100).toFixed(0) + '%',
      damp: v => (v * 100).toFixed(0) + '%',
      cutoff: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0),
      resonance: v => v.toFixed(1),
      drive: v => (v * 100).toFixed(0) + '%',
      tone: v => (v * 100).toFixed(0) + '%',
      level: v => (v * 100).toFixed(0) + '%',
      threshold: v => v.toFixed(0) + 'dB',
      ratio: v => v.toFixed(1) + ':1',
      attack: v => (v * 1000).toFixed(1) + 'ms',
      release: v => (v * 1000).toFixed(0) + 'ms',
      rate: v => v.toFixed(2) + 'Hz',
      depth: v => (v * 1000).toFixed(1) + 'ms',
    };
    const ranges = {
      time: [0.02, 2], feedback: [0, 0.92], mix: [0, 1], size: [0.05, 1], damp: [0, 1],
      cutoff: [60, 18000], resonance: [0.1, 24], drive: [0, 1], tone: [0, 1], level: [0, 1.5],
      threshold: [-60, 0], ratio: [1, 20], attack: [0.001, 0.5], release: [0.02, 1],
      rate: [0.1, 8], depth: [0, 0.02],
    };
    for (const key of Object.keys(def.defaults)) {
      if (key === 'type') continue;
      const isSelect = key === 'type';
      const r = ranges[key] || [0, 1];
      g.append(U.knob({
        value: fx.params[key], min: r[0], max: r[1],
        curve: key === 'cutoff' || key === 'time' ? 'exp' : 'lin',
        label: key.toUpperCase(), defValue: def.defaults[key],
        fmt: fmtFor[key] || (v => v.toFixed(2)),
        onInput: v => {
          app.commitOnce('fx ' + key);
          fx.params[key] = v;
          app.updateFxParam(stripIndex, slot);
        },
      }).el);
    }
    if (fx.type === 'filter') {
      // replace 'resonance' knob label style; add type selector
      g.append(U.el('div', { class: 'knob-item' }, U.el('div', { class: 'k-lbl' }, 'SHAPE'),
        (() => {
          const s = U.el('select');
          for (const t of ['lowpass', 'highpass', 'bandpass']) {
            const o = U.el('option', { value: t }, t);
            if (fx.params.type === t) o.selected = true;
            s.append(o);
          }
          s.addEventListener('change', () => { app.commit('fx type'); fx.params.type = s.value; app.updateFxParam(stripIndex, slot); });
          return s;
        })()));
    }
    body.append(g);
    body.append(U.el('div', { class: 'hint-line' }, 'Changes apply live to the audio graph.'));
  };

  FX.hide = function () { document.getElementById('fx-panel').hidden = true; };
})();
