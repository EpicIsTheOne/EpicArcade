/* PULSE-9 UI: Mixer — strips, faders, meters, FX slots */
'use strict';
(function () {
  const U = window.P9UI;
  const MX = window.P9Mixer = {};
  let app = null;

  MX.init = function (a) { app = a; };

  /** Ensure project.mixerStrips exists & matches channels' routing. */
  MX.ensureStrips = function () {
    const proj = app.project;
    if (!Array.isArray(proj.mixerStrips)) proj.mixerStrips = [];
    const ensure = idx => {
      let ms = proj.mixerStrips.find(s => s.index === idx);
      if (!ms) {
        ms = { index: idx, name: idx === 0 ? 'Master' : 'Insert ' + idx, volume: idx === 0 ? proj.masterVolume : 0.85, pan: 0, muted: false, solo: false, fx: [] };
        proj.mixerStrips.push(ms);
        proj.mixerStrips.sort((a, b) => a.index - b.index);
      }
      return ms;
    };
    ensure(0);
    const used = new Set([0]);
    for (const c of proj.channels) used.add(U.clamp(c.mixer | 0, 0, 31));
    for (const idx of Array.from(used).sort((a, b) => a - b)) if (idx > 0) ensure(idx);
    return proj.mixerStrips;
  };

  MX.render = function () {
    const host = document.getElementById('mixer-body');
    const strips = MX.ensureStrips();
    host.innerHTML = '';
    const maxIdx = Math.max(0, ...strips.map(s => s.index));
    for (let i = 0; i <= maxIdx; i++) {
      const ms = strips.find(s => s.index === i);
      if (!ms) { host.append(U.el('div', { class: 'strip', style: 'visibility:hidden' })); continue; }
      host.append(buildStrip(ms));
    }
    const selMs = app.selectedStrip != null ? app.selectedStrip : 0;
    const lbl = document.getElementById('mix-sel-lbl');
    const sel = strips.find(s => s.index === selMs);
    lbl.textContent = sel ? sel.name.toUpperCase() : 'MASTER';
  };

  function buildStrip(ms) {
    const sel = (app.selectedStrip != null ? app.selectedStrip : 0) === ms.index;
    const el = U.el('div', { class: 'strip' + (sel ? ' sel' : '') + (ms.index === 0 ? ' master' : ''), dataset: { strip: String(ms.index) } });

    const name = U.el('div', { class: 'strip-name', title: 'Click to select · double-click to rename' }, ms.name);
    name.addEventListener('dblclick', e => {
      e.stopPropagation();
      U.promptModal({ title: 'Rename mixer strip', label: 'Name:', value: ms.name }).then(v => {
        if (v) { app.commit('rename strip'); ms.name = v.slice(0, 16); MX.render(); app.autosave(); }
      });
    });

    // mute / solo LEDs
    const leds = U.el('div', { class: 'strip-leds' });
    const muteBtn = U.el('button', { class: 'led-btn' + (ms.muted ? ' mute-on' : ''), title: 'Mute strip' });
    muteBtn.addEventListener('click', e => {
      e.stopPropagation(); app.commit('mute strip'); ms.muted = !ms.muted; app.applyMixAudio(); MX.render();
    });
    const soloBtn = U.el('button', { class: 'led-btn' + (ms.solo ? ' solo-on' : ''), title: 'Solo strip' });
    soloBtn.addEventListener('click', e => {
      e.stopPropagation(); app.commit('solo strip'); ms.solo = !ms.solo; app.applyMixAudio(); MX.render();
    });
    leds.append(muteBtn, soloBtn);

    // fx slots (max 5 shown)
    const fxs = U.el('div', { class: 'strip-fx' });
    for (let slot = 0; slot < 5; slot++) {
      const fx = (ms.fx || [])[slot];
      const slotEl = U.el('button', { class: 'fx-slot' + (fx ? ' has' : ''), title: fx ? fx.type + ' — click to edit' : 'empty slot — click to add effect' },
        fx ? fx.type : '· fx ·');
      slotEl.addEventListener('click', e => {
        e.stopPropagation();
        app.openFxEditor(ms.index, slot);
      });
      fxs.append(slotEl);
    }

    // pan knob
    const panK = U.knob({
      value: ms.pan, min: -1, max: 1, size: 34, label: 'PAN', defValue: 0,
      fmt: v => Math.abs(v) < 0.02 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100),
      onInput: v => { ms.pan = v; app.applyMixAudio(); },
    });
    panK.el.classList.add('knob-mini');

    // fader + meter side by side
    const fz = U.el('div', { class: 'fader-zone' });
    const meter = U.el('div', { class: 'meter' });
    const fill = U.el('div', { class: 'meter-fill' });
    const peak = U.el('div', { class: 'meter-peak', style: 'bottom:100%' });
    meter.append(fill, peak);
    const fd = U.fader({
      value: ms.volume, min: 0, max: 1.25,
      onInput: v => { ms.volume = v; if (ms.index === 0) app.project.masterVolume = v; app.applyMixAudio(); dbLbl.textContent = U.fmtDb(v); },
      height: 150,
    });
    fz.append(fd.el, meter);
    const dbLbl = U.el('div', { class: 'strip-db' }, U.fmtDb(ms.volume));

    el.append(name, leds, fxs, panK.el, fz, dbLbl);
    el.addEventListener('click', () => { app.selectedStrip = ms.index; MX.render(); });
    el.dataset.role = 'strip';

    // meter refs for the animation loop
    el._meterFill = fill; el._meterPeak = peak; el._stripIndex = ms.index;
    MX._meters = MX._meters || {};
    MX._meters[ms.index] = { fill, peak, level: 0, holdV: 0, holdT: 0 };
    return el;
  };

  /** Called each animation frame with {stripIndex: level0to1}. */
  MX.updateMeters = function (levels) {
    if (!MX._meters) return;
    const now = performance.now();
    for (const k of Object.keys(MX._meters)) {
      const m = MX._meters[k];
      const lv = levels[k] || 0;
      m.level = lv;
      const pct = U.clamp(Math.sqrt(lv) * 100, 0, 100);
      m.fill.style.height = pct.toFixed(1) + '%';
      if (lv >= m.holdV || now - m.holdT > 900) { m.holdV = lv; m.holdT = now; }
      m.peak.style.bottom = U.clamp(Math.sqrt(m.holdV) * 100, 0, 100).toFixed(1) + '%';
      m.peak.style.opacity = now - m.holdT > 900 ? '0.25' : '0.8';
    }
  };

  MX.resetMeters = function () {
    if (!MX._meters) return;
    for (const k of Object.keys(MX._meters)) {
      MX._meters[k].level = 0; MX._meters[k].holdV = 0;
      MX._meters[k].fill.style.height = '0%';
      MX._meters[k].peak.style.bottom = '0%';
    }
  };
})();
