/* SPX-RUN02-9F2 :: schema.js — parameter definitions, groups, presets.
 * Every slider/chip/preset/randomize action is driven by this single table. */
(function () {
  'use strict';

  // rand: 'bias' => skewed toward min (interesting but rarely mushy),
  //       'center' => gaussian-ish around the default.
  var PARAMS = [
    // ---- Geometry ----
    { id: 'pixel',     label: 'Pixelate',       group: 'Geometry', min: 1,   max: 80,  step: 0.5, def: 1,    rand: 'bias',   fmt: function (v) { return v <= 1.5 ? 'off' : Math.round(v) + 'px'; } },
    { id: 'waveAmt',   label: 'Wave amount',    group: 'Geometry', min: 0,   max: 0.15,step: 0.001,def: 0,   rand: 'bias',   fmt: f3 },
    { id: 'waveFreq',  label: 'Wave frequency', group: 'Geometry', min: 0.2, max: 8,   step: 0.05,def: 2,    rand: 'center', fmt: f1 },
    { id: 'waveSpeed', label: 'Wave speed',     group: 'Geometry', min: -3,  max: 3,   step: 0.05,def: 1,    rand: 'center', fmt: f2 },
    { id: 'swirl',     label: 'Swirl',          group: 'Geometry', min: -360,max: 360, step: 1,   def: 0,    rand: 'biasS',  fmt: function (v) { return Math.round(v) + '°'; } },

    // ---- Chromatic ----
    { id: 'split',     label: 'RGB split',      group: 'Chromatic',min: 0,   max: 60,  step: 0.5, def: 0,    rand: 'bias',   fmt: px },
    { id: 'splitAng',  label: 'Split angle',    group: 'Chromatic',min: 0,   max: 180, step: 1,   def: 90,   rand: 'center', fmt: deg },
    { id: 'hue',       label: 'Hue shift',      group: 'Chromatic',min: -180,max: 180, step: 1,   def: 0,    rand: 'center', fmt: deg },
    { id: 'sat',       label: 'Saturation',     group: 'Chromatic',min: 0,   max: 2,   step: 0.01,def: 1.10, rand: 'center', fmt: f2 },
    { id: 'bright',    label: 'Brightness',     group: 'Chromatic',min: 0.2, max: 2,   step: 0.01,def: 1,    rand: 'center', fmt: f2 },
    { id: 'contrast',  label: 'Contrast',       group: 'Chromatic',min: 0.2, max: 2,   step: 0.01,def: 1.02, rand: 'center', fmt: f2 },

    // ---- Film ----
    { id: 'noise',     label: 'Grain',          group: 'Film',     min: 0,   max: 0.6, step: 0.005,def: 0.03,rand: 'bias',   fmt: f3 },
    { id: 'noiseSize', label: 'Grain size',     group: 'Film',     min: 0.5, max: 6,   step: 0.1, def: 1.4,  rand: 'center', fmt: f1 },
    { id: 'scanInt',   label: 'Scanlines',      group: 'Film',     min: 0,   max: 0.9, step: 0.01,def: 0,    rand: 'bias',   fmt: pct },
    { id: 'scanCnt',   label: 'Line count',     group: 'Film',     min: 40,  max: 800, step: 2,   def: 240,  rand: 'center', fmt: int },
    { id: 'scanSpd',   label: 'Scan drift',     group: 'Film',     min: -20, max: 20,  step: 0.5, def: 0,    rand: 'center', fmt: f1 },
    { id: 'vigAmt',    label: 'Vignette',       group: 'Film',     min: 0,   max: 1,   step: 0.01,def: 0.25, rand: 'bias',   fmt: pct },
    { id: 'vigRad',    label: 'Vignette falloff',group:'Film',     min: 0.2, max: 1,   step: 0.01,def: 0.55, rand: 'center', fmt: pct },

    // ---- Glow ----
    { id: 'bloomAmt',  label: 'Bloom',          group: 'Glow',     min: 0,   max: 2,   step: 0.01,def: 0.55, rand: 'bias',   fmt: f2 },
    { id: 'bloomRad',  label: 'Bloom radius',   group: 'Glow',     min: 0,   max: 1,   step: 0.01,def: 0.35, rand: 'center', fmt: pct },
    { id: 'bloomThr',  label: 'Threshold',      group: 'Glow',     min: 0,   max: 1,   step: 0.01,def: 0.55, rand: 'center', fmt: pct },

    // ---- Switches (rendered as chips, stored as 0/1 like every other param) ----
    { id: 'mirror',    label: 'Mirror',         group: 'Switches', min: 0, max: 1, step: 1, def: 0, toggle: true, randOn: 0.40 },
    { id: 'invert',    label: 'Invert',         group: 'Switches', min: 0, max: 1, step: 1, def: 0, toggle: true, randOn: 0.30 },
    { id: 'freeze',    label: 'Freeze time',    group: 'Switches', min: 0, max: 1, step: 1, def: 0, toggle: true, randOn: 0.12 }
  ];

  var GROUPS = ['Geometry', 'Chromatic', 'Film', 'Glow', 'Switches'];

  var DEFAULTS = {};
  PARAMS.forEach(function (p) { DEFAULTS[p.id] = p.def; });

  // Built-in presets: full param sets = DEFAULTS overridden below.
  var PRESETS = [
    { name: 'Signature Bloom', params: {} },   // pure defaults
    { name: 'Clean Slate', params: {
        sat: 1, contrast: 1, noise: 0, vigAmt: 0, bloomAmt: 0, waveAmt: 0, swirl: 0,
        split: 0, scanInt: 0, pixel: 1, mirror: 0, invert: 0 } },
    { name: 'VHS Tape', params: {
        waveAmt: 0.004, waveFreq: 1.4, waveSpeed: 1.6,
        split: 7, splitAng: 88, sat: 0.85, bright: 1.04, contrast: 1.08,
        noise: 0.16, noiseSize: 1.8, scanInt: 0.32, scanCnt: 220, scanSpd: 3,
        vigAmt: 0.42, vigRad: 0.5, bloomAmt: 0.25, bloomThr: 0.6 } },
    { name: 'CRT Arcade', params: {
        pixel: 5, split: 2.5, sat: 1.25, contrast: 1.15,
        scanInt: 0.45, scanCnt: 380, vigAmt: 0.3,
        bloomAmt: 0.5, bloomThr: 0.62, bloomRad: 0.25 } },
    { name: 'Dream Bloom', params: {
        bloomAmt: 1.5, bloomRad: 0.7, bloomThr: 0.32, sat: 1.35, bright: 1.06,
        waveAmt: 0.010, waveFreq: 0.7, waveSpeed: 0.6, vigAmt: 0.28 } },
    { name: 'Mosaic Drift', params: {
        pixel: 24, mirror: 1, waveAmt: 0.012, waveFreq: 1.1, waveSpeed: 1,
        bloomAmt: 0.45, bloomThr: 0.5, sat: 1.2 } },
    { name: 'Acid Melt', params: {
        swirl: 210, waveAmt: 0.035, waveFreq: 3.2, waveSpeed: 2.4,
        hue: -20, sat: 1.7, bright: 1.05, bloomAmt: 0.7, bloomThr: 0.45, noise: 0.09 } },
    { name: 'Noir Scan', params: {
        sat: 0, contrast: 1.4, bright: 1.02, noise: 0.22, noiseSize: 1.2,
        scanInt: 0.38, scanCnt: 170, vigAmt: 0.6, vigRad: 0.48, bloomAmt: 0.2 } }
  ];

  // Procedural sources (index maps to shader branch).
  var PROCEDURALS = [
    { idx: 1, name: 'Plasma' },
    { idx: 2, name: 'Nebula' },
    { idx: 3, name: 'Tunnel' },
    { idx: 4, name: 'Liquid Metal' }
  ];

  function f1(v) { return v.toFixed(1); }
  function f2(v) { return v.toFixed(2); }
  function f3(v) { return v.toFixed(3); }
  function px(v) { return v <= 0.2 ? 'off' : Math.round(v) + 'px'; }
  function deg(v) { return Math.round(v) + '°'; }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function int(v) { return String(Math.round(v)); }

  window.SPX_SCHEMA = {
    ID: 'SPX-RUN02-9F2',
    PARAMS: PARAMS,
    GROUPS: GROUPS,
    DEFAULTS: DEFAULTS,
    PRESETS: PRESETS,
    PROCEDURALS: PROCEDURALS
  };
})();
