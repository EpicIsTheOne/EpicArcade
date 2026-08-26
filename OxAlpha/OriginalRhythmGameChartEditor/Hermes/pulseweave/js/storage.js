/* ============================================================
   PULSEWEAVE · storage.js — settings, records, edited charts
   ============================================================ */
window.PW = window.PW || {};
PW.Store = (function () {
  'use strict';
  const KEY = 'pulseweave.v1';
  let data = { settings: null, best: {}, overrides: {} };

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = Object.assign(data, JSON.parse(raw));
  } catch (e) { /* private mode etc. */ }

  function flush() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  // ---- settings ----
  const DEFAULT_SETTINGS = { speed: 820, volume: 85, offsetMs: 0 };
  function settings() { return Object.assign({}, DEFAULT_SETTINGS, data.settings || {}); }
  function saveSettings(patch) { data.settings = Object.assign(settings(), patch); flush(); }

  // ---- records ----
  function best(chartId) { return data.best[chartId] || null; }
  function setBest(chartId, rec) {
    const cur = data.best[chartId];
    if (!cur || rec.score > cur.score) { data.best[chartId] = rec; flush(); return true; }
    flush(); return false;
  }

  // ---- edited-chart overrides ("editor modifies the chart the game plays") ----
  function override(chartId) { return data.overrides[chartId] || null; }
  function hasOverride(chartId) { return !!data.overrides[chartId]; }
  function saveOverride(chart) {
    data.overrides[chart.id] = JSON.parse(JSON.stringify(chart)); flush();
  }
  function clearOverride(chartId) { delete data.overrides[chartId]; flush(); }

  return { settings, saveSettings, best, setBest, override, hasOverride, saveOverride, clearOverride };
})();
