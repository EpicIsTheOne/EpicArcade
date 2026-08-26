/* SPECTRA-SPRUN02 — state.js : parameter model, presets, persistence */
(function () {
  'use strict';

  const MARK = 'SPRUN02';

  // ---- parameter definitions -------------------------------------------------
  // fmt: optional value formatter; rnd: [lo,hi] randomize range (undefined = skip)
  const DEFS = [
    { id: 'speed',     label: 'Time Speed',           min: 0,    max: 3,   step: 0.05, def: 1,    group: 'motion', rnd: [0.3, 2.0] },
    { id: 'waveAmt',   label: 'Wave Amount',          min: 0,    max: 1,   step: 0.01, def: 0.12, group: 'warp',   rnd: [0, 0.5] },
    { id: 'waveFreq',  label: 'Wave Frequency',       min: 0.5,  max: 12,  step: 0.1,  def: 3,    group: 'warp',   rnd: [1, 8] },
    { id: 'waveSpeed', label: 'Wave Speed',           min: 0,    max: 4,   step: 0.05, def: 1,    group: 'warp',   rnd: [0.2, 3] },
    { id: 'twirl',     label: 'Twirl (rad)',          min: -3,   max: 3,   step: 0.05, def: 0,    group: 'warp',   rnd: [-1.5, 1.5], fmt: fSigned },
    { id: 'fisheye',   label: 'Fisheye',              min: -1,   max: 1,   step: 0.02, def: 0,    group: 'warp',   rnd: [-0.6, 0.6], fmt: fSigned },
    { id: 'pixelate',  label: 'Pixelate (px)',        min: 0,    max: 64,  step: 1,    def: 0,    group: 'warp',   rnd: null,        fmt: fOffOrInt },
    { id: 'kaleido',   label: 'Kaleidoscope',         min: 0,    max: 8,   step: 1,    def: 0,    group: 'warp',   rnd: null,        fmt: fOffOrSeg },
    { id: 'chroma',    label: 'Chromatic Aberration', min: 0,    max: 1,   step: 0.01, def: 0.18, group: 'color',  rnd: [0, 0.6] },
    { id: 'rgbSplit',  label: 'RGB Split',            min: 0,    max: 1,   step: 0.01, def: 0,    group: 'color',  rnd: [0, 0.4] },
    { id: 'hue',       label: 'Hue Shift (°)',        min: -180, max: 180, step: 1,    def: 0,    group: 'color',  rnd: [-60, 60],   fmt: v => Math.round(v) + '°' },
    { id: 'sat',       label: 'Saturation',           min: 0,    max: 2,   step: 0.01, def: 1,    group: 'color',  rnd: [0.5, 1.7] },
    { id: 'bright',    label: 'Brightness',           min: 0.2,  max: 2,   step: 0.01, def: 1,    group: 'color',  rnd: [0.8, 1.25] },
    { id: 'contrast',  label: 'Contrast',             min: 0.2,  max: 2,   step: 0.01, def: 1,    group: 'color',  rnd: [0.8, 1.4] },
    { id: 'posterize', label: 'Posterize (levels)',   min: 0,    max: 12,  step: 1,    def: 0,    group: 'color',  rnd: null,        fmt: fOffOrInt },
    { id: 'invert',    label: 'Invert',               type: 'toggle', def: false,      group: 'color',  rnd: false },
    { id: 'glow',      label: 'Glow / Bloom',         min: 0,    max: 2,   step: 0.01, def: 0.30, group: 'fx',     rnd: [0, 1.4] },
    { id: 'glowThr',   label: 'Glow Threshold',       min: 0,    max: 1,   step: 0.01, def: 0.55, group: 'fx',     rnd: [0.35, 0.7] },
    { id: 'noise',     label: 'Grain',                min: 0,    max: 1,   step: 0.01, def: 0.07, group: 'fx',     rnd: [0, 0.3] },
    { id: 'scanline',  label: 'Scanlines',            min: 0,    max: 1,   step: 0.01, def: 0,    group: 'fx',     rnd: [0, 0.5] },
    { id: 'vignette',  label: 'Vignette',             min: 0,    max: 1,   step: 0.01, def: 0.28, group: 'fx',     rnd: [0.1, 0.6] },
  ];

  function fSigned(v) { return (v > 0 ? '+' : '') + Number(v).toFixed(2); }
  function fOffOrInt(v) { return v < 1 ? 'OFF' : String(Math.round(v)); }
  function fOffOrSeg(v) { return v < 2 ? 'OFF' : Math.round(v) + ' seg'; }

  const SRC_MODES = [
    { id: 'image', label: 'Image' },
    { id: 'plasma', label: 'Plasma' },
    { id: 'nebula', label: 'Nebula' },
    { id: 'tunnel', label: 'Tunnel' },
    { id: 'metaballs', label: 'Metaballs' },
  ];

  // ---- built-in presets -------------------------------------------------------
  const BUILTINS = [
    { name: 'Signature Drift', src: 'plasma', p: {} },
    {
      name: 'VHS Tape', src: null, p: {
        rgbSplit: .38, chroma: .32, scanline: .55, noise: .28, vignette: .5,
        sat: 1.15, waveAmt: .06, waveFreq: 2, speed: .9
      }
    },
    {
      name: 'Chrome Melt', src: null, p: {
        twirl: 1.35, glow: 1.1, glowThr: .4, sat: 1.5, contrast: 1.25,
        waveAmt: .3, waveFreq: 6, fisheye: .35
      }
    },
    {
      name: '8-Bit Dream', src: null, p: {
        pixelate: 22, posterize: 5, sat: 1.35, glow: .5, noise: .04,
        vignette: .35, speed: .8
      }
    },
    {
      name: 'Nebula Core', src: 'nebula', p: {
        glow: 1.3, glowThr: .5, vignette: .6, hue: -25, sat: 1.25, speed: .6, waveAmt: .05, chroma: .07
      }
    },
    {
      name: 'Tunnel Vision', src: 'tunnel', p: {
        chroma: .45, scanline: .3, twirl: .5, vignette: .45, speed: 1.2
      }
    },
    {
      name: 'Kaleido Bloom', src: null, p: {
        kaleido: 6, twirl: .9, glow: 1.2, sat: 1.6, waveAmt: .18, fisheye: .25
      }
    },
    {
      name: 'Deep Fried', src: null, p: {
        sat: 1.9, contrast: 1.6, noise: .3, posterize: 6, glow: .8, chroma: .5, rgbSplit: .2
      }
    },
  ];

  // ---- live state --------------------------------------------------------------
  const state = {
    src: 'plasma',
    playing: true,
    params: {},
  };
  DEFS.forEach(d => { state.params[d.id] = d.def; });

  let listeners = [];
  function emit() { listeners.forEach(fn => fn()); }
  function subscribe(fn) { listeners.push(fn); }

  function defaults() {
    const p = {};
    DEFS.forEach(d => { p[d.id] = d.def; });
    return { src: 'plasma', params: p };
  }

  function applyPresetData(data) {
    if (!data || typeof data !== 'object') return;
    if (SRC_MODES.some(m => m.id === data.src)) state.src = data.src;
    const p = data.params || {};
    DEFS.forEach(d => {
      if (d.type === 'toggle') {
        state.params[d.id] = !!p[d.id];
      } else if (typeof p[d.id] === 'number' && isFinite(p[d.id])) {
        state.params[d.id] = clamp(p[d.id], d.min, d.max);
      } else {
        state.params[d.id] = d.def;
      }
    });
    emit();
  }

  function serialize() {
    return { v: 1, src: state.src, params: { ...state.params } };
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function randomize() {
    DEFS.forEach(d => {
      if (!d.rnd && d.rnd !== false) return;
      if (d.type === 'toggle') { state.params[d.id] = Math.random() < 0.12; return; }
      if (!Array.isArray(d.rnd)) {
        // chance-based specials (pixelate / posterize)
        if (d.id === 'pixelate') state.params[d.id] = Math.random() < 0.22 ? 8 + Math.floor(Math.random() * 26) : 0;
        else if (d.id === 'posterize') state.params[d.id] = Math.random() < 0.15 ? 3 + Math.floor(Math.random() * 6) : 0;
        else if (d.id === 'kaleido') state.params[d.id] = Math.random() < 0.25 ? 3 + Math.floor(Math.random() * 6) : 0;
        else if (d.type !== 'toggle') state.params[d.id] = d.def;
        return;
      }
      const lo = d.rnd[0], hi = d.rnd[1];
      state.params[d.id] = clamp(lo + Math.random() * (hi - lo), d.min, d.max);
    });
    emit();
  }

  // ---- user preset persistence ---------------------------------------------------
  const LS_PRESETS = 'spectra-sprun02-presets-v1';
  const LS_SESSION = 'spectra-sprun02-session-v1';

  function loadUserPresets() {
    try { return JSON.parse(localStorage.getItem(LS_PRESETS)) || []; }
    catch (e) { return []; }
  }
  function saveUserPresets(list) {
    try { localStorage.setItem(LS_PRESETS, JSON.stringify(list)); } catch (e) { /* private mode */ }
  }
  function saveSession() {
    try { localStorage.setItem(LS_SESSION, JSON.stringify(serialize())); } catch (e) { /* ignore */ }
  }
  function restoreSession() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_SESSION));
      if (s && s.v === 1) applyPresetData(s);
    } catch (e) { /* ignore */ }
  }
  function clearSession() {
    try { localStorage.removeItem(LS_SESSION); } catch (e) { /* ignore */ }
  }

  // ---- exports --------------------------------------------------------------------
  window.SPStore = {
    MARK, DEFS, SRC_MODES, BUILTINS, state,
    subscribe, emit, defaults, applyPresetData, serialize, randomize,
    loadUserPresets, saveUserPresets, saveSession, restoreSession, clearSession,
  };
})();
